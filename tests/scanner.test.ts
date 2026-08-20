import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expandHome, assertSafeRelative, assertContained, type SkillRoot } from '../src/roots.ts'
import { scanSources, type SourceSpec } from '../src/scanner.ts'
import { emptyTrash, listTrash, moveToTrash, restoreTrash } from '../src/trash.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-scan-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('expandHome', () => {
  it('expands ~ and resolves plain paths', () => {
    expect(expandHome('~/x').endsWith('/x')).toBe(true)
    expect(expandHome('~/x').startsWith('~')).toBe(false)
  })
})

describe('assertSafeRelative', () => {
  it('accepts simple relative paths', () => {
    expect(assertSafeRelative('assets/x.png')).toBe('assets/x.png')
  })

  it('rejects traversal and absolute paths', () => {
    expect(() => assertSafeRelative('../etc/passwd')).toThrow()
    expect(() => assertSafeRelative('/etc/passwd')).toThrow()
    expect(() => assertSafeRelative('a//b')).toThrow()
    expect(() => assertSafeRelative('a\\b')).toThrow()
    expect(() => assertSafeRelative('')).toThrow()
  })
})

describe('assertContained', () => {
  const root: SkillRoot = { id: 'r', label: 'r', path: '/base/root', writable: true }

  it('accepts paths inside the root', () => {
    expect(assertContained(root, '/base/root/skill/SKILL.md')).toBe('/base/root/skill/SKILL.md')
  })

  it('rejects escaping paths', () => {
    expect(() => assertContained(root, '/base/root/../evil')).toThrow()
    expect(() => assertContained(root, '/base/other')).toThrow()
    expect(() => assertContained(root, 'relative/path')).toThrow()
  })
})

describe('scanSources', () => {
  it('finds candidates and flags conflicts', async () => {
    const claudeDir = join(dir, 'claude', 'skills')
    await mkdir(join(claudeDir, 'good-skill'), { recursive: true })
    await writeFile(join(claudeDir, 'good-skill', 'SKILL.md'), '---\nname: good-skill\ndescription: works\n---\nbody\n')
    await mkdir(join(claudeDir, 'conflicted'), { recursive: true })
    await writeFile(join(claudeDir, 'conflicted', 'SKILL.md'), '---\nname: conflicted\ndescription: dup\n---\nbody\n')
    await mkdir(join(claudeDir, 'no-manifest'))

    const sources: SourceSpec[] = [{ id: 'claude', label: 'Claude Code', userDirs: [claudeDir], projectDirs: [] }]
    const reports = await scanSources(sources, [{ name: 'conflicted', rootId: 'user-dsh', kind: 'directory', path: '/x', meta: null, mtimeMs: 0 }])
    expect(reports).toHaveLength(1)
    const candidates = reports[0]!.candidates
    expect(candidates.map(c => c.name)).toEqual(['conflicted', 'good-skill'])
    expect(candidates.find(c => c.name === 'conflicted')?.conflict).toBe(true)
    expect(candidates.find(c => c.name === 'good-skill')?.conflict).toBe(false)
    expect(reports[0]!.scannedDirs).toEqual([claudeDir])
  })

  it('reports empty for missing directories', async () => {
    const sources: SourceSpec[] = [{ id: 'codex', label: 'Codex', userDirs: [join(dir, 'missing')], projectDirs: [] }]
    const reports = await scanSources(sources, [])
    expect(reports[0]!.candidates).toEqual([])
    expect(reports[0]!.scannedDirs).toEqual([])
  })

  it('scans project directories relative to the workspace', async () => {
    const ws = join(dir, 'workspace')
    await mkdir(join(ws, '.claude', 'skills', 'proj-skill'), { recursive: true })
    await writeFile(join(ws, '.claude', 'skills', 'proj-skill', 'SKILL.md'), '---\nname: proj-skill\ndescription: p\n---\n')
    const sources: SourceSpec[] = [{ id: 'claude', label: 'Claude', userDirs: [], projectDirs: ['.claude/skills'] }]
    const reports = await scanSources(sources, [], ws)
    expect(reports[0]!.candidates.map(c => `${c.name}:${c.scope}`)).toEqual(['proj-skill:project'])
  })
})

describe('trash lifecycle', () => {
  it('moves, lists, restores, and empties', async () => {
    process.env.DSH_HOME = join(dir, 'dsh-home')
    const skillDir = join(dir, 'skills', 'victim')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: victim\ndescription: v\n---\n')

    const id = await moveToTrash(skillDir, 'victim', 'user-dsh')
    const entries = await listTrash()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.manifest.name).toBe('victim')
    expect(entries[0]!.id).toBe(id)

    const error = await restoreTrash(id)
    expect(error).toBeNull()
    expect(await listTrash()).toHaveLength(0)
    await expect(import('node:fs/promises').then(fs => fs.stat(skillDir))).resolves.toBeDefined()

    // Delete again and empty permanently.
    await moveToTrash(skillDir, 'victim', 'user-dsh')
    await emptyTrash()
    expect(await listTrash()).toHaveLength(0)
    delete process.env.DSH_HOME
  })

  it('fails restore when the origin is occupied', async () => {
    process.env.DSH_HOME = join(dir, 'dsh-home2')
    const skillDir = join(dir, 'skills2', 'victim')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: victim\ndescription: v\n---\n')
    const id = await moveToTrash(skillDir, 'victim', 'user-dsh')
    await mkdir(skillDir, { recursive: true })
    const error = await restoreTrash(id)
    expect(error).toContain('restore failed')
    delete process.env.DSH_HOME
  })
})
