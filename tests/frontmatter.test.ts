import { describe, expect, it } from 'vitest'
import { readSkillMeta, setFlag, splitFrontmatter } from '../src/frontmatter.ts'

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
