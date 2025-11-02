/* global describe, test, expect */
import {
  findDeltaBase,
  computeSimilarityScore,
  groupObjectsByType,
  sortBySimilarity,
  estimateDeltaSavings,
  selectCandidateWindow,
  shouldUseDelta,
  MAX_DELTA_CHAIN_DEPTH,
  MIN_SIZE_FOR_DELTA,
} from '../src/utils/deltaHeuristics.js'

describe('findDeltaBase', () => {
  test('finds best base among candidates', () => {
    const target = {
      oid: 'target123',
      type: 'blob',
      data: Buffer.from('hello world version 2'),
    }

    const candidates = [
      {
        oid: 'base1',
        type: 'blob',
        data: Buffer.from('hello world version 1'),
        depth: 0,
      },
      {
        oid: 'base2',
        type: 'blob',
        data: Buffer.from('completely different'),
        depth: 0,
      },
    ]

    const base = findDeltaBase(target, candidates)

    expect(base).not.toBeNull()
    expect(base.oid).toBe('base1') // More similar
  })

  test('returns null for very small objects', () => {
    const target = {
      oid: 'small',
      type: 'blob',
      data: Buffer.from('tiny'),
    }

    const candidates = [
      {
        oid: 'base',
        type: 'blob',
        data: Buffer.from('data'),
      },
    ]

    const base = findDeltaBase(target, candidates)
    expect(base).toBeNull()
  })

  test('filters out wrong type candidates', () => {
    const target = {
      oid: 'target',
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
    }

    const candidates = [
      {
        oid: 'tree',
        type: 'tree',
        data: Buffer.alloc(100, 'x'),
      },
      {
        oid: 'commit',
        type: 'commit',
        data: Buffer.alloc(100, 'x'),
      },
    ]

    const base = findDeltaBase(target, candidates)
    expect(base).toBeNull()
  })

  test('filters out oversized candidates', () => {
    const target = {
      oid: 'target',
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
    }

    const candidates = [
      {
        oid: 'toobig',
        type: 'blob',
        data: Buffer.alloc(300, 'y'), // 3x size
      },
    ]

    const base = findDeltaBase(target, candidates)
    expect(base).toBeNull()
  })

  test('respects max chain depth', () => {
    const target = {
      oid: 'target',
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
    }

    const candidates = [
      {
        oid: 'toodeep',
        type: 'blob',
        data: Buffer.alloc(100, 'x'),
        depth: MAX_DELTA_CHAIN_DEPTH,
      },
    ]

    const base = findDeltaBase(target, candidates)
    expect(base).toBeNull()
  })
})

describe('computeSimilarityScore', () => {
  test('perfect match has high score', () => {
    const obj = {
      oid: 'test',
      type: 'blob',
      data: Buffer.from('identical content'),
      path: 'file.txt',
      depth: 0,
    }

    const score = computeSimilarityScore(obj, obj)
    expect(score).toBeGreaterThan(90)
  })

  test('similar size increases score', () => {
    const base = {
      type: 'blob',
      data: Buffer.alloc(1000),
      depth: 0,
    }

    const target1 = {
      type: 'blob',
      data: Buffer.alloc(1010), // Similar size
    }

    const target2 = {
      type: 'blob',
      data: Buffer.alloc(500), // Very different
    }

    const score1 = computeSimilarityScore(base, target1)
    const score2 = computeSimilarityScore(base, target2)

    expect(score1).toBeGreaterThan(score2)
  })

  test('matching prefix increases score', () => {
    const prefix = 'function hello() { return "'

    const base = {
      type: 'blob',
      data: Buffer.from(prefix + 'world"; }'),
    }

    const target1 = {
      type: 'blob',
      data: Buffer.from(prefix + 'there"; }'), // Same prefix
    }

    const target2 = {
      type: 'blob',
      data: Buffer.from('completely different'),
    }

    const score1 = computeSimilarityScore(base, target1)
    const score2 = computeSimilarityScore(base, target2)

    expect(score1).toBeGreaterThan(score2)
  })

  test('same path increases score', () => {
    const base = {
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
      path: 'src/utils/helper.js',
      depth: 0,
    }

    const target1 = {
      type: 'blob',
      data: Buffer.alloc(100, 'y'),
      path: 'src/utils/helper.js', // Same path
    }

    const target2 = {
      type: 'blob',
      data: Buffer.alloc(100, 'y'),
      path: 'src/components/App.tsx', // Different path
    }

    const score1 = computeSimilarityScore(base, target1)
    const score2 = computeSimilarityScore(base, target2)

    expect(score1).toBeGreaterThan(score2)
  })

  test('lower chain depth increases score', () => {
    const base1 = {
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
      depth: 0,
    }

    const base2 = {
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
      depth: 40,
    }

    const target = {
      type: 'blob',
      data: Buffer.alloc(100, 'x'),
    }

    const score1 = computeSimilarityScore(base1, target)
    const score2 = computeSimilarityScore(base2, target)

    expect(score1).toBeGreaterThan(score2)
  })
})

