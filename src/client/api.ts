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

/** Install one dropped/picked zip archive (server decompresses).
 * @param body - base64 archive, target root, and conflict policy.
 * @returns the single outcome. */
export const uploadZip = (body: { zipBase64: string; targetRoot: string; workspace?: string; conflict: string }):
  Promise<{ ok: boolean; status: number; body: { outcome: ImportOutcome } }> => call('/upload-zip', { method: 'POST', body })

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


/** One discovery diagnosis for a skill the host would ignore. */
export interface Diagnosis { rootId: string; name: string; path: string; reason: string; detail: string }

/** Fetch discovery diagnoses for one workspace scope.
 * @param workspace - workspace path, empty for global-only.
 * @returns diagnoses per unloadable skill. */
export const fetchDiagnoses = (workspace: string): Promise<{ ok: boolean; status: number; body: { diagnoses: Diagnosis[] } }> =>
  call(`/diagnose${workspace !== '' ? `?workspace=${encodeURIComponent(workspace)}` : ''}`)

/** One skill detail response. */
export interface SkillDetail { kind: 'directory' | 'file'; path: string; content: string; files: string[]; meta: { name?: string; description?: string; modelInvocable: boolean; userInvocable: boolean } | null; frontmatter: Record<string, unknown> | null }

/** Fetch one skill's detail (SKILL.md content + file list).
 * @param rootId - owning root. @param name - skill name. @param workspace - optional scope.
 * @returns parsed detail. */
export const fetchSkillDetail = (rootId: string, name: string, workspace: string): Promise<{ ok: boolean; status: number; body: SkillDetail }> =>
  call(`/skill?root=${encodeURIComponent(rootId)}&name=${encodeURIComponent(name)}${workspace !== '' ? `&workspace=${encodeURIComponent(workspace)}` : ''}`)

/** One viewed file's payload. */
export interface FileView { path: string; content: string; truncated: boolean; bytes: number }

/** Read one file inside a skill directory (view only).
 * @param rootId - owning root. @param name - skill name. @param path - path relative to the skill dir. @param workspace - optional scope.
 * @returns file content (512KB capped). */
export const fetchSkillFile = (rootId: string, name: string, path: string, workspace: string): Promise<{ ok: boolean; status: number; body: FileView }> =>
  call(`/file?root=${encodeURIComponent(rootId)}&name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}${workspace !== '' ? `&workspace=${encodeURIComponent(workspace)}` : ''}`)

/** Repair one skill's non-strict-YAML frontmatter in place.
 * @param body - skill identity.
 * @returns repair result. */
export const repairSkill = (body: { rootId: string; name: string; workspace?: string }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/repair', { method: 'POST', body })

/** Build the zip export download URL for one skill.
 * @param rootId - owning root. @param name - skill name. @param workspace - optional scope.
 * @returns same-origin download URL. */
export const exportUrl = (rootId: string, name: string, workspace: string): string =>
  `/skill-station/api/export?root=${encodeURIComponent(rootId)}&name=${encodeURIComponent(name)}${workspace !== '' ? `&workspace=${encodeURIComponent(workspace)}` : ''}`

/** Scaffold a new skill.
 * @param body - target root, name, description, and optional body markdown.
 * @returns creation result. */
export const scaffoldSkill = (body: { targetRoot: string; name: string; description: string; body?: string; workspace?: string }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/scaffold', { method: 'POST', body })


/** scene name → qualified skill ids (`rootId::name`). */
export type SceneMap = Record<string, string[]>

/** Build one qualified skill id.
 * @param rootId - owning root. @param name - skill name.
 * @returns the qualified id. */
export const qualify = (rootId: string, name: string): string => `${rootId}::${name}`

/** Fetch scene assignments. @returns the scene map. */
export const fetchScenes = (): Promise<{ ok: boolean; status: number; body: { scenes: SceneMap } }> =>
  call('/scenes')

/** Assign one skill to a scene.
 * @param body - scene name and skill identity.
 * @returns the updated scene map. */
export const assignScene = (body: { scene: string; rootId: string; name: string; workspace?: string }): Promise<{ ok: boolean; status: number; body: { scenes: SceneMap } }> =>
  call('/scenes/assign', { method: 'POST', body })

/** Remove one skill from a scene.
 * @param body - scene name and skill identity.
 * @returns the updated scene map. */
export const unassignScene = (body: { scene: string; rootId: string; name: string; workspace?: string }): Promise<{ ok: boolean; status: number; body: { scenes: SceneMap } }> =>
  call('/scenes/unassign', { method: 'POST', body })

/** Save one edited file inside a skill directory.
 * @param body - skill identity, relative path, and new UTF-8 content.
 * @returns save result with fresh meta for SKILL.md writes. */
export const saveSkillFile = (body: { rootId: string; name: string; path: string; content: string; workspace?: string }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/save-file', { method: 'POST', body })

/** Empty the trash permanently. @returns completion result. */
export const emptyTrash = (): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> =>
  call('/trash-empty', { method: 'POST', body: {} })
