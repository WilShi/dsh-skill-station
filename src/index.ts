/**
 * dsh-skill-station host entry: mounts the station API on the profile's
 * webServer once the service composes. The client bundle (see `./client`)
 * registers the sidebar button and settings section against the shell slots.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { makeApiHandler, type StationConfig } from './api.js'

export const name = 'dsh-skill-station'

/** cordis.yml plugin configuration; every field optional. */
export type Config = StationConfig

/** Minimal structural face of the host `webServer` service this plugin needs. */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * Register the station API route. Waits for `webServer` so non-web profiles
 * (headless/ACP) load the plugin without error and simply mount nothing.
 * @param ctx - host plugin context.
 * @param config - optional configuration from the profile composition.
 */
export function apply(ctx: Context, config: Config = {}): void {
  if (config.sources !== undefined && !Array.isArray(config.sources)) {
    throw new Error('dsh-skill-station: config.sources must be an array')
  }
  if (config.maxBodyBytes !== undefined && (typeof config.maxBodyBytes !== 'number' || config.maxBodyBytes < 1)) {
    throw new Error('dsh-skill-station: config.maxBodyBytes must be a positive number')
  }
  ctx.inject(['webServer'], (hostCtx: Context) => {
    const webServer = hostCtx as unknown as { webServer: WebServerLike }
    hostCtx.effect(
      () => webServer.webServer.register({
        kind: 'prefix',
        path: '/skill-station/api',
        handler: makeApiHandler(hostCtx, config),
      }),
      'dsh-skill-station: api route',
    )
  })
}
