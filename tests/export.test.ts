import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { skillToZip } from '../src/export.ts'
import { zipToUploadFiles } from '../src/zip.ts'
import type { DiskSkill } from '../src/roots.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-export-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const skillMd = (name: string) => `---\nname: ${name}\ndescription: d\n---\nbody\n`

describe('skillToZip', () => {
  it('round-trips a directory bundle through the station zip decoder', async () => {
    const path = join(dir, 'bundle')
    await mkdir(join(path, 'assets'), { recursive: true })
    await writeFile(join(path, 'SKILL.md'), skillMd('bundle'))
    await writeFile(join(path, 'assets', 'a.txt'), 'hello')
    const skill: DiskSkill = { name: 'bundle', rootId: 'test', kind: 'directory', path, meta: null, mtimeMs: 0 }

    const entries = await zipToUploadFiles(await skillToZip(skill))
    // Entries keep the folder prefix; installUpload strips it on the way in.
    const paths = entries.map(f => f.path).sort()
    expect(paths).toEqual(['bundle/SKILL.md', 'bundle/assets/a.txt'])
    const text = Buffer.from(entries.find(f => f.path === 'bundle/SKILL.md')?.contentBase64 ?? '', 'base64').toString('utf8')
    expect(text).toBe(skillMd('bundle'))
  })

  it('packages a flat-file skill as a single entry', async () => {
    const path = join(dir, 'flat.md')
    await writeFile(path, skillMd('flat'))
    const skill: DiskSkill = { name: 'flat', rootId: 'test', kind: 'file', path, meta: null, mtimeMs: 0 }

    const entries = await zipToUploadFiles(await skillToZip(skill))
    expect(entries.map(f => f.path)).toEqual(['flat.md'])
  })
})
