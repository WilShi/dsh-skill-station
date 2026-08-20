import { describe, expect, it } from 'vitest'
import { readSkillMeta, repairFrontmatter, setFlag, splitFrontmatter } from '../src/frontmatter.ts'

describe('splitFrontmatter', () => {
  it('splits a standard frontmatter block', () => {
    const split = splitFrontmatter('---\nname: my-skill\ndescription: Does things\n---\nbody text\n')
    expect(split?.data).toEqual({ name: 'my-skill', description: 'Does things' })
    expect(split?.body).toBe('body text\n')
  })

  it('returns null without a frontmatter block', () => {
    expect(splitFrontmatter('# just markdown\n')).toBeNull()
  })

  it('returns null when the closing delimiter is missing', () => {
    expect(splitFrontmatter('---\nname: x\nbody\n')).toBeNull()
  })

  it('returns null on invalid YAML', () => {
    expect(splitFrontmatter('---\nname: [unclosed\n---\nbody\n')).toBeNull()
  })
})

describe('readSkillMeta', () => {
  it('defaults both invocation flags to enabled', () => {
    const meta = readSkillMeta('---\nname: a\ndescription: b\n---\n')
    expect(meta).toEqual({ name: 'a', description: 'b', modelInvocable: true, userInvocable: true })
  })

  it('reads disable-model-invocation and user-invocable', () => {
    const meta = readSkillMeta('---\nname: a\ndescription: b\ndisable-model-invocation: true\nuser-invocable: false\n---\n')
    expect(meta?.modelInvocable).toBe(false)
    expect(meta?.userInvocable).toBe(false)
  })

  it('salvages flat scalars when a description carries an unquoted colon', () => {
    // Real-world shape (openclaw knowledge-studio): strict YAML rejects the
    // second colon; the skill is fine in lenient consumers.
    const text = '---\nname: knowledge-studio\nversion: 1.0.0\ndescription: 消化文档。Also triggers on keywords: 知识消化, 闪卡\n---\nbody\n'
    const meta = readSkillMeta(text)
    expect(meta?.name).toBe('knowledge-studio')
    expect(meta?.description).toContain('知识消化')
    expect(meta?.modelInvocable).toBe(true)
  })

  it('returns null when there is no frontmatter block at all', () => {
    expect(readSkillMeta('# just markdown\n')).toBeNull()
  })
})

describe('repairFrontmatter', () => {
  it('returns null for already-valid frontmatter', () => {
    expect(repairFrontmatter('---\nname: a\ndescription: b\n---\nbody\n')).toBeNull()
  })

  it('returns null when there is no frontmatter block', () => {
    expect(repairFrontmatter('# just markdown\n')).toBeNull()
  })

  it('quotes the offending scalar so strict YAML accepts the file', () => {
    const text = '---\nname: knowledge-studio\ndescription: 消化文档。Also triggers on keywords: 知识消化, 闪卡\n---\n# body\n'
    const repaired = repairFrontmatter(text)
    expect(repaired).not.toBeNull()
    const split = splitFrontmatter(repaired ?? '')
    expect(split?.data['name']).toBe('knowledge-studio')
    expect(split?.data['description']).toContain('知识消化')
    expect(repaired?.endsWith('# body\n')).toBe(true)
  })
})

describe('setFlag', () => {
  const base = '---\nname: a\ndescription: b\n---\nbody\n'

  it('adds a flag before the closing delimiter', () => {
    expect(setFlag(base, 'disable-model-invocation', true)).toBe('---\nname: a\ndescription: b\ndisable-model-invocation: true\n---\nbody\n')
  })

  it('removes the flag when the value is false', () => {
    const withFlag = setFlag(base, 'disable-model-invocation', true)
    expect(setFlag(withFlag, 'disable-model-invocation', false)).toBe(base)
  })

  it('replaces an existing flag line in place', () => {
    const text = '---\nname: a\nuser-invocable: false\ndescription: b\n---\nbody\n'
    expect(setFlag(text, 'user-invocable', true)).toBe('---\nname: a\ndescription: b\n---\nbody\n')
  })

  it('leaves frontmatter-less files untouched', () => {
    expect(setFlag('plain body', 'disable-model-invocation', true)).toBe('plain body')
  })

  it('preserves unrelated fields and body bytes', () => {
    const text = '---\nname: a\ncustom: keep-me\ndescription: b\n---\n\n# heading\ncontent\n'
    const toggled = setFlag(text, 'disable-model-invocation', true)
    expect(toggled).toContain('custom: keep-me')
    expect(toggled.endsWith('# heading\ncontent\n')).toBe(true)
  })
})
