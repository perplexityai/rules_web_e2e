// Prototype: invokes actiond's real runner without its VM, REAPI or actiondfs.
const std = @import("std");
const runner = @import("action_runner.zig");
const cas = @import("cas.zig");

pub fn main(init: std.process.Init) !void {
    const io = init.io;
    const allocator = init.arena.allocator();
    const args = try init.minimal.args.toSlice(allocator);
    if (args.len < 4) return error.ExpectedRootCasAndCommand;
    var dir = try std.Io.Dir.openDirAbsolute(io, args[2], .{});
    defer dir.close(io);
    const mounts = [_]runner.BindMount{.{
        .source = try allocator.dupeZ(u8, "/dev/null"),
        .target = try std.fmt.allocPrintSentinel(allocator, "{s}/dev/null", .{args[1]}, 0),
        .read_only = false,
    }};
    var outcome = try runner.runCommandWithOptions(io, allocator, cas.Store.init(dir), .{
        .arguments = args[3..],
        .environment_variables = &.{
            .{ .name = "HOME", .value = "/tmp" },
            .{ .name = "TMPDIR", .value = "/tmp" },
            .{ .name = "LANG", .value = "C.UTF-8" },
            .{ .name = "TZ", .value = "UTC" },
            .{ .name = "FONTCONFIG_PATH", .value = "/workspace/runtime/etc/fonts" },
            .{ .name = "LD_LIBRARY_PATH", .value = "/workspace/runtime/lib" },
        },
    }, .{
        .chroot_dir = args[1],
        .chroot_cwd = "/workspace",
        .bind_mounts = &mounts,
        .timeout_ns = 90 * std.time.ns_per_s,
    });
    defer outcome.deinit(allocator);
    std.debug.print("stdout:\n{s}\nstderr:\n{s}\nstatus: {any}\n", .{ outcome.stdout, outcome.stderr, outcome.status });
    switch (outcome.status) {
        .exited => |code| if (code != 0) std.process.exit(code),
        else => return error.CommandFailed,
    }
}
