/**
 * Station API client: typed fetch wrappers over `/skill-station/api`.
 * All calls are same-origin; the server rejects cross-origin mutations.
 */

/** One skill listed from a writable root. */
export interface DiskSkill {
  name: string
  rootId: string
  kind: 'directory' | 'file'
  path: string
  meta: { name?: string; description?: string; modelInvocable: boolean; userInvocable: boolean } | null
  mtimeMs: number
}

/** One root group in the skills response. */
export interface SkillGroup {
  rootId: string
  label: string
  path: string
  workspace: string | null
  skills: DiskSkill[]
}

/** One registry catalog row. */
export interface RegistryRow { name: string; source: string; provider: string }

/** Skills list response. */
export interface SkillsResponse { groups: SkillGroup[]; registry: RegistryRow[] }

/** One workspace row. */
export interface WorkspaceRow { path: string; title: string }

/** Roots response. */
export interface RootsResponse { workspaces: WorkspaceRow[]; sources: { id: string; label: string }[] }

/** One external scan candidate. */
export interface ScanCandidate {
  sourceId: string
  sourceLabel: string
  name: string
  description: string
  path: string
  scope: 'user' | 'project'
  sizeBytes: number
  conflict: boolean
}

/** One source scan report. */
export interface SourceScan { source: { id: string; label: string }; candidates: ScanCandidate[]; scannedDirs: string[] }

/** One import outcome. */
export interface ImportOutcome { sourcePath: string; name: string; status: string; targetPath?: string; error?: string }

/** One trash entry. */
export interface TrashEntry { id: string; manifest: { name: string; rootId: string; from: string; deletedAt: string } }

async function call<T>(path: string, options?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; body: T }> {
  const resp = await fetch(`/skill-station/api${path}`, {
    method: options?.method ?? 'GET',
    ...(options?.body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
      : {}),
  })
  return { ok: resp.ok, status: resp.status, body: await resp.json().catch(() => ({})) as T }
}

/** Fetch roots and workspaces. @returns parsed roots response. */
export const fetchRoots = (): Promise<{ ok: boolean; status: number; body: RootsResponse }> => call('/roots')

/** Fetch the skill library for one workspace scope.
 * @param workspace - workspace path, empty for the global-only view.
 * @returns parsed skills response. */
export const fetchSkills = (workspace: string): Promise<{ ok: boolean; status: number; body: SkillsResponse }> =>
  call(`/skills${workspace !== '' ? `?workspace=${encodeURIComponent(workspace)}` : ''}`)

/** Scan external agent skill directories.
 * @param workspace - workspace path whose project directories are included.
 * @returns scan reports per source. */
export const scanSources = (workspace: string): Promise<{ ok: boolean; status: number; body: { reports: SourceScan[] } }> =>
  call('/scan', { method: 'POST', body: { ...(workspace !== '' ? { workspace } : {}) } })

/** Import scanned candidates into a target root.
 * @param body - items, target root, and conflict policy.
 * @returns per-item outcomes. */
export const importSkills = (body: { items: { sourcePath: string; rename?: string }[]; targetRoot: string; workspace?: string; conflict: string }):
  Promise<{ ok: boolean; status: number; body: { outcomes: ImportOutcome[] } }> => call('/import', { method: 'POST', body })

/** Install one dropped/picked file set.
 * @param body - base64 files, target root, and conflict policy.
 * @returns the single outcome. */
export const uploadFiles = (body: { files: { path: string; contentBase64: string }[]; targetRoot: string; workspace?: string; conflict: string }):
  Promise<{ ok: boolean; status: number; body: { outcome: ImportOutcome } }> => call('/upload', { method: 'POST', body })

/** Toggle one skill's invocation flags.
 * @param body - skill identity and the flag to rewrite.
 * @returns whether the rewrite succeeded. */
export const toggleSkill = (body: { rootId: string; name: string; workspace?: string; modelInvocable?: boolean; userInvocable?: boolean }):
  Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> => call('/toggle', { method: 'POST', body })

/** Move one skill to the trash.
 * @param body - skill identity.
 * @returns whether the deletion succeeded. */
export const deleteSkill = (body: { rootId: string; name: string; workspace?: string }):
  Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> => call('/delete', { method: 'POST', body })

/** List trash entries. @returns current trash. */
export const fetchTrash = (): Promise<{ ok: boolean; status: number; body: { entries: TrashEntry[] } }> => call('/trash')

/** Restore one trash entry.
 * @param id - trash entry id.
 * @returns restore result. */
export const restoreTrash = (id: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/trash-restore', { method: 'POST', body: { id } })

/** Empty the trash permanently. @returns completion result. */
export const emptyTrash = (): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/trash-empty', { method: 'POST', body: {} })
