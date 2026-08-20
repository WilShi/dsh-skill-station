/**
 * HTTP API: route dispatch, request validation, and same-origin enforcement
 * for the `/skill-station/api` prefix. All handlers answer JSON; mutating
 * methods require a same-origin or non-browser request.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { readSkillMeta, setFlag, splitFrontmatter, type FlagKey } from './frontmatter.js'
import { importItems, installUpload, type ConflictPolicy, type UploadFile } from './importer.js'
import { assertSafeRelative, enumerateRoot, rootById, writableRoots, type SkillRoot } from './roots.js'
import { DEFAULT_SOURCES, scanSources, type SourceSpec } from './scanner.js'
import { emptyTrash, listTrash, moveToTrash, restoreTrash } from './trash.js'

/** Plugin configuration accepted from cordis.yml. */
export interface StationConfig {
  /** External scan sources; defaults cover Claude/Codex/Cursor/Gemini. */
  readonly sources?: SourceSpec[]
  /** Maximum accepted request body in bytes (uploads ride JSON). */
  readonly maxBodyBytes?: number
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024
const API_PREFIX = '/skill-station/api'

/** Minimal structural view of the host workspace registry (optional service). */
interface WorkspaceRegistryLike {
  list(): { path: string; title?: string }[]
}

/** Minimal structural view of the host skill registry. */
interface SkillRegistryLike {
  list(options: { cwd?: string }): Promise<{ name: string; source: string; provider: string }[]>
}

/**
 * Build the prefix handler serving the station API.
 * @param ctx - host context; workspace and skill services are read lazily.
 * @param config - validated plugin configuration.
 * @returns the node:http handler for the `/skill-station/api` prefix route.
 */
export function makeApiHandler(ctx: Context, config: StationConfig) {
  const sources = config.sources ?? [...DEFAULT_SOURCES]
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  const workspaces = (): { path: string; title: string }[] => {
    const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
    if (registry === undefined) return []
    try {
      return registry.list().map(ws => ({ path: ws.path, title: ws.title ?? ws.path }))
    } catch {
      return []
    }
  }

  const knownWorkspace = (requested: unknown): string | undefined => {
    if (typeof requested !== 'string' || requested.length === 0) return undefined
    const list = workspaces()
    // Without a registry (headless compositions) trust the caller's path.
    if (list.length === 0) return requested
    return list.find(ws => ws.path === requested)?.path
  }

  const rootsFor = (workspace?: string): SkillRoot[] =>
    writableRoots(workspace !== undefined ? [workspace] : [])

  const skillRegistry = (): SkillRegistryLike | undefined =>
    ctx.get('skills') as SkillRegistryLike | undefined

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname
    try {
      if (req.method === 'GET') {
        if (path === '/roots') return sendJson(res, 200, { workspaces: workspaces(), sources: sources.map(s => ({ id: s.id, label: s.label })) })
        if (path === '/skills') {
          const workspace = knownWorkspace(url.searchParams.get('workspace') ?? undefined)
          const roots = rootsFor(workspace)
          const groups = []
          for (const root of roots) {
            groups.push({ rootId: root.id, label: root.label, path: root.path, workspace: root.workspace ?? null, skills: await enumerateRoot(root) })
          }
          const registry = skillRegistry()
          const catalog = registry !== undefined && workspace !== undefined
            ? await registry.list({ cwd: workspace })
            : registry !== undefined ? await registry.list({}) : []
          return sendJson(res, 200, { groups, registry: catalog })
        }
        if (path === '/skill') {
          const workspace = knownWorkspace(url.searchParams.get('workspace') ?? undefined)
          const rootId = url.searchParams.get('root') ?? ''
          const name = url.searchParams.get('name') ?? ''
          const root = rootById(rootsFor(workspace), rootId)
          if (root === undefined) return sendJson(res, 404, { error: 'unknown root' })
          const skill = (await enumerateRoot(root)).find(s => s.name === name)
          if (skill === undefined) return sendJson(res, 404, { error: 'skill not found' })
          return sendJson(res, 200, await skillDetail(skill.path, skill.kind))
        }
        if (path === '/trash') {
          return sendJson(res, 200, { entries: await listTrash() })
        }
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }

      if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'cross-origin request rejected' })
      const body = await readJsonBody(req, maxBodyBytes)

