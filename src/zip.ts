/**
 * ZIP upload decoding: turns one uploaded archive into the shared UploadFile
 * list so every install safeguard in importer.ts (prefix strip, frontmatter
 * validation, containment, size caps) applies unchanged. Entry names are
 * normalized (Windows-made archives use backslashes) and validated with the
 * same relative-path rules as the JSON upload route; macOS archive cruft is
 * dropped here.
 */

import unzipper from 'unzipper'
import type { UploadFile } from './importer.js'
import { assertSafeRelative } from './roots.js'

/** Bounded entry count so a hostile archive cannot exhaust memory by entry spam. */
const MAX_ENTRIES = 10_000
/** Decompressed total cap, mirroring the importer's install bound. */
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024

/**
 * Decode one zip archive into upload files.
 * @param data - the complete archive bytes (already bounded by the request body cap).
 * @returns normalized upload files, directories stripped.
 * @throws when the archive is invalid, empty, over an entry/size cap, or carries unsafe paths.
 */
export async function zipToUploadFiles(data: Uint8Array): Promise<UploadFile[]> {
  let directory: unzipper.CentralDirectory
  try {
    directory = await unzipper.Open.buffer(Buffer.from(data))
  } catch {
    throw new Error('not a valid zip archive')
  }
  const entries = directory.files.filter(file => file.type === 'File')
  if (entries.length === 0) throw new Error('the zip archive contains no files')
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`the zip archive has too many files (${String(entries.length)} > ${String(MAX_ENTRIES)})`)
  }
  const files: UploadFile[] = []
  let total = 0
  for (const entry of entries) {
    const normalized = entry.path.replaceAll('\\', '/')
    const segments = normalized.split('/')
    if (segments[0] === '__MACOSX') continue
    if (segments[segments.length - 1] === '.DS_Store') continue
    const buffer = await entry.buffer()
    total += buffer.byteLength
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('the zip archive exceeds the size cap after decompression')
    files.push({ path: assertSafeRelative(normalized), contentBase64: buffer.toString('base64') })
  }
  return files
}
