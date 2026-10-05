import fs from 'node:fs'
import path from 'node:path'
import {main, readJson, relative} from '../tools/files.js'

export interface Layout {files: {source: string; destination: string}[]; executables: string[]}
export function checkElfArch(file: string, arch: string) {
  const fd = fs.openSync(file, 'r'), header = Buffer.alloc(20)
  try { fs.readSync(fd, header, 0, 20, 0) } finally { fs.closeSync(fd) }
  if (!header.subarray(0, 6).equals(Buffer.from([127, 69, 76, 70, 2, 1])) ||
      header.readUInt16LE(18) !== ({x64: 62, arm64: 183} as Record<string, number>)[arch])
    throw new Error(`${path.basename(file)} must be a Linux ${arch} ELF64 executable`)
}
export function validateLinux(manifest: any) {
  if (fs.existsSync(path.join(manifest.system, 'chromium')) || fs.existsSync(path.join(manifest.system, 'bin/node')))
    throw new Error('system preset must not contain Chromium or Node')
  const arch = manifest.arch || 'x64'
  const loader = ({x64: 'lib/ld-linux-x86-64.so.2', arm64: 'lib/ld-linux-aarch64.so.1'} as Record<string, string>)[arch]
  if (!loader) throw new Error(`Unsupported runtime architecture: ${arch}`)
  for (const required of [loader, 'bin/bash', 'etc/fonts/fonts.conf'])
    if (!fs.existsSync(path.join(manifest.system, required)) || !fs.statSync(path.join(manifest.system, required)).isFile())
      throw new Error(`system preset is missing ${required}`)
  for (const name of [loader, 'bin/bash']) checkElfArch(path.join(manifest.system, name), arch)
  checkElfArch(manifest.node, arch)
  checkElfArch(manifest.chromium, arch)
  if (manifest.ffmpeg) checkElfArch(manifest.ffmpeg, arch)
}
export function layout(manifest: any): Layout {
  const plan: Layout = {files: [], executables: []}
  const add = (source: string, destination: string, executable = false) => {
    plan.files.push({source, destination})
    if (executable) plan.executables.push(destination)
  }
  if (manifest.mode === 'ffmpeg-cache') {
    const helpers = readJson(path.join(manifest.core, 'browsers.json')).browsers.filter((entry: any) => entry.name === 'ffmpeg')
    if (helpers.length !== 1 || typeof helpers[0].revision !== 'string' || !/^\d+$/.test(helpers[0].revision) || helpers[0].revisionOverrides != null)
      throw new Error('Playwright must declare one platform-independent FFmpeg revision')
    add(path.join(manifest.runtime, relative(manifest.ffmpeg)), `ffmpeg-${helpers[0].revision}/ffmpeg-linux`, true)
  } else {
    if (!fs.statSync(manifest.chromiumExecutable).isFile()) throw new Error('chromium_path must name a file')
    const browsers = Object.fromEntries(readJson(path.join(manifest.core, 'browsers.json')).browsers.map((entry: any) => [entry.name, entry])) as Record<string, any>
    const chromium = browsers['chromium-headless-shell'], ffmpeg = browsers.ffmpeg
    if (Object.keys(chromium.revisionOverrides || {}).length || Object.keys(ffmpeg.revisionOverrides || {}).length)
      throw new Error('Platform-specific browser revision overrides need an updated installation helper')
    // Metadata becomes a destination path; reject malformed revisions before copying.
    const revision = (value: unknown) => {
      if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Browser revision must be numeric')
      return value
    }
    plan.files.push(...manifest.chromium.map((file: Layout["files"][number]) => ({source: file.source,
      destination: path.join(`chromium_headless_shell-${revision(chromium.revision)}/chrome-headless-shell-${manifest.platform}`, file.destination)})))
    const helper = manifest.platform === 'linux64' ? 'ffmpeg-linux' : 'ffmpeg-mac'
    add(manifest.ffmpeg, `ffmpeg-${revision(ffmpeg.revision)}/${helper}`, true)
  }
  return plan
}

main(import.meta.url, () => {
  if (process.argv[2] === '--validate-linux') {
    validateLinux(readJson(process.argv[3]))
    fs.writeFileSync(process.argv[4], 'validated\n')
    return
  }
  const plan = layout(readJson(process.argv[2]))
  fs.writeFileSync(process.argv[4], plan.files.flatMap(({source, destination}) => [source, destination]).map(value => value + '\0').join(''))
  fs.writeFileSync(process.argv[5], plan.executables.map(file => file + '\0').join(''))
})
