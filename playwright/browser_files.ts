import fs from 'node:fs'
import fsExtra from 'fs-extra'
import path from 'node:path'
import {copyFile, files, inside, main, readJson, relative} from '../tools/files.js'

function declared(inputs: string[]) { return inputs.flatMap(files) }
function copyBundle(inputs: string[], output: string) {
  const all = declared(inputs)
  const executables = all.filter(file => path.basename(file) === 'chrome-headless-shell')
  if (executables.length !== 1) throw new Error('chromium must contain exactly one chrome-headless-shell executable')
  const root = path.dirname(executables[0])
  for (const file of all) if (inside(root, file)) copyFile(file, path.join(output, path.relative(root, file)))
}
export function checkElfArch(file: string, arch: string) {
  const fd = fs.openSync(file, 'r')
  const header = Buffer.alloc(20)
  try { fs.readSync(fd, header, 0, 20, 0) } finally { fs.closeSync(fd) }
  if (!header.subarray(0, 6).equals(Buffer.from([127, 69, 76, 70, 2, 1])) ||
      header.readUInt16LE(18) !== ({x64: 62, arm64: 183} as Record<string, number>)[arch])
    throw new Error(`${path.basename(file)} must be a Linux ${arch} ELF64 executable`)
}
export function assemble(manifest: any, output: string) {
  if (manifest.mode === 'ffmpeg-cache') {
    const helpers = readJson(path.join(manifest.core, 'browsers.json')).browsers.filter((entry: any) => entry.name === 'ffmpeg')
    if (helpers.length !== 1 || typeof helpers[0].revision !== 'string' || !/^\d+$/.test(helpers[0].revision) || helpers[0].revisionOverrides != null)
      throw new Error('Playwright must declare one platform-independent FFmpeg revision')
    const executable = path.join(manifest.runtime, relative(manifest.ffmpeg))
    const target = path.join(output, 'ffmpeg-' + helpers[0].revision, 'ffmpeg-linux')
    copyFile(executable, target)
    fs.chmodSync(target, 0o755)
  } else if (manifest.mode === 'linux') {
    fsExtra.copySync(manifest.system, output, {dereference: true})
    function writable(dir: string) {
      fs.chmodSync(dir, 0o755)
      for (const entry of fs.readdirSync(dir, {withFileTypes: true}))
        if (entry.isDirectory()) writable(path.join(dir, entry.name))
    }
    writable(output)
    if (fs.existsSync(path.join(output, 'chromium')) || fs.existsSync(path.join(output, 'bin/node')))
      throw new Error('system preset must not contain Chromium or Node')
    copyBundle(manifest.chromium, path.join(output, 'chromium'))
    copyFile(manifest.node, path.join(output, 'bin/node'))
    fs.chmodSync(path.join(output, 'bin/node'), 0o755)
    if (manifest.ffmpeg?.length) {
      const helpers = declared(manifest.ffmpeg).filter(file => path.basename(file) === 'ffmpeg-linux')
      if (helpers.length !== 1) throw new Error('ffmpeg must contain exactly one ffmpeg-linux executable')
      copyFile(helpers[0], path.join(output, 'bin/ffmpeg-linux'))
      fs.chmodSync(path.join(output, 'bin/ffmpeg-linux'), 0o755)
    }
    for (const [index, font] of (manifest.fonts || []).entries()) {
      const target = path.join(output, 'fonts/custom', String(index))
      if (fs.statSync(font).isDirectory()) fsExtra.copySync(font, target, {dereference: true})
      else copyFile(font, path.join(target, path.basename(font)))
    }
    const arch = manifest.arch || 'x64'
    const loader = ({x64: 'lib/ld-linux-x86-64.so.2', arm64: 'lib/ld-linux-aarch64.so.1'} as Record<string, string>)[arch]
    if (!loader) throw new Error(`Unsupported runtime architecture: ${arch}`)
    for (const required of [loader, 'bin/bash', 'etc/fonts/fonts.conf'])
      if (!fs.existsSync(path.join(output, required)) || !fs.statSync(path.join(output, required)).isFile())
        throw new Error(`system preset is missing ${required}`)
    for (const binary of [loader, 'bin/bash', 'bin/node', 'chromium/chrome-headless-shell', ...(manifest.ffmpeg?.length ? ['bin/ffmpeg-linux'] : [])])
      checkElfArch(path.join(output, binary), arch)
  } else {
    const browsers = Object.fromEntries(readJson(path.join(manifest.core, 'browsers.json')).browsers.map((entry: any) => [entry.name, entry])) as Record<string, any>
    const chromium = browsers['chromium-headless-shell'], ffmpeg = browsers.ffmpeg
    if (Object.keys(chromium.revisionOverrides || {}).length || Object.keys(ffmpeg.revisionOverrides || {}).length)
      throw new Error('Platform-specific browser revision overrides need an updated installation helper')
    copyBundle(manifest.chromium, path.join(output, 'chromium_headless_shell-' + chromium.revision, 'chrome-headless-shell-' + manifest.platform))
    const helpers = declared(manifest.ffmpeg).filter(file => path.basename(file) === (manifest.platform === 'linux64' ? 'ffmpeg-linux' : 'ffmpeg-mac'))
    if (helpers.length !== 1) throw new Error('ffmpeg must contain exactly one executable for the selected platform')
    const target = path.join(output, 'ffmpeg-' + ffmpeg.revision, path.basename(helpers[0]))
    copyFile(helpers[0], target)
    fs.chmodSync(target, 0o755)
  }
}
main(import.meta.url, () => assemble(readJson(process.argv[2]), process.argv[3]))
