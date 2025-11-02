import { describe, test, expect } from 'vitest'
import { DeltaIndex } from '../src/utils/deltaIndex.js'
import { RABIN_WINDOW } from '../src/utils/rabinFingerprint.js'

describe('DeltaIndex - Construction', () => {
  test('creates index from buffer', () => {
    const source = Buffer.from('hello world this is a test')
    const index = new DeltaIndex(source)

    const stats = index.getStats()
    expect(stats.sourceSize).toBe(source.length)
    expect(stats.entries).toBeGreaterThan(0)
    expect(stats.hashBuckets).toBeGreaterThan(0)
  })

  test('handles small sources', () => {
    const source = Buffer.from('short')
    const index = new DeltaIndex(source)

    const stats = index.getStats()
    expect(stats.entries).toBe(0) // Too small to index
    expect(stats.hashBuckets).toBe(0)
  })

  test('throws on non-buffer input', () => {
    expect(() => {
      new DeltaIndex('not a buffer')
    }).toThrow('must be a Buffer')
  })

  test('throws on too large source', () => {
    const huge = Buffer.alloc(101 * 1024 * 1024) // > 100MB

    expect(() => {
      new DeltaIndex(huge)
    }).toThrow('too large')
  })

  test('builds index with reasonable load factor', () => {
    const source = Buffer.from(
      'the quick brown fox jumps over the lazy dog'.repeat(10)
    )
    const index = new DeltaIndex(source)

    const stats = index.getStats()
    expect(stats.loadFactor).toBeGreaterThan(0)
    expect(stats.loadFactor).toBeLessThanOrEqual(1)
  })
})

describe('DeltaIndex - Match Finding', () => {
  test('finds exact match', () => {
    const source = Buffer.from('the quick brown fox jumps over the lazy dog')
    const index = new DeltaIndex(source)

    const target = Buffer.from('quick brown fox')
    const match = index.findMatch(target, 0)

    expect(match).not.toBeNull()
    expect(match.length).toBeGreaterThanOrEqual(RABIN_WINDOW)

    // Verify match content
    const matchedData = source.slice(
      match.srcOffset,
      match.srcOffset + match.length
    )
    const targetData = target.slice(0, match.length)
    expect(matchedData.equals(targetData)).toBe(true)
  })

  test('finds longest match among collisions', () => {
    const source = Buffer.from('abcdefghijklmnopqrstuvwxyz'.repeat(10))
    const index = new DeltaIndex(source)

    const target = Buffer.from('defghijklmnopqrstuvwxyz')
    const match = index.findMatch(target, 0)

    expect(match).not.toBeNull()
    expect(match.length).toBe(target.length)
  })

  test('returns null for no match', () => {
    const source = Buffer.from('abcdefghijklmnop')
    const index = new DeltaIndex(source)

    const target = Buffer.from('zyxwvutsrqponmlk')
    const match = index.findMatch(target, 0)

    expect(match).toBeNull()
  })

  test('returns null when not enough bytes left', () => {
    const source = Buffer.from('hello world test data here')
    const index = new DeltaIndex(source)

    const target = Buffer.from('test data')
    const match = index.findMatch(target, target.length - 5) // Only 5 bytes left

    expect(match).toBeNull()
  })

  test('matches at different target positions', () => {
    const source = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')
    const index = new DeltaIndex(source)

    const target = Buffer.from('XXX456789abcdefghijklYYY')

    // Should find match starting at position 3 in target
    const match = index.findMatch(target, 3)
    expect(match).not.toBeNull()
    expect(match.length).toBeGreaterThanOrEqual(16) // At least RABIN_WINDOW
  })
})

describe('DeltaIndex - Binary Data', () => {
  test('handles binary data', () => {
    const source = Buffer.from([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
    ])
    const index = new DeltaIndex(source)

    const target = Buffer.from([
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
    ])
    const match = index.findMatch(target, 0)

    expect(match).not.toBeNull()
    expect(match.srcOffset).toBe(3)
    expect(match.length).toBeGreaterThanOrEqual(RABIN_WINDOW)
  })

  test('handles data with nulls', () => {
    const source = Buffer.from([
      0,
      0,
      0,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
    ])
    const index = new DeltaIndex(source)

    const target = Buffer.from([
      0,
      0,
      0,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
    ])
    const match = index.findMatch(target, 0)

    expect(match).not.toBeNull()
  })

  test('handles repetitive binary patterns', () => {
    const pattern = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])
    const source = Buffer.concat([pattern, pattern, pattern, pattern, pattern])
    const index = new DeltaIndex(source)

    const target = Buffer.concat([pattern, pattern, pattern])
    const match = index.findMatch(target, 0)

    expect(match).not.toBeNull()
    expect(match.length).toBeGreaterThanOrEqual(RABIN_WINDOW)
  })
})

describe('DeltaIndex - Performance', () => {
  test('indexes large source quickly', () => {
    const source = Buffer.alloc(1024 * 1024) // 1MB
    for (let i = 0; i < source.length; i++) {
      source[i] = i % 256
    }

    const start = Date.now()
    const index = new DeltaIndex(source)
    const indexTime = Date.now() - start

    // Indexing should be fast (< 500ms for 1MB)
    expect(indexTime).toBeLessThan(500)

    const stats = index.getStats()
    expect(stats.entries).toBeGreaterThan(0)
  })

  test('finds match quickly', () => {
    const source = Buffer.alloc(1024 * 1024) // 1MB
    for (let i = 0; i < source.length; i++) {
      source[i] = i % 256
    }

    const index = new DeltaIndex(source)

    // Find match should be very fast
    const target = source.slice(1000, 1100)
    const matchStart = Date.now()
    const match = index.findMatch(target, 0)
    const matchTime = Date.now() - matchStart

    expect(match).not.toBeNull()
    expect(matchTime).toBeLessThan(10)
  })

  test('handles multiple lookups efficiently', () => {
    const source = Buffer.alloc(100000)
    for (let i = 0; i < source.length; i++) {
      source[i] = (i * 7) % 256
    }

    const index = new DeltaIndex(source)

    const start = Date.now()
    for (let i = 0; i < 100; i++) {
      const pos = Math.floor(Math.random() * (source.length - 100))
      const target = source.slice(pos, pos + 50)
      index.findMatch(target, 0)
    }
    const duration = Date.now() - start

    // 100 lookups should be fast
    expect(duration).toBeLessThan(100)
  })
})

