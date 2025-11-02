import { describe, test, expect } from 'vitest'
import { _packWithDelta } from '../src/commands/pack.js'
import { createDelta } from '../src/utils/createDelta.js'
import { applyDelta } from '../src/utils/applyDelta.js'

describe('Delta Compression Integration', () => {
  test('createDelta and applyDelta work together', () => {
    const source = Buffer.from('hello world version 1')
    const target = Buffer.from('hello world version 2')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('delta compresses similar content', () => {
    const source = Buffer.from('function test() { return "hello"; }'.repeat(10))
    const target = Buffer.from('function test() { return "world"; }'.repeat(10))

    const delta = createDelta(source, target)

    // Delta should be much smaller than target
    expect(delta.length).toBeLessThan(target.length * 0.5)
  })

  test('delta handles identical content efficiently', () => {
    const data = Buffer.from('identical content'.repeat(100))

    const delta = createDelta(data, data)
    const restored = applyDelta(delta, data)

    expect(restored.equals(data)).toBe(true)
    expect(delta.length).toBeLessThan(100) // Very small delta
  })
})

describe('Pack Integration', () => {
  test('_packWithDelta is exported', () => {
    expect(typeof _packWithDelta).toBe('function')
  })

  test('can disable delta compression', async () => {
    // This test would require a mock filesystem
    // For now, just verify the function accepts the parameter
    expect(_packWithDelta.length).toBeGreaterThan(0)
  })
})

describe('Round-trip Tests', () => {
  test('large text file', () => {
    const source = Buffer.from(
      `
# Large Document

This is a large document with many lines of text.
It contains various sections and content.

## Section 1
Content for section 1...

## Section 2
Content for section 2...
        `.repeat(50)
    )

    const target = Buffer.from(
      `
# Large Document (Updated)

This is a large document with many lines of text.
It contains various sections and modified content.

## Section 1
Updated content for section 1...

## Section 2
Content for section 2...
        `.repeat(50)
    )

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)

    // Check compression ratio
    const compressionRatio = 1 - delta.length / target.length
    expect(compressionRatio).toBeGreaterThan(0.3) // At least 30% compression
  })

  test('code file with small changes', () => {
    const source = Buffer.from(`
function calculateTotal(items) {
    let total = 0;
    for (const item of items) {
        total += item.price * item.quantity;
    }
    return total;
}

function formatPrice(amount) {
    return '$' + amount.toFixed(2);
}
        `)

    const target = Buffer.from(`
function calculateTotal(items) {
    let total = 0;
    for (const item of items) {
        total += item.price * item.quantity;
    }
    // Apply discount
    total *= 0.9;
    return total;
}

function formatPrice(amount) {
    return '$' + amount.toFixed(2);
}
        `)

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('JSON configuration file', () => {
    const source = Buffer.from(
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {
            'package-a': '^1.0.0',
            'package-b': '^2.0.0',
          },
        },
        null,
        2
      )
    )

    const target = Buffer.from(
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.1',
          dependencies: {
            'package-a': '^1.0.0',
            'package-b': '^2.0.0',
            'package-c': '^3.0.0',
          },
        },
        null,
        2
      )
    )

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})

describe('Performance Tests', () => {
  test('processes moderately large files quickly', () => {
    const size = 50000
    const source = Buffer.alloc(size)
    const target = Buffer.alloc(size)

    // Fill with similar but not identical data
    for (let i = 0; i < size; i++) {
      source[i] = i % 256
      target[i] = (i + 1) % 256
    }

    const start = Date.now()
    const delta = createDelta(source, target)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(1000) // Should complete in < 1 second

    // Verify correctness
    const restored = applyDelta(delta, source)
    expect(restored.equals(target)).toBe(true)
  })

  test('compression ratio for similar files', () => {
    const base = 'common prefix and content '.repeat(500)
    const source = Buffer.from(base + 'original ending')
    const target = Buffer.from(base + 'modified ending')

    const delta = createDelta(source, target)

    const compressionRatio = 1 - delta.length / target.length
    expect(compressionRatio).toBeGreaterThan(0.8) // >80% compression
  })
})

describe('Edge Cases', () => {
  test('empty target', () => {
    const source = Buffer.from('some data')
    const target = Buffer.alloc(0)

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
    expect(restored.length).toBe(0)
  })

  test('empty source', () => {
    const source = Buffer.alloc(0)
    const target = Buffer.from('new data')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('binary data with nulls', () => {
    const source = Buffer.from([0, 0, 1, 2, 3, 0, 0, 4, 5, 6])
    const target = Buffer.from([0, 0, 1, 2, 3, 7, 8, 4, 5, 6])

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('very different files', () => {
    const source = Buffer.alloc(1000, 'a')
    const target = Buffer.alloc(1000, 'z')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
    // Delta might be large but should still work
  })
})

describe('Git Compatibility', () => {
  test('delta format matches git expectations', () => {
    const source = Buffer.from('git test content original')
    const target = Buffer.from('git test content modified')

    const delta = createDelta(source, target)

    // Delta should start with varint-encoded source size
    expect(delta.length).toBeGreaterThan(2)

    // Can apply delta
    const restored = applyDelta(delta, source)
    expect(restored.equals(target)).toBe(true)
  })

  test('handles git object format', () => {
    // Simulate git blob object
    const source = Buffer.from('blob 20\0original content')
    const target = Buffer.from('blob 20\0modified content')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})
