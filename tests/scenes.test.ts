import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertSceneName, assignScene, qualify, readScenes, unassignScene } from '../src/scenes.ts'

let dir: string
let prevHome: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'station-scenes-'))
  prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(dir, 'dsh-home')
})

afterEach(async () => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  await rm(dir, { recursive: true, force: true })
})

describe('scenes', () => {
  it('assigns, persists, and unassigns', async () => {
    const skill = qualify('user-dsh', 'my-skill')
    const after = await assignScene('写作', skill)
    expect(after['写作']).toEqual([skill])
    // A fresh read sees the same map (durably written).
    expect((await readScenes())['写作']).toEqual([skill])

    const removed = await unassignScene('写作', skill)
    expect(removed['写作']).toBeUndefined()
    expect(await readScenes()).toEqual({})
  })

  it('dedupes repeated assignment', async () => {
    const skill = qualify('user-dsh', 'x')
    await assignScene('工程', skill)
    const map = await assignScene('工程', skill)
    expect(map['工程']).toEqual([skill])
  })

  it('rejects unusable scene names', () => {
    for (const bad of ['', '   ', 'a/b', 'a\nb', 'x'.repeat(31)]) {
      expect(() => assertSceneName(bad)).toThrow()
    }
    expect(assertSceneName(' 摸鱼 ')).toBe('摸鱼')
  })
})