      if (req.method === 'POST') {
        if (path === '/scan') {
          const workspace = knownWorkspace(body.workspace)
          const installed = (await Promise.all(rootsFor(workspace).map(enumerateRoot))).flat()
          return sendJson(res, 200, { reports: await scanSources(sources, installed, workspace) })
        }
        if (path === '/import') {
          const workspace = knownWorkspace(body.workspace)
          const root = rootById(rootsFor(workspace), typeof body.targetRoot === 'string' ? body.targetRoot : '')
          if (root === undefined) return sendJson(res, 400, { error: 'unknown target root' })
          const conflict = toConflict(body.conflict)
          if (!Array.isArray(body.items)) return sendJson(res, 400, { error: 'items must be an array' })
          const items = body.items
            .filter((item): item is { sourcePath: string; rename?: string } =>
              typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).sourcePath === 'string')
            .map(item => ({ sourcePath: item.sourcePath, ...(typeof item.rename === 'string' && item.rename.length > 0 ? { rename: item.rename } : {}) }))
          if (items.length === 0 || items.length > 200) return sendJson(res, 400, { error: 'provide between 1 and 200 items' })
          const outcomes = await importItems(root, items, conflict, (p, name, rootId) => moveToTrash(p, name, rootId).then(() => {}))
          return sendJson(res, 200, { outcomes })
        }
        if (path === '/upload') {
          const workspace = knownWorkspace(body.workspace)
          const root = rootById(rootsFor(workspace), typeof body.targetRoot === 'string' ? body.targetRoot : '')
          if (root === undefined) return sendJson(res, 400, { error: 'unknown target root' })
          if (!Array.isArray(body.files)) return sendJson(res, 400, { error: 'files must be an array' })
          const files: UploadFile[] = []
          for (const raw of body.files) {
            if (typeof raw !== 'object' || raw === null) return sendJson(res, 400, { error: 'malformed file entry' })
            const entry = raw as Record<string, unknown>
            if (typeof entry.path !== 'string' || typeof entry.contentBase64 !== 'string') return sendJson(res, 400, { error: 'malformed file entry' })
            files.push({ path: assertSafeRelative(entry.path), contentBase64: entry.contentBase64 })
          }
          const outcome = await installUpload(root, files, toConflict(body.conflict), (p, name, rootId) => moveToTrash(p, name, rootId).then(() => {}))
          return sendJson(res, outcome.status === 'skipped' && outcome.error !== undefined ? 409 : 200, { outcome })
        }
        if (path === '/toggle' || path === '/delete') {
          const workspace = knownWorkspace(body.workspace)
          const root = rootById(rootsFor(workspace), typeof body.rootId === 'string' ? body.rootId : '')
          if (root === undefined) return sendJson(res, 400, { error: 'unknown root' })
          const name = typeof body.name === 'string' ? body.name : ''
          const skill = (await enumerateRoot(root)).find(s => s.name === name)
          if (skill === undefined) return sendJson(res, 404, { error: 'skill not found' })
          if (path === '/delete') {
            await moveToTrash(skill.path, skill.name, root.id)
            return sendJson(res, 200, { deleted: skill.name })
          }
          const flag = flagForToggle(body)
          if (flag === null) return sendJson(res, 400, { error: 'toggle needs modelInvocable or userInvocable' })
          if (skill.kind === 'file') {
            const text = await readFile(skill.path, 'utf8')
            await writeFile(skill.path, setFlag(text, flag.key, flag.value), 'utf8')
          } else {
            const skillFile = join(skill.path, 'SKILL.md')
            const text = await readFile(skillFile, 'utf8')
            await writeFile(skillFile, setFlag(text, flag.key, flag.value), 'utf8')
          }
          return sendJson(res, 200, { toggled: skill.name })
        }
        if (path === '/trash-restore') {
          const error = await restoreTrash(typeof body.id === 'string' ? body.id : '')
          return error === null ? sendJson(res, 200, { restored: true }) : sendJson(res, 409, { error })
        }
        if (path === '/trash-empty') {
          await emptyTrash()
          return sendJson(res, 200, { emptied: true })
        }
      }
      res.writeHead(405, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'method not allowed' }))
    } catch (error) {
      sendJson(res, 500, { error: String(error) })
    }
  }
}

/**
 * Map a toggle request body to the frontmatter flag it rewrites.
 * @param body - parsed request body.
 * @returns flag key and target value, or null when neither flag is present.
 */
export function flagForToggle(body: Record<string, unknown>): { key: FlagKey; value: boolean } | null {
  if (typeof body.modelInvocable === 'boolean') {
    return { key: 'disable-model-invocation', value: !body.modelInvocable }
  }
  if (typeof body.userInvocable === 'boolean') {
    return { key: 'user-invocable', value: body.userInvocable }
  }
  return null
}

function toConflict(value: unknown): ConflictPolicy {
  return value === 'rename' || value === 'replace' ? value : 'skip'
}

async function skillDetail(path: string, kind: 'directory' | 'file'): Promise<Record<string, unknown>> {
  if (kind === 'file') {
    const content = await readFile(path, 'utf8')
    return { kind, path, content, files: [] }
  }
  const content = await readFile(join(path, 'SKILL.md'), 'utf8')
  const { readdir } = await import('node:fs/promises')
  const files: string[] = []
  const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
    if (depth > 4 || files.length > 500) return
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel, depth + 1)
      else if (entry.isFile()) files.push(rel)
    }
  }
  await walk(path, '', 0)
  files.sort()
  const meta = readSkillMeta(content)
  const split = splitFrontmatter(content)
  return { kind, path, content, files, meta: meta ?? null, frontmatter: split?.data ?? null }
}

/**
 * Enforce same-origin for browser mutations: an absent Origin header means a
 * non-browser caller; otherwise the Origin host must match the request host.
 * @param req - inbound request.
 * @returns whether the request may mutate state.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined || origin === 'null') return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.byteLength
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be a JSON object')
  return parsed as Record<string, unknown>
}
