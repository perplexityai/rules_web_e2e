/** Runs in a child process with only declared files and environment values. */
export interface ServerContext {
  /** Directory containing the consumer Playwright config. */
  root: string
  /** Entire staged runfiles tree, including declared cross-package inputs. */
  inputs: string
  cache: string
  host: '127.0.0.1'
}

export interface RunningServer {
  /** Ready HTTP URL on 127.0.0.1 with an explicitly assigned port. */
  url: string
  close(): void | Promise<void>
}

/** Export this function as the default from a compiled, declared TS module. */
export type ServerAdapter = (
  context: ServerContext
) => RunningServer | Promise<RunningServer>

export {serveDirectory} from './static-server.js'
