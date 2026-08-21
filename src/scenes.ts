/**
 * Scene (tag) assignments: user-owned groupings of installed skills,
 * persisted at ~/.dsh/skill-station/scenes.json. Skills are addressed by
 * qualified id `<rootId>::<name>` so identical names in different roots
 * never collide. Writes are atomic (tmp file + rename).
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stationHome } from './trash.js'

/** Qualified identity of one installed skill across roots. */
export type QualifiedSkill = `${string}::${string}`

/** scene name → qualified skill ids. */
export type SceneMap = Record<string, QualifiedSkill[]>

/** Build one qualified id.
 * @param rootId - owning root. @param name - skill name.
 * @returns the qualified id. */
export function qualify(rootId: string, name: string): QualifiedSkill {
  return `${rootId}::${name}`
}

const MAX_SCENE_LENGTH = 30

/**
 * Validate a scene name: non-empty after trim, bounded length, no control
 * characters or path separators.
 * @param name - candidate scene name.
 * @returns the trimmed name.
 * @throws when the name is unusable.
 */
export function assertSceneName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > MAX_SCENE_LENGTH || /[\u0000-\u001f\\/]/.test(trimmed)) {
    throw new Error(`invalid scene name: ${JSON.stringify(name)}`)
  }
  return trimmed
}

async function scenesPath(): Promise<string> {
  const dir = stationHome()
  await mkdir(dir, { recursive: true })
  return join(dir, 'scenes.json')
}

/** Read the current scene map (missing or malformed file yields empty). */
export async function readScenes(): Promise<SceneMap> {
  try {
    const parsed: unknown = JSON.parse(await readFile(await scenesPath(), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: SceneMap = {}
    for (const [scene, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const ids = value.filter((id): id is QualifiedSkill => typeof id === 'string' && id.includes('::'))
      if (ids.length > 0) out[scene] = [...new Set(ids)]
    }
    return out
  } catch {
    return {}
  }
}

async function writeScenes(map: SceneMap): Promise<void> {
  const path = await scenesPath()
  const tmp = `${path}.tmp`
  await writeFile(tmp, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

/** Assign one skill to a scene (creating the scene on first use). */
export async function assignScene(scene: string, skill: QualifiedSkill): Promise<SceneMap> {
  const name = assertSceneName(scene)
  const map = await readScenes()
  const members = map[name] ?? []
  if (!members.includes(skill)) {
    map[name] = [...members, skill]
    await writeScenes(map)
  }
  return map
}

/** Remove one skill from a scene; empty scenes disappear. */
export async function unassignScene(scene: string, skill: QualifiedSkill): Promise<SceneMap> {
  const name = assertSceneName(scene)
  const map = await readScenes()
  const members = (map[name] ?? []).filter(id => id !== skill)
  if (members.length === 0) delete map[name]
  else map[name] = members
  await writeScenes(map)
  return map
}
