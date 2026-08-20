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
 * Read invocation metadata from one skill file's frontmatter. Strict YAML
 * first; when the header is not valid YAML (real-world skills carry
 * unquoted colons in descriptions), flat top-level scalars are salvaged
 * line-wise so name/description still resolve.
 * @param text - complete SKILL.md content.
 * @returns parsed metadata, or null when no frontmatter block exists.
 */
export function readSkillMeta(text: string): SkillMeta | null {
  const split = splitFrontmatter(text)
  if (split === null) return salvageMeta(text)
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

/** Line-wise fallback for frontmatter that is not strict YAML. */
function salvageMeta(text: string): SkillMeta | null {
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
  let name: string | undefined
  let description: string | undefined
  let disableModel = false
  let userInvocable = true
  for (const line of lines.slice(1, close)) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    const value = unquote(match[2] ?? '')
    switch (match[1]) {
      case 'name': name = value; break
      case 'description': description = value; break
      case 'disable-model-invocation': disableModel = value === 'true'; break
      case 'user-invocable': userInvocable = value !== 'false'; break
      default: break
    }
  }
  if (name === undefined && description === undefined) return null
  return {
    ...(name !== undefined && name !== '' ? { name } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
    modelInvocable: !disableModel,
    userInvocable,
  }
}

/** Strip one matching pair of surrounding quotes from a scalar. */
function unquote(value: string): string {
  const trimmed = value.trim()
  const first = trimmed[0]
  if ((first === '"' || first === "'") && trimmed.length >= 2 && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Repair a SKILL.md whose frontmatter is not strict YAML by double-quoting
 * each offending top-level scalar (guided by the parser's error position),
 * so strict consumers — the DSH skill loader — accept the installed copy.
 * @param text - complete SKILL.md content.
 * @returns the repaired file, or null when the frontmatter is already valid
 * or cannot be repaired line-wise.
 */
export function repairFrontmatter(text: string): string | null {
  if (splitFrontmatter(text) !== null) return null
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
  const header = lines.slice(1, close)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      parseYaml(header.join('\n'))
      return [lines[0] ?? DELIMITER, ...header, ...lines.slice(close)].join('\n')
    } catch (error) {
      const line = (error as { linePos?: [{ line?: unknown }] }).linePos?.[0]?.line
      if (typeof line !== 'number' || line < 1 || line > header.length) return null
      const index = line - 1
      const match = /^(\s*[A-Za-z][\w-]*\s*:)\s*(\S.*)$/.exec(header[index] ?? '')
      if (match === null) return null
      const value = match[2] ?? ''
      if (value.startsWith('"') || value.startsWith("'")) return null
      header[index] = `${match[1]} ${JSON.stringify(value)}`
    }
  }
  return null
}

/**
 * Rewrite the frontmatter `name` field, preserving all other content. The
 * existing line is replaced in place; a missing name is inserted before the
 * closing delimiter. Files without frontmatter are returned unchanged.
 * @param text - complete SKILL.md content.
 * @param name - replacement kebab-case skill name.
 * @returns the rewritten file content.
 */
export function setName(text: string, name: string): string {
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
  const pattern = /^\s*name\s*:/
  for (let i = 1; i < close; i += 1) {
    if (pattern.test(lines[i] ?? '')) {
      lines[i] = `name: ${name}`
      return lines.join('\n')
    }
  }
  lines.splice(close, 0, `name: ${name}`)
  return lines.join('\n')
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
