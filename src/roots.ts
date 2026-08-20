/**
 * Skill root resolution, containment checks, and disk enumeration.
 *
 * Roots mirror the host `dsh-skill-filesystem` discovery semantics: global
 * roots under `$DSH_HOME/skills` and `~/.agents/skills`, project roots under
 * `<projectRoot>/.dsh/skills` and `<projectRoot>/.agents/skills`. A skill is
 * either a directory bundle (`<name>/SKILL.md`, one level deep) or a flat
 * markdown file (`<name>.md`) directly under the root. All writes stay inside
 * a resolved writable root; every write path passes `assertContained`.
 */

import { lstat, mkdir, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { readSkillMeta, type SkillMeta } from './frontmatter.js'

/** One skill root the station knows about. */
export interface SkillRoot {
  readonly id: string
  readonly label: string
  readonly path: string
  /** Whether the station may write into this root. */
  readonly writable: boolean
  /** Workspace directory the root belongs to, when it is a project root. */
  readonly workspace?: string
}

/** One skill discovered on disk inside a root. */
export interface DiskSkill {
  readonly name: string
  readonly rootId: string
  readonly kind: 'directory' | 'file'
  /** Absolute path of the skill directory or markdown file. */
  readonly path: string
  readonly meta: SkillMeta | null
  readonly mtimeMs: number
}

/**
 * Resolve the DSH config home (`$DSH_HOME` or `~/.dsh`).
 * @returns absolute DSH home path.
 */
export function dshHome(): string {
  return resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
}

/**
 * Expand a leading `~` in a configured directory.
 * @param dir - configured path, possibly starting with `~`.
 * @returns absolute resolved path.
 */
export function expandHome(dir: string): string {
  if (dir === '~') return homedir()
  if (dir.startsWith('~/')) return join(homedir(), dir.slice(2))
  return resolve(dir)
}

/**
 * Build the writable root set: two global roots plus, for each workspace, its
 * two project roots. Missing directories are fine — writes create them.
 * @param workspaces - workspace directories whose project roots are managed.
 * @returns ordered root list (global roots first).
 */
export function writableRoots(workspaces: readonly string[]): SkillRoot[] {
  const home = dshHome()
  const roots: SkillRoot[] = [
    { id: 'user-dsh', label: `全局 · ${join(home, 'skills')}`, path: join(home, 'skills'), writable: true },
    { id: 'user-agents', label: `共享 · ${join(homedir(), '.agents', 'skills')}`, path: join(homedir(), '.agents', 'skills'), writable: true },
  ]
  for (const ws of workspaces) {
    const wsResolved = resolve(ws)
    roots.push(
      { id: `project-dsh:${wsResolved}`, label: `项目 · ${join(wsResolved, '.dsh', 'skills')}`, path: join(wsResolved, '.dsh', 'skills'), writable: true, workspace: wsResolved },
      { id: `project-agents:${wsResolved}`, label: `项目 · ${join(wsResolved, '.agents', 'skills')}`, path: join(wsResolved, '.agents', 'skills'), writable: true, workspace: wsResolved },
    )
  }
  return roots
}

/**
 * Find one root by id.
 * @param roots - root list to search.
 * @param id - root id from the client.
 * @returns the matching root, or undefined.
 */
export function rootById(roots: readonly SkillRoot[], id: string): SkillRoot | undefined {
  return roots.find(root => root.id === id)
}

/**
 * Assert that a write target stays inside its root after normalization.
 * @param root - the writable root the target must stay within.
 * @param target - candidate absolute path.
 * @returns the resolved target path.
 * @throws when the target escapes the root or is not absolute.
 */
export function assertContained(root: SkillRoot, target: string): string {
  if (!isAbsolute(target)) throw new Error(`path is not absolute: ${target}`)
  const resolved = resolve(target)
  const rootResolved = resolve(root.path)
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${sep}`)) {
    throw new Error(`path escapes root "${root.id}": ${target}`)
  }
  return resolved
}

/**
 * Validate a relative upload path: no absolute paths, no `..` segments, no
 * backslashes, bounded depth.
 * @param rel - client-supplied relative path inside a skill folder.
 * @returns the normalized relative path.
 * @throws when the path is unsafe.
 */
export function assertSafeRelative(rel: string): string {
  if (rel.length === 0 || isAbsolute(rel) || rel.includes('\\') || rel.includes('\0')) {
    throw new Error(`unsafe relative path: ${JSON.stringify(rel)}`)
  }
  const segments = rel.split('/')
  if (segments.length > 16) throw new Error(`path too deep: ${rel}`)
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`unsafe path segment in: ${rel}`)
    }
  }
  return segments.join('/')
}

/**
 * Enumerate the skills of one root from disk, matching the host provider's
 * discovery shape (directory bundles and flat markdown files, one level).
 * @param root - root to enumerate; a missing directory yields an empty list.
 * @returns skills found in the root, sorted by name.
 */
export async function enumerateRoot(root: SkillRoot): Promise<DiskSkill[]> {
  let entries
  try {
    entries = await readdir(root.path, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: DiskSkill[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const entryPath = join(root.path, entry.name)
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const skill = await readDirectorySkill(root, entryPath, entry.name)
      if (skill !== null) skills.push(skill)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const skill = await readFlatSkill(root, entryPath, entry.name)
      if (skill !== null) skills.push(skill)
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

async function readDirectorySkill(root: SkillRoot, dirPath: string, dirName: string): Promise<DiskSkill | null> {
  const skillFile = join(dirPath, 'SKILL.md')
  let text: string
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return null
  }
  const meta = readSkillMeta(text)
  const stat = await lstat(skillFile).catch(() => null)
  return {
    name: meta?.name ?? dirName,
    rootId: root.id,
    kind: 'directory',
    path: dirPath,
    meta,
    mtimeMs: stat?.mtimeMs ?? 0,
  }
}

async function readFlatSkill(root: SkillRoot, filePath: string, fileName: string): Promise<DiskSkill | null> {
  let text: string
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    return null
  }
  const meta = readSkillMeta(text)
  if (meta === null) return null
  const stat = await lstat(filePath).catch(() => null)
  return {
    name: meta.name ?? fileName.slice(0, -3),
    rootId: root.id,
    kind: 'file',
    path: filePath,
    meta,
    mtimeMs: stat?.mtimeMs ?? 0,
  }
}

/**
 * Ensure a root directory exists.
 * @param root - root whose directory is created when missing.
 */
export async function ensureRoot(root: SkillRoot): Promise<void> {
  await mkdir(root.path, { recursive: true })
}