describe('DeltaIndex - Multiple Matches', () => {
  test('findAllMatches returns all collision matches', () => {
    const pattern = 'abcdefghijklmnop'
    const source = Buffer.from(pattern + 'XXX' + pattern + 'YYY' + pattern)
    const index = new DeltaIndex(source)

    const target = Buffer.from(pattern)
    const matches = index.findAllMatches(target, 0)

    // Should find all three occurrences
    expect(matches.length).toBeGreaterThanOrEqual(1)

    // Verify each match
    for (const match of matches) {
      const matchedData = source.slice(
        match.srcOffset,
        match.srcOffset + match.length
      )
      const targetData = target.slice(0, match.length)
      expect(matchedData.equals(targetData)).toBe(true)
    }
  })

  test('findAllMatches returns empty for no matches', () => {
    const source = Buffer.from('abcdefghijklmnopqrstuvwxyz')
    const index = new DeltaIndex(source)

    const target = Buffer.from('zyxwvutsrqponmlk')
    const matches = index.findAllMatches(target, 0)

    expect(matches).toEqual([])
  })

  test('findMatch returns longest among all matches', () => {
    // Create source with same prefix but different lengths
    const prefix = 'common_prefix_here_'
    const source = Buffer.from(
      prefix +
        'short' +
        '___' +
        prefix +
        'medium_length' +
        '___' +
        prefix +
        'very_long_suffix_here'
    )
    const index = new DeltaIndex(source)

    const target = Buffer.from(prefix + 'very_long_suffix_here')
    const bestMatch = index.findMatch(target, 0)
    const allMatches = index.findAllMatches(target, 0)

    expect(allMatches.length).toBeGreaterThan(0)

    // Best match should be the longest
    const longestInAll = Math.max(...allMatches.map(m => m.length))
    expect(bestMatch.length).toBe(longestInAll)
  })
})

describe('DeltaIndex - Statistics', () => {
  test('getStats returns valid statistics', () => {
    const source = Buffer.from(
      'the quick brown fox jumps over the lazy dog'.repeat(5)
    )
    const index = new DeltaIndex(source)

    const stats = index.getStats()

    expect(stats.sourceSize).toBe(source.length)
    expect(stats.entries).toBeGreaterThan(0)
    expect(stats.hashBuckets).toBeGreaterThan(0)
    expect(stats.avgChainLength).toBeGreaterThan(0)
    expect(stats.loadFactor).toBeGreaterThan(0)
    expect(stats.loadFactor).toBeLessThanOrEqual(1)
  })

  test('getCollisionStats returns valid statistics', () => {
    const source = Buffer.from('abcdefghijklmnopqrstuvwxyz'.repeat(10))
    const index = new DeltaIndex(source)

    const collisionStats = index.getCollisionStats()

    expect(collisionStats.minChainLength).toBeGreaterThan(0)
    expect(collisionStats.maxChainLength).toBeGreaterThanOrEqual(
      collisionStats.minChainLength
    )
    expect(collisionStats.medianChainLength).toBeGreaterThan(0)
    expect(collisionStats.avgChainLength).toBeGreaterThan(0)
  })

  test('statistics show expected distribution', () => {
    const source = Buffer.alloc(10000)
    // Create varied data
    for (let i = 0; i < source.length; i++) {
      source[i] = (i * 13 + (i % 7)) % 256
    }

    const index = new DeltaIndex(source)
    const stats = index.getStats()
    const collisionStats = index.getCollisionStats()

    // Should have reasonable distribution
    expect(stats.avgChainLength).toBeLessThan(10) // Not too many collisions
    expect(collisionStats.maxChainLength).toBeLessThan(50) // No extreme collision chains
  })
})

describe('DeltaIndex - Edge Cases', () => {
  test('handles exact RABIN_WINDOW size source', () => {
    const source = Buffer.alloc(RABIN_WINDOW)
    source.fill('x')
    const index = new DeltaIndex(source)

    const stats = index.getStats()
    expect(stats.entries).toBe(1) // Exactly one window
  })

  test('handles RABIN_WINDOW + 1 size source', () => {
    const source = Buffer.alloc(RABIN_WINDOW + 1)
    source.fill('x')
    const index = new DeltaIndex(source)

    const stats = index.getStats()
    expect(stats.entries).toBe(2) // Two overlapping windows
  })

  test('finds match at end of target', () => {
    const source = Buffer.from('prefix_data_here_' + '0123456789abcdef')
    const index = new DeltaIndex(source)

    const target = Buffer.from('unrelated_' + '0123456789abcdef')
    const match = index.findMatch(target, target.length - RABIN_WINDOW)

    expect(match).not.toBeNull()
  })

  test('handles identical source and target', () => {
    const data = Buffer.from('abcdefghijklmnopqrstuvwxyz')
    const index = new DeltaIndex(data)

    const match = index.findMatch(data, 0)

    expect(match).not.toBeNull()
    expect(match.length).toBe(data.length)
    expect(match.srcOffset).toBe(0)
  })
})
