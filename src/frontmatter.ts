/**
 * SKILL.md frontmatter parsing and surgical rewriting.
 *
 * DSH skills carry YAML frontmatter with required `name`/`description` and
 * optional invocation flags. Toggle operations rewrite one boolean flag while
 * preserving every other byte of the file: existing keys are replaced
 * line-wise, absent keys are inserted before the closing delimiter, and files
 * without frontmatter are left untouched (they are not loadable skills).
 */

import { parse as parseYaml } from 'yaml'

/** Parsed invocation-relevant frontmatter fields of one skill file. */
export interface SkillMeta {
  readonly name?: string
  readonly description?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** Frontmatter split result: parsed data plus the untouched body. */
export interface FrontmatterSplit {
  readonly data: Record<string, unknown>
  readonly body: string
}

const DELIMITER = '---'

/**
 * Split a skill file into frontmatter data and body.
 * @param text - complete SKILL.md content.
 * @returns parsed frontmatter and body, or null when the file has no frontmatter block.
 */
export function splitFrontmatter(text: string): FrontmatterSplit | null {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== DELIMITER) return null
  let close = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === DELIMITER) {
      close = i
      break
    }
  }
  if (close === -1) return null
  const header = lines.slice(1, close).join('\n')
  let data: unknown
  try {
    data = parseYaml(header)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  return { data: data as Record<string, unknown>, body: lines.slice(close + 1).join('\n') }
}

/**
 * Read invocation metadata from one skill file's frontmatter.
 * @param text - complete SKILL.md content.
 * @returns parsed metadata, or null when the file has no parseable frontmatter.
 */
export function readSkillMeta(text: string): SkillMeta | null {
  const split = splitFrontmatter(text)
  if (split === null) return null
  const { data } = split
  const disableModel = data['disable-model-invocation']
  const userInvocable = data['user-invocable']
  return {
    ...(typeof data['name'] === 'string' ? { name: data['name'] } : {}),
    ...(typeof data['description'] === 'string' ? { description: data['description'] } : {}),
    modelInvocable: disableModel !== true,
    userInvocable: userInvocable !== false,
  }
}

const FLAG_KEYS = ['disable-model-invocation', 'user-invocable'] as const

/** One invocation flag the toggle route may rewrite. */
export type FlagKey = (typeof FLAG_KEYS)[number]

/**
 * Return whether a frontmatter key is a toggleable invocation flag.
 * @param key - candidate frontmatter key.
 * @returns whether the key is one of the supported invocation flags.
 */
export function isFlagKey(key: string): key is FlagKey {
  return (FLAG_KEYS as readonly string[]).includes(key)
}

/**
 * Rewrite one boolean invocation flag, preserving all other content. Each key
 * stores its non-default state: `disable-model-invocation: true` marks a
 * disabled skill (absent means enabled), while `user-invocable: false` marks
 * a user-hidden skill (absent means invocable). Writing the default value
 * removes the line instead. Files without frontmatter are returned unchanged.
 * @param text - complete SKILL.md content.
 * @param key - frontmatter flag key to rewrite.
 * @param value - target boolean value for the flag's own semantics.
 * @returns the rewritten file content, unchanged when no frontmatter exists.
 */
export function setFlag(text: string, key: FlagKey, value: boolean): string {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== DELIMITER) return text
  let close = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === DELIMITER) {
      close = i
      break
    }
  }
  if (close === -1) return text
  const nonDefault = key === 'user-invocable' ? !value : value
  const pattern = new RegExp(`^\\s*${key}\\s*:`)
  let found = false
  for (let i = 1; i < close; i += 1) {
    if (pattern.test(lines[i] ?? '')) {
      if (nonDefault) lines[i] = `${key}: ${String(value)}`
      else lines.splice(i, 1)
      found = true
      break
    }
  }
  if (!found && nonDefault) lines.splice(close, 0, `${key}: ${String(value)}`)
  return lines.join('\n')
}
