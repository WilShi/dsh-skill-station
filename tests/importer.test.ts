import { chmod, mkdtemp, mkdir, readdir, rm, symlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyTree, freshName, importItems, installUpload, isSkillName, stripCommonPrefix } from '../src/importer.ts'
import { enumerateRoot, writableRoots, type SkillRoot } from '../src/roots.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-import-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function makeRoot(path: string): SkillRoot {
  return { id: 'test', label: 'test', path, writable: true }
}

const skillMd = (name: string, description = 'd') =>
  `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`

describe('isSkillName', () => {
  it('accepts kebab-case and rejects others', () => {
    expect(isSkillName('my-skill')).toBe(true)
    expect(isSkillName('a1-b2')).toBe(true)
    expect(isSkillName('My-Skill')).toBe(false)
    expect(isSkillName('has space')).toBe(false)
    expect(isSkillName('-lead')).toBe(false)
    expect(isSkillName('')).toBe(false)
  })
})

describe('freshName', () => {
  it('appends the first free numeric suffix', () => {
    const taken = new Set(['x', 'x-2'])
    expect(freshName('x', taken)).toBe('x-3')
  })
})

describe('stripCommonPrefix', () => {
  it('strips a single shared top folder', () => {
    const files = [
      { path: 'foo/SKILL.md', contentBase64: 'a' },
      { path: 'foo/assets/x.png', contentBase64: 'b' },
    ]
    expect(stripCommonPrefix(files).map(f => f.path)).toEqual(['SKILL.md', 'assets/x.png'])
  })

  it('keeps multiple top folders as-is', () => {
    const files = [
      { path: 'a/SKILL.md', contentBase64: 'a' },
      { path: 'b/SKILL.md', contentBase64: 'b' },
    ]
    expect(stripCommonPrefix(files).map(f => f.path)).toEqual(['a/SKILL.md', 'b/SKILL.md'])
  })
})

describe('copyTree', () => {
  it('copies nested files and skips symlinks', async () => {
    const src = join(dir, 'src')
    await mkdir(join(src, 'assets'), { recursive: true })
    await writeFile(join(src, 'SKILL.md'), skillMd('x'))
    await writeFile(join(src, 'assets', 'a.txt'), 'hello')
    const outside = join(dir, 'outside.txt')
    await writeFile(outside, 'secret')
    await symlink(outside, join(src, 'link.txt'))

    const dst = join(dir, 'dst')
    await copyTree(src, dst)
    expect((await readFile(join(dst, 'SKILL.md'), 'utf8'))).toBe(skillMd('x'))
    expect((await readFile(join(dst, 'assets', 'a.txt'), 'utf8'))).toBe('hello')
    await expect(readFile(join(dst, 'link.txt'), 'utf8')).rejects.toThrow()
  })
})

describe('importItems', () => {
  it('imports a skill directory into the target root', async () => {
    const source = join(dir, 'claude-skills', 'my-tool')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), skillMd('my-tool'))
    const root = makeRoot(join(dir, 'target'))

    const outcomes = await importItems(root, [{ sourcePath: source }], 'skip', async () => {})
    expect(outcomes[0]).toMatchObject({ name: 'my-tool', status: 'imported' })
    const installed = await enumerateRoot(root)
    expect(installed.map(s => s.name)).toEqual(['my-tool'])
  })

  it('skips on conflict with the skip policy', async () => {
    const source = join(dir, 'src', 'dup')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), skillMd('dup'))
    const root = makeRoot(join(dir, 'target'))
    await mkdir(root.path, { recursive: true })
    await mkdir(join(root.path, 'dup'))
    await writeFile(join(root.path, 'dup', 'SKILL.md'), skillMd('dup'))

    const outcomes = await importItems(root, [{ sourcePath: source }], 'skip', async () => {})
    expect(outcomes[0]?.status).toBe('skipped')
  })

  it('renames on conflict with the rename policy', async () => {
    const source = join(dir, 'src', 'dup')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), skillMd('dup'))
    const root = makeRoot(join(dir, 'target'))
    await mkdir(join(root.path, 'dup'), { recursive: true })
    await writeFile(join(root.path, 'dup', 'SKILL.md'), skillMd('dup'))

    const outcomes = await importItems(root, [{ sourcePath: source }], 'rename', async () => {})
    expect(outcomes[0]).toMatchObject({ name: 'dup-2', status: 'renamed' })
    // The renamed copy must declare the new name, or the host registry sees
    // two skills named 'dup' and operations become ambiguous.
    const copied = await readFile(join(root.path, 'dup-2', 'SKILL.md'), 'utf8')
    expect(copied).toContain('name: dup-2')
    const installed = await enumerateRoot(root)
    expect(installed.map(s => s.name).sort()).toEqual(['dup', 'dup-2'])
  })

  it('moves the existing skill to trash on replace', async () => {
    const source = join(dir, 'src', 'dup')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), skillMd('dup'))
    const root = makeRoot(join(dir, 'target'))
    await mkdir(join(root.path, 'dup'), { recursive: true })
    await writeFile(join(root.path, 'dup', 'SKILL.md'), skillMd('dup'))

    const trashed: string[] = []
    const outcomes = await importItems(root, [{ sourcePath: source }], 'replace', async path => {
      trashed.push(path)
      await rm(path, { recursive: true, force: true })
    })
    expect(outcomes[0]?.status).toBe('replaced')
    expect(trashed).toEqual([join(root.path, 'dup')])
  })
})