describe('groupObjectsByType', () => {
  test('groups objects by type', () => {
    const objects = [
      { oid: '1', type: 'blob', data: Buffer.alloc(10) },
      { oid: '2', type: 'tree', data: Buffer.alloc(10) },
      { oid: '3', type: 'blob', data: Buffer.alloc(10) },
      { oid: '4', type: 'commit', data: Buffer.alloc(10) },
    ]

    const groups = groupObjectsByType(objects)

    expect(groups.size).toBe(3)
    expect(groups.get('blob').length).toBe(2)
    expect(groups.get('tree').length).toBe(1)
    expect(groups.get('commit').length).toBe(1)
  })

  test('handles empty array', () => {
    const groups = groupObjectsByType([])
    expect(groups.size).toBe(0)
  })
})

describe('sortBySimilarity', () => {
  test('sorts by path and size', () => {
    const objects = [
      { oid: '1', data: Buffer.alloc(100), path: 'b.txt' },
      { oid: '2', data: Buffer.alloc(50), path: 'a.txt' },
      { oid: '3', data: Buffer.alloc(150), path: 'a.txt' },
    ]

    const sorted = sortBySimilarity(objects)

    // Should group by path first
    expect(sorted[0].path).toBe('a.txt')
    expect(sorted[1].path).toBe('a.txt')
    expect(sorted[2].path).toBe('b.txt')

    // Within path group, sorted by size
    expect(sorted[0].data.length).toBe(50)
    expect(sorted[1].data.length).toBe(150)
  })

  test('handles objects without paths', () => {
    const objects = [
      { oid: 'abc', data: Buffer.alloc(100) },
      { oid: 'def', data: Buffer.alloc(50) },
    ]

    const sorted = sortBySimilarity(objects)
    expect(sorted).toHaveLength(2)
  })
})

describe('estimateDeltaSavings', () => {
  test('identical buffers have high savings', () => {
    const data = Buffer.from('identical content here')
    const savings = estimateDeltaSavings(data, data)

    expect(savings).toBeGreaterThan(0.95)
  })

  test('similar prefixes have good savings', () => {
    const base = Buffer.from('function test() { return "hello"; }')
    const target = Buffer.from('function test() { return "world"; }')

    const savings = estimateDeltaSavings(base, target)

    expect(savings).toBeGreaterThan(0.5)
  })

  test('different data has low savings', () => {
    const base = Buffer.alloc(200, 'a')
    const target = Buffer.alloc(200, 'b')

    const savings = estimateDeltaSavings(base, target)

    expect(savings).toBeLessThan(0.2)
  })
})

describe('selectCandidateWindow', () => {
  test('selects window of previous objects', () => {
    const objects = Array.from({ length: 20 }, (_, i) => ({
      oid: `obj${i}`,
      data: Buffer.alloc(10),
    }))

    const candidates = selectCandidateWindow(objects, 15, 5)

    expect(candidates).toHaveLength(5)
    expect(candidates[0].oid).toBe('obj10')
    expect(candidates[4].oid).toBe('obj14')
  })

  test('handles beginning of array', () => {
    const objects = Array.from({ length: 5 }, (_, i) => ({
      oid: `obj${i}`,
      data: Buffer.alloc(10),
    }))

    const candidates = selectCandidateWindow(objects, 2, 10)

    expect(candidates).toHaveLength(2)
    expect(candidates[0].oid).toBe('obj0')
  })

  test('returns empty for first object', () => {
    const objects = [{ oid: 'first', data: Buffer.alloc(10) }]
    const candidates = selectCandidateWindow(objects, 0)

    expect(candidates).toHaveLength(0)
  })
})

describe('shouldUseDelta', () => {
  test('accepts delta that saves >50%', () => {
    const base = Buffer.alloc(1000)
    const target = Buffer.alloc(1000)
    const delta = Buffer.alloc(400) // 60% savings

    const result = shouldUseDelta(base, target, delta)
    expect(result).toBe(true)
  })

  test('rejects delta that saves <50%', () => {
    const base = Buffer.alloc(1000)
    const target = Buffer.alloc(1000)
    const delta = Buffer.alloc(600) // 40% savings

    const result = shouldUseDelta(base, target, delta)
    expect(result).toBe(false)
  })

  test('accepts very small deltas', () => {
    const base = Buffer.alloc(1000)
    const target = Buffer.alloc(500)
    const delta = Buffer.alloc(50) // Very small

    const result = shouldUseDelta(base, target, delta)
    expect(result).toBe(true)
  })

  test('rejects delta larger than base', () => {
    const base = Buffer.alloc(100)
    const target = Buffer.alloc(1000)
    const delta = Buffer.alloc(200)

    const result = shouldUseDelta(base, target, delta)
    expect(result).toBe(false)
  })
})

describe('Constants', () => {
  test('MAX_DELTA_CHAIN_DEPTH is defined', () => {
    expect(MAX_DELTA_CHAIN_DEPTH).toBeGreaterThan(0)
    expect(MAX_DELTA_CHAIN_DEPTH).toBe(50)
  })

  test('MIN_SIZE_FOR_DELTA is defined', () => {
    expect(MIN_SIZE_FOR_DELTA).toBeGreaterThan(0)
    expect(MIN_SIZE_FOR_DELTA).toBe(16) // Git's minimum (one window size)
  })
})
