/**
 * Skill trash: deletions move into `~/.dsh/skill-station/trash` with a
 * manifest recording the origin, and can be restored or emptied. Nothing is
 * hard-deleted from the trash UI path.
 */

import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { removePath } from './importer.js'
import { dshHome } from './roots.js'

/** One trashed skill's origin record. */
export interface TrashManifest {
  readonly name: string
  readonly rootId: string
  readonly from: string
  readonly deletedAt: string
  /**
   * Basename of the payload inside the entry directory. Present on entries
   * written by this version; absent on legacy entries whose directory IS the
   * payload (restore handles both).
   */
  readonly payload?: string
}

/** One trash entry with its manifest. */
export interface TrashEntry {
  readonly id: string
  readonly manifest: TrashManifest
}

/**
 * The station's state directory (also hosts the trash).
 * @returns absolute `~/.dsh/skill-station` path.
 */
export function stationHome(): string {
  return join(dshHome(), 'skill-station')
}

/**
 * The trash directory, created when missing.
 * @returns absolute trash path.
 */
export async function trashDir(): Promise<string> {
  const dir = join(stationHome(), 'trash')
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Move one installed skill into the trash. The entry is always a directory
 * wrapping the payload, so flat-file skills trash exactly like bundles.
 * @param path - absolute skill path (directory bundle or flat file).
 * @param name - skill name for the manifest.
 * @param rootId - root the skill was removed from.
 * @returns the trash entry id.
 */
export async function moveToTrash(path: string, name: string, rootId: string): Promise<string> {
  const base = await trashDir()
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const id = `${stamp}-${name}`
  const dest = join(base, id)
  await mkdir(dest, { recursive: true })
  const payload = basename(path)
  await rename(path, join(dest, payload))
  const manifest: TrashManifest = { name, rootId, from: path, deletedAt: new Date().toISOString(), payload }
  await writeFile(join(dest, '.station-trash.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return id
}

/**
 * List current trash entries, newest first.
 * @returns entries with readable manifests; unreadable entries are skipped.
 */
export async function listTrash(): Promise<TrashEntry[]> {
  const base = await trashDir()
  const entries: TrashEntry[] = []
  for (const id of await readdir(base)) {
    if (id.startsWith('.')) continue
    try {
      const text = await readFile(join(base, id, '.station-trash.json'), 'utf8')
      const manifest = JSON.parse(text) as TrashManifest
      if (typeof manifest.name === 'string' && typeof manifest.from === 'string') {
        entries.push({ id, manifest })
      }
    } catch {
      continue
    }
  }
  entries.sort((a, b) => b.id.localeCompare(a.id))
  return entries
}

/**
 * Restore one trash entry to its recorded origin.
 * @param id - trash entry id.
 * @returns null on success, or an error message when the origin is occupied.
 */
export async function restoreTrash(id: string): Promise<string | null> {
  if (!/^[\w.-]+$/.test(id)) return 'invalid trash entry id'
  const base = await trashDir()
  const entryDir = join(base, id)
  let manifest: TrashManifest
  try {
    manifest = JSON.parse(await readFile(join(entryDir, '.station-trash.json'), 'utf8')) as TrashManifest
  } catch {
    return 'trash entry not found'
  }
  // POSIX rename replaces an empty target directory, which would silently
  // discard whatever now occupies the origin; probe it first.
  try {
    await stat(manifest.from)
    return 'restore failed (origin occupied): a file or folder already exists at the original path'
  } catch {
    // Absent origin is the expected case; continue with the restore.
  }
  try {
    await rename(join(entryDir, '.station-trash.json'), join(entryDir, `.manifest-${id}`))
  } catch {
    return 'trash entry is corrupted'
  }
  try {
    if (manifest.payload !== undefined) {
      // Current layout: the entry directory wraps the payload.
      await rename(join(entryDir, manifest.payload), manifest.from)
      await removePath(entryDir)
    } else {
      // Legacy layout: the entry directory IS the (directory) payload.
      await rename(entryDir, manifest.from)
    }
  } catch (error) {
    // Put the manifest back; the entry stays restorable.
    await rename(join(entryDir, `.manifest-${id}`), join(entryDir, '.station-trash.json')).catch(() => {})
    return `restore failed (origin occupied?): ${String(error)}`
  }
  return null
}

/**
 * Permanently delete every trash entry.
 */
export async function emptyTrash(): Promise<void> {
  const base = await trashDir()
  for (const id of await readdir(base)) {
    if (id.startsWith('.')) continue
    await removePath(join(base, id))
  }
}
