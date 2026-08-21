/**
 * Discovery diagnostics: mirror the host skill loader's acceptance rules on
 * each writable root's disk skills and report every skill the host would
 * ignore, with the reason. The host loader (skill-filesystem) uses strict
 * YAML and rejects: invalid YAML, missing frontmatter, missing name or
 * description, non-kebab names, and legacy camelCase invocation keys.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { splitFrontmatter } from './frontmatter.js'
import { isSkillName } from './importer.js'
import { enumerateRoot, type SkillRoot } from './roots.js'

/** Why the host would ignore one disk skill. */
export interface Diagnosis {
  readonly rootId: string
  readonly name: string
  readonly path: string
  readonly reason:
    | 'missing-frontmatter'
    | 'invalid-yaml'
    | 'missing-name'
    | 'missing-description'
    | 'invalid-name'
    | 'legacy-invocation-key'
  readonly detail: string
}

const LEGACY_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable'] as const

/**
 * Diagnose one root's disk skills against the host's strict acceptance rules.
 * @param root - the root to inspect.
 * @returns one diagnosis per skill the host would ignore.
 */
export async function diagnoseRoot(root: SkillRoot): Promise<Diagnosis[]> {
  const out: Diagnosis[] = []
  for (const skill of await enumerateRoot(root)) {
    const file = skill.kind === 'file' ? skill.path : join(skill.path, 'SKILL.md')
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'invalid-yaml', detail: String(error) })
      continue
    }
    const lines = text.split('\n')
    if (lines[0]?.trim() !== '---') {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'missing-frontmatter', detail: '文件开头没有 --- frontmatter 块' })
      continue
    }
    const split = splitFrontmatter(text)
    if (split === null) {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'invalid-yaml', detail: 'frontmatter 不是合法 YAML（常见原因:description 里有未加引号的冒号）' })
      continue
    }
    const legacy = LEGACY_KEYS.find(key => key in split.data)
    if (legacy !== undefined) {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'legacy-invocation-key', detail: `宿主拒绝旧式键名 \`${legacy}\`（应改用连字符形式）` })
      continue
    }
    const name = split.data['name']
    if (typeof name !== 'string' || name === '') {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'missing-name', detail: 'frontmatter 缺少 name 字段' })
      continue
    }
    if (!isSkillName(name)) {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'invalid-name', detail: `name \"${name}\" 不是 kebab-case` })
      continue
    }
    const description = split.data['description']
    if (typeof description !== 'string' || description === '') {
      out.push({ rootId: root.id, name: skill.name, path: skill.path, reason: 'missing-description', detail: 'frontmatter 缺少 description 字段' })
    }
  }
  return out
}
