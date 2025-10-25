import { describe, it, expect } from 'vitest'
import { join } from '../../src/utils/join.js'

describe('join - performance benchmarks', () => {
  it('should efficiently handle typical git paths', () => {
    const iterations = 10000
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      join('.git', 'objects', 'pack')
      join('/repo', '.git', 'refs', 'heads', 'main')
      join('src', '../dist', 'index.js')
      join('foo', 'bar', '..', 'baz')
    }

    const duration = performance.now() - start
    const opsPerMs = (iterations * 4) / duration

    // Should complete in reasonable time (>1000 ops/ms)
    expect(opsPerMs).toBeGreaterThan(1000)
  })

  it('should handle deep paths efficiently', () => {
    const deepPath = Array(50)
      .fill(null)
      .map((_, i) => `level${i}`)

    const start = performance.now()
    const result = join(...deepPath)
    const duration = performance.now() - start

    expect(result).toBe(deepPath.join('/'))
    expect(duration).toBeLessThan(1) // Should be sub-millisecond
  })

  it('should handle complex normalization efficiently', () => {
    const iterations = 1000
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      join('foo', '..', 'bar', '.', 'baz', '..', 'qux')
      join('//foo///bar//', './baz', '../qux')
      join('a/b/c', '../../d/e', '../f')
    }

    const duration = performance.now() - start
    const opsPerMs = (iterations * 3) / duration

    // Should handle complex paths efficiently
    expect(opsPerMs).toBeGreaterThan(500)
  })
})
