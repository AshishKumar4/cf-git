import { describe, it, expect } from 'vitest'
import { join } from '../../src/utils/join.js'
import AsyncLock from '../../src/utils/AsyncLock.js'

describe('join (Workers environment)', () => {
  it('should join paths', () => {
    expect(join('a', 'b', 'c')).toBe('a/b/c')
  })

  it('should handle empty paths', () => {
    expect(join()).toBe('.')
    expect(join('')).toBe('.')
  })

  it('should normalize slashes', () => {
    expect(join('a//b', 'c')).toBe('a/b/c')
  })

  it('should handle absolute paths', () => {
    expect(join('/a', 'b')).toBe('/a/b')
  })
})

describe('AsyncLock (Workers environment)', () => {
  it('should acquire and release lock', async () => {
    const lock = new AsyncLock()
    const release = await lock.acquire('test')
    expect(typeof release).toBe('function')
    release()
  })

  it('should prevent concurrent access', async () => {
    const lock = new AsyncLock()
    const results = []

    async function task(id) {
      await lock.run('key', async () => {
        results.push(`start-${id}`)
        await new Promise((resolve) => setTimeout(resolve, 10))
        results.push(`end-${id}`)
      })
    }

    await Promise.all([task(1), task(2)])

    // Tasks should run sequentially, not interleaved
    expect(results).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('should handle array keys', async () => {
    const lock = new AsyncLock()
    const release = await lock.acquire(['a', 'b'])
    expect(typeof release).toBe('function')
    release()
  })
})