describe('install atomicity', () => {
  it('a failed import leaves no partial skill or staging residue', async () => {
    const source = join(dir, 'src', 'fragile')
    await mkdir(join(source, 'locked'), { recursive: true })
    await writeFile(join(source, 'SKILL.md'), skillMd('fragile'))
    await chmod(join(source, 'locked'), 0o000)
    const root = makeRoot(join(dir, 'target'))

    const outcomes = await importItems(root, [{ sourcePath: source }], 'skip', async () => {})
    expect(outcomes[0]?.status).toBe('skipped')
    // The root must not contain the half-copied skill or a staging dir.
    const residue = await readdir(root.path).catch(() => [] as string[])
    expect(residue).toEqual([])
    await chmod(join(source, 'locked'), 0o755)
  })

  it('a failed upload leaves no partial skill or staging residue', async () => {
    const root = makeRoot(join(dir, 'target'))
    const b64 = (text: string) => Buffer.from(text).toString('base64')
    // 'SKILL.md/x.txt' forces a mkdir over the just-written SKILL.md file.
    const outcome = await installUpload(root, [
      { path: 'SKILL.md', contentBase64: b64(skillMd('broken-up')) },
      { path: 'SKILL.md/x.txt', contentBase64: b64('x') },
    ], 'skip', async () => {})
    expect(outcome.status).toBe('skipped')
    const residue = await readdir(root.path).catch(() => [] as string[])
    expect(residue).toEqual([])
  })
})

describe('installUpload', () => {
  it('never installs .DS_Store cruft from dropped folders', async () => {
    const root = makeRoot(join(dir, 'target'))
    const b64 = (text: string) => Buffer.from(text).toString('base64')
    const outcome = await installUpload(root, [
      { path: 'dropped/.DS_Store', contentBase64: b64('junk') },
      { path: 'dropped/SKILL.md', contentBase64: b64(skillMd('dropped')) },
      { path: 'dropped/assets/.DS_Store', contentBase64: b64('junk') },
      { path: 'dropped/assets/a.txt', contentBase64: b64('a') },
    ], 'skip', async () => {})
    expect(outcome.status).toBe('imported')
    const installed = await enumerateRoot(root)
    expect(installed.map(s => s.name)).toEqual(['dropped'])
    await expect(readFile(join(root.path, 'dropped', '.DS_Store'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(root.path, 'dropped', 'assets', '.DS_Store'), 'utf8')).rejects.toThrow()
    expect((await readFile(join(root.path, 'dropped', 'assets', 'a.txt'), 'utf8'))).toBe('a')
  })
})

describe('writableRoots + enumerateRoot', () => {
  it('lists directory and flat skills in a root', async () => {
    const rootPath = join(dir, 'skills')
    await mkdir(join(rootPath, 'bundle'), { recursive: true })
    await writeFile(join(rootPath, 'bundle', 'SKILL.md'), skillMd('bundle'))
    await writeFile(join(rootPath, 'flat.md'), skillMd('flat'))

    const roots = writableRoots([])
    const root = makeRoot(rootPath)
    const skills = await enumerateRoot(root)
    expect(skills.map(s => `${s.name}:${s.kind}`).sort()).toEqual(['bundle:directory', 'flat:file'])
    expect(roots.length).toBeGreaterThanOrEqual(2)
  })
})
