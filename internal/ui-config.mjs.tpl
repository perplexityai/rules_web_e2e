import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {importModule, resolveRunfile} from './runfiles.mjs'

const configFile = fs.realpathSync(resolveRunfile(%{config}))
const {default: config} = await importModule(%{config})
const originalDirectory = path.dirname(configFile)
const selection = {
  testDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'specs'),
  testMatch: '**/*.mjs',
  testIgnore: [],
}
const reportRoot = path.resolve(path.dirname(fs.realpathSync(resolveRunfile(%{root_anchor}))), %{root_up})
const resultsRoot = process.env.TEST_UNDECLARED_OUTPUTS_DIR || process.env.TEST_TMPDIR || process.env.BUILD_WORKSPACE_DIRECTORY || os.tmpdir()
const outputDir = config.outputDir ? path.resolve(originalDirectory, config.outputDir) : path.join(resultsRoot, 'test-results', %{output_path})
const servers = config.webServer ? (Array.isArray(config.webServer) ? config.webServer : [config.webServer]).map(server => ({
  ...server, cwd: server.cwd ?? originalDirectory,
})) : undefined

export default {
  ...config,
  ...selection,
  testDir: reportRoot,
  outputDir,
  webServer: servers,
  projects: (config.projects ?? [{}]).map(project => ({
    ...project,
    ...selection,
    outputDir: project.outputDir ? path.resolve(originalDirectory, project.outputDir) : outputDir,
  })),
}
