import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installUpload } from '../src/importer.ts'
import { enumerateRoot, type SkillRoot } from '../src/roots.ts'
import { zipToUploadFiles } from '../src/zip.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-zip-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const fixture = (): Buffer =>
  Buffer.from(
    readFileSync(fileURLToPath(new URL('./fixtures/zip-skill.zip.b64', import.meta.url)), 'utf8').trim(),
    'base64',
  )

describe('zipToUploadFiles', () => {
  it('decodes entries, normalizes backslashes, and drops macOS cruft', async () => {
    const files = await zipToUploadFiles(fixture())
    const paths = files.map(f => f.path).sort()
    expect(paths).toEqual([
      'zip-skill/SKILL.md',
      'zip-skill/libs/beartype/_util/hint/pep/proposal/pep484/pep484generic.py',
      'zip-skill/scripts/legacy.txt',
      'zip-skill/scripts/win-tool.txt',
    ])
  })

  it('rejects a non-zip buffer with a clear message', async () => {
    await expect(zipToUploadFiles(new TextEncoder().encode('not a zip'))).rejects.toThrow('not a valid zip archive')
  })
})

describe('installUpload from a decoded zip', () => {
  it('installs the skill including deep vendored files', async () => {
    const root: SkillRoot = { id: 'test', label: 'test', path: join(dir, 'target'), writable: true }
    const outcome = await installUpload(root, await zipToUploadFiles(fixture()), 'skip', async () => {})
    expect(outcome).toMatchObject({ name: 'zip-skill', status: 'imported' })
    const deep = join(root.path, 'zip-skill', 'libs/beartype/_util/hint/pep/proposal/pep484/pep484generic.py')
    expect((await readFile(deep, 'utf8'))).toBe('# vendored\n')
    const installed = await enumerateRoot(root)
    expect(installed.map(s => s.name)).toEqual(['zip-skill'])
  })
})
