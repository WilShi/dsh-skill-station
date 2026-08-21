/**
 * Skill export: package one installed skill (directory bundle or flat file)
 * into a zip download. Entries carry the skill's folder name so an unzip
 * restores the original layout — re-importing the archive through the
 * station's zip install reproduces the skill verbatim.
 */

import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import yazl from 'yazl'
import type { DiskSkill } from './roots.js'

/**
 * Build the zip archive for one skill.
 * @param skill - the disk skill to package.
 * @returns the complete archive bytes.
 */
export async function skillToZip(skill: DiskSkill): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  if (skill.kind === 'file') {
    zip.addFile(skill.path, basename(skill.path))
  } else {
    const prefix = basename(skill.path)
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue
        const from = join(dir, entry.name)
        const name = rel === '' ? `${prefix}/${entry.name}` : `${rel}/${entry.name}`
        if (entry.isDirectory()) await walk(from, name)
        else if (entry.isFile()) zip.addFile(from, name)
      }
    }
    await walk(skill.path, '')
  }
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
  zip.end()
  return done
}
