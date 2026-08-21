import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diagnoseRoot } from '../src/diagnose.ts'
import type { SkillRoot } from '../src/roots.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-diagnose-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const skill = async (name: string, content: string): Promise<void> => {
  const path = join(dir, name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'SKILL.md'), content)
}

describe('diagnoseRoot', () => {
  it('reports each host-ignorable skill with its reason', async () => {
    await skill('good', '---\nname: good\ndescription: fine\n---\nbody\n')
    await skill('no-fm', '# just markdown\n')
    await skill('bad-yaml', '---\nname: bad-yaml\ndescription: 消化。keywords: 知识消化\n---\nbody\n')
    await skill('no-name', '---\ndescription: x\n---\nbody\n')
    await skill('Upper', '---\nname: Upper\ndescription: x\n---\nbody\n')
    await skill('no-desc', '---\nname: no-desc\n---\nbody\n')
    await skill('legacy', '---\nname: legacy\ndescription: x\nmodelInvocable: true\n---\nbody\n')
    const root: SkillRoot = { id: 'test', label: 'test', path: dir, writable: true }

    const diagnoses = await diagnoseRoot(root)
    const byName = new Map(diagnoses.map(d => [d.name, d.reason]))
    expect(byName.get('no-fm')).toBe('missing-frontmatter')
    expect(byName.get('bad-yaml')).toBe('invalid-yaml')
    expect(byName.get('no-name')).toBe('missing-name')
    expect(byName.get('Upper')).toBe('invalid-name')
    expect(byName.get('no-desc')).toBe('missing-description')
    expect(byName.get('legacy')).toBe('legacy-invocation-key')
    expect(diagnoses).toHaveLength(6)
  })
})
