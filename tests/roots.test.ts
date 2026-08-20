import { describe, expect, it } from 'vitest'
import { assertSafeRelative } from '../src/roots.ts'

describe('assertSafeRelative', () => {
  it('accepts deeply nested vendored paths', () => {
    // Real skills ship dependency trees (the xhs-downloader beartype path
    // that used to trip the old 8-segment cap).
    const deep = 'xhs-downloader/libs/beartype/_util/hint/pep/proposal/pep484/pep484generic.py'
    expect(assertSafeRelative(deep)).toBe(deep)
  })

  it('rejects traversal, absolute, and backslash paths', () => {
    for (const bad of ['../evil.md', 'a/./b.md', '/etc/passwd', 'a\\b.md', 'a//b.md']) {
      expect(() => assertSafeRelative(bad)).toThrow()
    }
  })
})
