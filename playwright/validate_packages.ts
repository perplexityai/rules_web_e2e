import fs from 'node:fs'
import path from 'node:path'
import {validatePlaywrightVersions} from '../runtime/versions.js'
import {main, readJson} from '../tools/files.js'

export function validate(test: string, core: string, version: string, output: string) {
  validatePlaywrightVersions(version, readJson(path.join(test, 'package.json')).version,
    readJson(path.join(core, 'package.json')).version)
  fs.writeFileSync(output, JSON.stringify({version}) + '\n')
}
main(import.meta.url, () => validate(process.argv[2], process.argv[3], process.argv[4], process.argv[5]))
