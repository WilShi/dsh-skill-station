/**
 * External agent skill library scanner (read-only).
 *
 * Scans configured Claude Code / Codex / Cursor / Gemini CLI skill
 * directories for Agent Skills bundles (`<name>/SKILL.md`) and reports each
 * candidate with its import status against the station's writable roots.
 * Nothing outside the station's own roots is ever modified here.
 */

import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readSkillMeta } from './frontmatter.js'
import { expandHome, type DiskSkill } from './roots.js'

/** One configured external skill source. */
export interface SourceSpec {
  readonly id: string
  readonly label: string
  /** User-level directories, `~` allowed. */
  readonly userDirs: readonly string[]
  /** Workspace-relative project directories. */
  readonly projectDirs: readonly string[]
}

/** Default scan sources for the four supported agents. */
export const DEFAULT_SOURCES: readonly SourceSpec[] = [
  { id: 'claude', label: 'Claude Code', userDirs: ['~/.claude/skills'], projectDirs: ['.claude/skills'] },
  { id: 'codex', label: 'Codex CLI', userDirs: ['~/.codex/skills'], projectDirs: ['.codex/skills'] },
  { id: 'cursor', label: 'Cursor', userDirs: ['~/.cursor/skills'], projectDirs: ['.cursor/skills'] },
  { id: 'gemini', label: 'Gemini CLI', userDirs: ['~/.gemini/antigravity/skills', '~/.gemini/skills'], projectDirs: ['.gemini/skills'] },
]

/** One external skill candidate found by a scan. */
export interface ScanCandidate {
  readonly sourceId: string
  readonly sourceLabel: string
  /** Skill name from frontmatter, falling back to the directory name. */
  readonly name: string
  readonly description: string
  readonly path: string
  readonly scope: 'user' | 'project'
  readonly sizeBytes: number
  /** Whether an installed skill already uses this name in any writable root. */
  readonly conflict: boolean
}

/** Scan report for one source. */
export interface SourceScan {
  readonly source: SourceSpec
  readonly candidates: ScanCandidate[]
  readonly scannedDirs: string[]
}

/**
 * Scan every configured source directory and classify candidates against the
 * currently installed skill names.
 * @param sources - external sources to scan.
 * @param installed - skills already present in the station's writable roots.
 * @param workspace - optional workspace whose project directories are scanned.
 * @returns one report per source, in the given order.
 */
export async function scanSources(
  sources: readonly SourceSpec[],
  installed: readonly DiskSkill[],
  workspace?: string,
): Promise<SourceScan[]> {
  const installedNames = new Set(installed.map(skill => skill.name))
  const reports: SourceScan[] = []
  for (const source of sources) {
    const dirs = [
      ...source.userDirs.map(dir => ({ path: expandHome(dir), scope: 'user' as const })),
      ...(workspace !== undefined
        ? source.projectDirs.map(dir => ({ path: join(workspace, dir), scope: 'project' as const }))
        : []),
    ]
    const candidates: ScanCandidate[] = []
    const scannedDirs: string[] = []
    for (const { path, scope } of dirs) {
      const found = await scanOneDir(source, path, scope, installedNames)
      if (found === null) continue
      scannedDirs.push(path)
      candidates.push(...found)
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name))
    reports.push({ source, candidates, scannedDirs })
  }
  return reports
}

async function scanOneDir(
  source: SourceSpec,
  dir: string,
  scope: 'user' | 'project',
  installedNames: Set<string>,
): Promise<ScanCandidate[] | null> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const candidates: ScanCandidate[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const skillDir = join(dir, entry.name)
    const skillFile = join(skillDir, 'SKILL.md')
    let text: string
    try {
      text = await readFile(skillFile, 'utf8')
    } catch {
      continue
    }
    const meta = readSkillMeta(text)
    const name = meta?.name ?? entry.name
    const size = await dirSize(skillDir)
    candidates.push({
      sourceId: source.id,
      sourceLabel: source.label,
      name,
      description: meta?.description ?? '',
      path: skillDir,
      scope,
      sizeBytes: size,
      conflict: installedNames.has(name),
    })
  }
  return candidates
}

const SIZE_CAP_BYTES = 512 * 1024 * 1024

/**
 * Total size of regular files under a directory; symlinks are skipped and
 * the accumulated byte count is capped, so vendored trees stay bounded.
 * @param dir - directory to measure.
 * @returns accumulated byte count, capped to keep scans bounded.
 */
export async function dirSize(dir: string): Promise<number> {
  let total = 0
  const walk = async (current: string): Promise<void> => {
    if (total >= SIZE_CAP_BYTES) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (total >= SIZE_CAP_BYTES) return
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile()) {
        const stat = await lstat(path).catch(() => null)
        if (stat !== null) total += stat.size
      }
    }
  }
  await walk(dir)
  return total
}
