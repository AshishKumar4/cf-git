import { describe, test, expect } from 'vitest'
import {
  createDelta,
  analyzeDelta,
  MIN_COPY_LENGTH,
  MAX_INSERT_LENGTH,
} from '../src/utils/createDelta.js'
import { applyDelta } from '../src/utils/applyDelta.js'

describe('createDelta - Round-trip Tests', () => {
  test('simple text change', () => {
    const source = Buffer.from('hello world')
    const target = Buffer.from('hello everyone')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('identical buffers', () => {
    const data = Buffer.from('identical data here')
    const delta = createDelta(data, data)
    const restored = applyDelta(delta, data)

    expect(restored.equals(data)).toBe(true)
    expect(delta.length).toBeLessThan(50) // Should be very small
  })

  test('large text with small change', () => {
    const source = Buffer.alloc(10000, 'a')
    const target = Buffer.concat([
      Buffer.alloc(5000, 'a'),
      Buffer.from('CHANGED'),
      Buffer.alloc(4993, 'a'),
    ])

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
    expect(delta.length).toBeLessThan(target.length * 0.1) // <10% of target
  })

  test('completely different data', () => {
    const source = Buffer.alloc(1000, 'x')
    const target = Buffer.alloc(1000, 'y')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('binary data', () => {
    const source = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const target = Buffer.from([0, 1, 2, 99, 4, 5, 6, 7, 8, 9, 10, 11])

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

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
    const target = Buffer.from('new content')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('large binary data', () => {
    const source = Buffer.alloc(5000)
    for (let i = 0; i < source.length; i++) {
      source[i] = i % 256
    }

    const target = Buffer.alloc(5000)
    for (let i = 0; i < target.length; i++) {
      target[i] = (i + 13) % 256
    }

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})

describe('createDelta - Compression Tests', () => {
  test('similar files have small delta', () => {
    const source = Buffer.from('function hello() { return "world"; }')
    const target = Buffer.from('function hello() { return "everyone"; }')

    const delta = createDelta(source, target)

    expect(delta.length).toBeLessThan(target.length * 0.5)
  })

  test('code with imports', () => {
    const source = Buffer.from(`
import { foo } from 'bar';
export function test() {
    return foo();
}
        `)

    const target = Buffer.from(`
import { foo, baz } from 'bar';
export function test() {
    return foo() + baz();
}
        `)

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('repeated patterns compress well', () => {
    const pattern = 'repeated pattern here '
    const source = Buffer.from(pattern.repeat(100))
    const target = Buffer.from(pattern.repeat(100) + 'extra')

    const delta = createDelta(source, target)

    expect(delta.length).toBeLessThan(100) // Should be very small
  })

  test('insertion at beginning', () => {
    const source = Buffer.from('original content here')
    const target = Buffer.from('PREFIX ' + 'original content here')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('insertion at end', () => {
    const source = Buffer.from('original content here')
    const target = Buffer.from('original content here' + ' SUFFIX')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('insertion in middle', () => {
    const source = Buffer.from('first part last part')
    const target = Buffer.from('first part MIDDLE last part')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})

describe('createDelta - Edge Cases', () => {
  test('single byte difference', () => {
    const source = Buffer.from('hello world')
    const target = Buffer.from('hello World') // Capital W

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('target larger than source', () => {
    const source = Buffer.from('small')
    const target = Buffer.from('small'.repeat(100))

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('target smaller than source', () => {
    const source = Buffer.from('very long string here'.repeat(100))
    const target = Buffer.from('short')

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('source with nulls', () => {
    const source = Buffer.from([0, 0, 0, 1, 2, 3, 0, 0, 0])
    const target = Buffer.from([0, 0, 0, 1, 2, 3, 4, 5, 6])

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('alternating bytes', () => {
    const source = Buffer.alloc(100)
    const target = Buffer.alloc(100)

    for (let i = 0; i < 100; i++) {
      source[i] = i % 2 === 0 ? 0xaa : 0xbb
      target[i] = i % 2 === 0 ? 0xbb : 0xaa // Flipped
    }

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})

describe('createDelta - Input Validation', () => {
  test('throws on non-buffer source', () => {
    expect(() => {
      createDelta('not a buffer', Buffer.from('target'))
    }).toThrow('must be Buffers')
  })

  test('throws on non-buffer target', () => {
    expect(() => {
      createDelta(Buffer.from('source'), 'not a buffer')
    }).toThrow('must be Buffers')
  })
})

describe('createDelta - Real-world Scenarios', () => {
  test('git commit object change', () => {
    const source = Buffer.from(`tree abc123
parent def456
author John Doe <john@example.com> 1234567890 +0000
committer John Doe <john@example.com> 1234567890 +0000

Initial commit
`)

    const target = Buffer.from(`tree abc123
parent def456
author John Doe <john@example.com> 1234567890 +0000
committer John Doe <john@example.com> 1234567890 +0000

Updated commit message
`)

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('package.json version bump', () => {
    const source = Buffer.from(
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {},
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
          dependencies: {},
        },
        null,
        2
      )
    )

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })

  test('HTML template modification', () => {
    const source = Buffer.from(`<!DOCTYPE html>
<html>
<head><title>Original</title></head>
<body>
    <h1>Hello World</h1>
</body>
</html>`)

    const target = Buffer.from(`<!DOCTYPE html>
<html>
<head><title>Updated</title></head>
<body>
    <h1>Hello World</h1>
    <p>New content</p>
</body>
</html>`)

    const delta = createDelta(source, target)
    const restored = applyDelta(delta, source)

    expect(restored.equals(target)).toBe(true)
  })
})

describe('analyzeDelta - Statistics', () => {
  test('returns valid statistics', () => {
    const source = Buffer.from('hello world this is a test')
    const target = Buffer.from('hello everyone this is a test')

    const stats = analyzeDelta(source, target)

    expect(stats.sourceSize).toBe(source.length)
    expect(stats.targetSize).toBe(target.length)
    expect(stats.copyBytes).toBeGreaterThanOrEqual(0)
    expect(stats.insertBytes).toBeGreaterThanOrEqual(0)
    expect(stats.copyBytes + stats.insertBytes).toBe(target.length)
    expect(stats.compressionRatio).toBeGreaterThanOrEqual(0)
    expect(stats.compressionRatio).toBeLessThanOrEqual(1)
  })

  test('identical files show high compression ratio', () => {
    const data = Buffer.from('same content'.repeat(100))
    const stats = analyzeDelta(data, data)

    expect(stats.compressionRatio).toBeGreaterThan(0.95)
  })

  test('completely different files show low compression ratio', () => {
    const source = Buffer.alloc(1000, 'a')
    const target = Buffer.alloc(1000, 'b')

    const stats = analyzeDelta(source, target)

    expect(stats.compressionRatio).toBeLessThan(0.1)
  })

  test('tracks instruction counts', () => {
    const source = Buffer.from('abcdefghijklmnopqrstuvwxyz'.repeat(10))
    const target = Buffer.from(
      'abcdefghijklmnopqrstuvwxyz'.repeat(10) + 'extra'
    )

    const stats = analyzeDelta(source, target)

    expect(stats.copyInstructions).toBeGreaterThanOrEqual(0)
    expect(stats.insertInstructions).toBeGreaterThanOrEqual(0)
    expect(stats.totalInstructions).toBe(
      stats.copyInstructions + stats.insertInstructions
    )
  })
})

describe('createDelta - Constants', () => {
  test('MIN_COPY_LENGTH is defined', () => {
    expect(MIN_COPY_LENGTH).toBeGreaterThan(0)
  })

  test('MAX_INSERT_LENGTH is defined', () => {
    expect(MAX_INSERT_LENGTH).toBeGreaterThan(0)
    expect(MAX_INSERT_LENGTH).toBe(127) // Git standard
  })
})

describe('createDelta - Performance', () => {
  test('handles moderately large files', () => {
    const size = 100000
    const source = Buffer.alloc(size)
    const target = Buffer.alloc(size)

    for (let i = 0; i < size; i++) {
      source[i] = i % 256
      target[i] = (i + 1) % 256
    }

    const start = Date.now()
    const delta = createDelta(source, target)
    const duration = Date.now() - start

    // Should complete in reasonable time
    expect(duration).toBeLessThan(2000) // 2 seconds

    const restored = applyDelta(delta, source)
    expect(restored.equals(target)).toBe(true)
  })

  test('delta size is reasonable for similar files', () => {
    const base = 'common content '.repeat(1000)
    const source = Buffer.from(base)
    const target = Buffer.from(base + 'extra')

    const delta = createDelta(source, target)

    // Delta should be much smaller than target
    expect(delta.length).toBeLessThan(target.length * 0.1)
  })
})
