import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyTrash, listTrash, moveToTrash, restoreTrash, trashDir } from '../src/trash.ts'

let dir: string
let prevHome: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-trash-'))
  prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(dir, 'dsh-home')
})

afterEach(async () => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  await rm(dir, { recursive: true, force: true })
})

const skillMd = (name: string) => `---\nname: ${name}\ndescription: d\n---\nbody\n`

/** Create one installed skill under a fake root and return its path. */
async function makeSkill(name: string, kind: 'directory' | 'file'): Promise<string> {
  const rootPath = join(dir, 'skills')
  await mkdir(rootPath, { recursive: true })
  if (kind === 'file') {
    const path = join(rootPath, `${name}.md`)
    await writeFile(path, skillMd(name))
    return path
  }
  const path = join(rootPath, name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), skillMd(name))
  return path
}

describe('moveToTrash + listTrash + restoreTrash', () => {
  it('round-trips a directory skill', async () => {
    const path = await makeSkill('bundle', 'directory')
    const id = await moveToTrash(path, 'bundle', 'test')

    await expect(readFile(join(path, 'SKILL.md'), 'utf8')).rejects.toThrow()
    const entries = await listTrash()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.manifest).toMatchObject({ name: 'bundle', from: path, payload: 'bundle' })

    expect(await restoreTrash(id)).toBeNull()
    expect((await readFile(join(path, 'SKILL.md'), 'utf8'))).toBe(skillMd('bundle'))
    expect(await listTrash()).toHaveLength(0)
  })

  it('round-trips a flat-file skill', async () => {
    const path = await makeSkill('flat', 'file')
    const id = await moveToTrash(path, 'flat', 'test')

    await expect(readFile(path, 'utf8')).rejects.toThrow()
    const entries = await listTrash()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.manifest).toMatchObject({ name: 'flat', from: path, payload: 'flat.md' })

    expect(await restoreTrash(id)).toBeNull()
    expect((await readFile(path, 'utf8'))).toBe(skillMd('flat'))
    expect(await listTrash()).toHaveLength(0)
  })

  it('refuses to restore over an occupied origin and keeps the entry', async () => {
    const path = await makeSkill('bundle', 'directory')
    const id = await moveToTrash(path, 'bundle', 'test')
    await makeSkill('bundle', 'directory')

    expect(await restoreTrash(id)).toMatch(/origin occupied/)
    expect(await listTrash()).toHaveLength(1)
  })

  it('restores a legacy entry whose directory is the payload', async () => {
    // Entries written before payloads were wrapped: <id>/ IS the skill dir.
    const base = await trashDir()
    const id = '2026-01-01T00-00-00-000Z-legacy'
    const entryDir = join(base, id)
    await mkdir(entryDir, { recursive: true })
    await writeFile(join(entryDir, 'SKILL.md'), skillMd('legacy'))
    const from = join(dir, 'skills', 'legacy')
    await mkdir(join(dir, 'skills'), { recursive: true })
    await writeFile(join(entryDir, '.station-trash.json'), JSON.stringify({ name: 'legacy', rootId: 'test', from, deletedAt: '2026-01-01T00:00:00Z' }))

    expect(await restoreTrash(id)).toBeNull()
    expect((await readFile(join(from, 'SKILL.md'), 'utf8'))).toBe(skillMd('legacy'))
  })

  it('rejects an invalid entry id', async () => {
    expect(await restoreTrash('../escape')).toBe('invalid trash entry id')
  })
})

describe('emptyTrash', () => {
  it('removes every entry', async () => {
    const a = await makeSkill('a', 'directory')
    const b = await makeSkill('b', 'file')
    await moveToTrash(a, 'a', 'test')
    await moveToTrash(b, 'b', 'test')
    expect(await listTrash()).toHaveLength(2)

    await emptyTrash()
    expect(await listTrash()).toHaveLength(0)
  })
})
