import { describe, test, expect } from 'vitest'
import {
  RabinFingerprint,
  computeRabinHash,
  RABIN_WINDOW,
  RABIN_MASK,
} from '../src/utils/rabinFingerprint.js'

describe('RabinFingerprint - Core Functionality', () => {
  test('creates instance with initial state', () => {
    const fp = new RabinFingerprint()

    expect(fp.getHash()).toBe(0)
    expect(fp.isFilled()).toBe(false)
  })

  test('fills window progressively', () => {
    const fp = new RabinFingerprint()
    const data = Buffer.from('0123456789abcdef')

    for (let i = 0; i < RABIN_WINDOW - 1; i++) {
      fp.slide(data[i])
      expect(fp.isFilled()).toBe(false)
    }

    fp.slide(data[RABIN_WINDOW - 1])
    expect(fp.isFilled()).toBe(true)
  })

  test('produces consistent hash for same data', () => {
    const data = Buffer.from('hello world test data')
    const fp1 = new RabinFingerprint()
    const fp2 = new RabinFingerprint()

    for (let i = 0; i < 20; i++) {
      fp1.slide(data[i])
      fp2.slide(data[i])
    }

    expect(fp1.getHash()).toBe(fp2.getHash())
    expect(fp1.getHash()).toBeGreaterThan(0)
  })

  test('getWindow returns copy of window buffer', () => {
    const fp = new RabinFingerprint()
    const data = Buffer.from('0123456789abcdef')

    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    const window = fp.getWindow()
    expect(window).toEqual(data)
    expect(window).not.toBe(fp.window) // Should be a copy
  })
})

describe('RabinFingerprint - Rolling Hash Property', () => {
  test('rolling hash matches static hash', () => {
    const data = Buffer.from('abcdefghijklmnopqrstuvwxyz')
    const fp = new RabinFingerprint()

    // Fill window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    const rollingHash = fp.getHash()
    const staticHash = computeRabinHash(data, 0, RABIN_WINDOW)

    expect(rollingHash).toBe(staticHash)
  })

  test('rolling hash updates correctly when sliding', () => {
    const data = Buffer.from('the quick brown fox jumps over the lazy dog')
    const fp = new RabinFingerprint()

    // Fill initial window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    // Slide one more byte
    fp.slide(data[RABIN_WINDOW])

    // Should match static hash at new position
    const rollingHash = fp.getHash()
    const staticHash = computeRabinHash(data, 1, RABIN_WINDOW)

    expect(rollingHash).toBe(staticHash)
  })

  test('rolling hash continues to match after multiple slides', () => {
    const data = Buffer.from('the quick brown fox jumps over the lazy dog')
    const fp = new RabinFingerprint()

    // Fill window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    // Slide through rest of buffer
    for (let i = RABIN_WINDOW; i < data.length; i++) {
      fp.slide(data[i])
      const rollingHash = fp.getHash()
      const staticHash = computeRabinHash(
        data,
        i - RABIN_WINDOW + 1,
        RABIN_WINDOW
      )
      expect(rollingHash).toBe(staticHash)
    }
  })

  test('produces different hashes for different windows', () => {
    const data = Buffer.from('the quick brown fox jumps over the lazy dog')
    const fp = new RabinFingerprint()
    const hashes = new Set()

    for (let i = 0; i < data.length; i++) {
      fp.slide(data[i])
      if (fp.isFilled()) {
        hashes.add(fp.getHash())
      }
    }

    // Should have many different hashes
    expect(hashes.size).toBeGreaterThan(15)
  })
})

describe('RabinFingerprint - Reset Functionality', () => {
  test('reset clears state correctly', () => {
    const data = Buffer.from('test data for reset')
    const fp = new RabinFingerprint()

    // Fill window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    const hash1 = fp.getHash()
    expect(fp.isFilled()).toBe(true)

    // Reset
    fp.reset()
    expect(fp.getHash()).toBe(0)
    expect(fp.isFilled()).toBe(false)

    // Fill again with same data
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    const hash2 = fp.getHash()
    expect(hash1).toBe(hash2)
  })

  test('reset clears window buffer', () => {
    const fp = new RabinFingerprint()
    const data = Buffer.from('0123456789abcdef')

    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    fp.reset()
    const window = fp.getWindow()

    expect(window.every(byte => byte === 0)).toBe(true)
  })
})

describe('RabinFingerprint - Edge Cases', () => {
  test('handles binary data with nulls', () => {
    const data = Buffer.from([
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
    const fp = new RabinFingerprint()

    for (const byte of data) {
      fp.slide(byte)
    }

    expect(fp.isFilled()).toBe(true)
    expect(fp.getHash()).toBeGreaterThanOrEqual(0)
    expect(fp.getHash()).toBeLessThanOrEqual(RABIN_MASK)
  })

  test('handles all 0xFF bytes', () => {
    const data = Buffer.alloc(RABIN_WINDOW, 0xff)
    const fp = new RabinFingerprint()

    for (const byte of data) {
      fp.slide(byte)
    }

    expect(fp.isFilled()).toBe(true)
    expect(fp.getHash()).toBeGreaterThan(0)
  })

  test('handles alternating 0x00 and 0xFF', () => {
    const data = Buffer.alloc(RABIN_WINDOW)
    for (let i = 0; i < RABIN_WINDOW; i++) {
      data[i] = i % 2 === 0 ? 0x00 : 0xff
    }

    const fp = new RabinFingerprint()
    for (const byte of data) {
      fp.slide(byte)
    }

    expect(fp.isFilled()).toBe(true)
    const hash = fp.getHash()
    expect(hash).toBeGreaterThan(0)
    expect(hash).toBeLessThanOrEqual(RABIN_MASK)
  })

  test('hash values stay within mask range', () => {
    const data = Buffer.alloc(1000, 0xff)
    const fp = new RabinFingerprint()

    for (let i = 0; i < data.length; i++) {
      const hash = fp.slide(data[i])
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(RABIN_MASK)
    }
  })

  test('handles random binary data', () => {
    const data = Buffer.alloc(100)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256)
    }

    const fp = new RabinFingerprint()
    for (const byte of data) {
      const hash = fp.slide(byte)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(RABIN_MASK)
    }
  })
})

describe('computeRabinHash - Static Function', () => {
  test('computes hash for buffer region', () => {
    const data = Buffer.from('0123456789abcdef')
    const hash = computeRabinHash(data, 0, RABIN_WINDOW)

    expect(hash).toBeGreaterThan(0)
    expect(hash).toBeLessThanOrEqual(RABIN_MASK)
  })

  test('matches rolling hash result', () => {
    const data = Buffer.from('hello world test data here')
    const fp = new RabinFingerprint()

    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    const rollingHash = fp.getHash()
    const staticHash = computeRabinHash(data, 0)

    expect(rollingHash).toBe(staticHash)
  })

  test('throws on invalid length', () => {
    const data = Buffer.from('short')

    expect(() => {
      computeRabinHash(data, 0, 5)
    }).toThrow('requires exactly')
  })

  test('throws on buffer overflow', () => {
    const data = Buffer.from('0123456789abcdef')

    expect(() => {
      computeRabinHash(data, 10, RABIN_WINDOW)
    }).toThrow('overflow')
  })

  test('throws on negative offset', () => {
    const data = Buffer.from('0123456789abcdef')

    expect(() => {
      computeRabinHash(data, -1, RABIN_WINDOW)
    }).toThrow('overflow')
  })

  test('produces different hashes for different positions', () => {
    const data = Buffer.from('abcdefghijklmnopqrstuvwxyz')
    const hash1 = computeRabinHash(data, 0)
    const hash2 = computeRabinHash(data, 5)
    const hash3 = computeRabinHash(data, 10)

    expect(hash1).not.toBe(hash2)
    expect(hash2).not.toBe(hash3)
    expect(hash1).not.toBe(hash3)
  })

  test('produces same hash for same data at different locations', () => {
    const pattern = '0123456789abcdef'
    const data = Buffer.from(pattern + 'XXXX' + pattern)

    const hash1 = computeRabinHash(data, 0)
    const hash2 = computeRabinHash(data, 20)

    expect(hash1).toBe(hash2)
  })
})

describe('RabinFingerprint - Performance', () => {
  test('processes 1MB in reasonable time', () => {
    const data = Buffer.alloc(1024 * 1024) // 1MB
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }

    const fp = new RabinFingerprint()
    const start = Date.now()

    for (let i = 0; i < data.length; i++) {
      fp.slide(data[i])
    }

    const duration = Date.now() - start

    // Should process 1MB in < 100ms
    expect(duration).toBeLessThan(100)
    expect(fp.isFilled()).toBe(true)
  })

  test('O(1) per slide operation', () => {
    const sizes = [1000, 10000, 100000]
    const timings = []

    for (const size of sizes) {
      const data = Buffer.alloc(size)
      const fp = new RabinFingerprint()

      const start = Date.now()
      for (let i = 0; i < data.length; i++) {
        fp.slide(data[i])
      }
      const duration = Date.now() - start

      timings.push(duration / size) // Time per byte
    }

    // Time per byte should be roughly constant (O(1))
    // Allow for some variance due to JIT warmup
    const avgTime = timings.reduce((a, b) => a + b) / timings.length
    for (const t of timings) {
      expect(Math.abs(t - avgTime)).toBeLessThan(avgTime * 0.5)
    }
  })

  test('static hash computation is fast', () => {
    const data = Buffer.alloc(1024 * 1024) // 1MB
    const iterations = 1000

    const start = Date.now()
    for (let i = 0; i < iterations; i++) {
      const offset = Math.floor(Math.random() * (data.length - RABIN_WINDOW))
      computeRabinHash(data, offset)
    }
    const duration = Date.now() - start

    // Should do 1000 hash computations in < 50ms
    expect(duration).toBeLessThan(50)
  })
})

describe('RabinFingerprint - Hash Distribution', () => {
  test('produces well-distributed hashes', () => {
    const data = Buffer.alloc(10000)
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }

    const fp = new RabinFingerprint()
    const hashes = new Set()

    for (let i = 0; i < data.length; i++) {
      fp.slide(data[i])
      if (fp.isFilled()) {
        hashes.add(fp.getHash())
      }
    }

    // Should have high collision-free rate
    // With 10000 windows and ~8M possible hashes, expect >99% unique
    expect(hashes.size).toBeGreaterThan(9900)
  })

  test('handles repetitive data without hash collapse', () => {
    const data = Buffer.from('aaaaaaaaaaaaaaaa'.repeat(100))
    const fp = new RabinFingerprint()
    const hashes = new Set()

    for (let i = 0; i < data.length; i++) {
      fp.slide(data[i])
      if (fp.isFilled()) {
        hashes.add(fp.getHash())
      }
    }

    // Repetitive data will have fewer unique hashes, but shouldn't collapse to 1
    expect(hashes.size).toBeGreaterThan(1)
  })
})

describe('RabinFingerprint - Rigorous Verification', () => {
  test('rolling hash matches static at every position', () => {
    const data = Buffer.from('the quick brown fox jumps over the lazy dog and continues with more text')
    const fp = new RabinFingerprint()

    // Fill initial window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    // Verify at every position
    for (let i = RABIN_WINDOW; i < data.length; i++) {
      fp.slide(data[i])
      const rollingHash = fp.getHash()
      const staticHash = computeRabinHash(data, i - RABIN_WINDOW + 1, RABIN_WINDOW)
      expect(rollingHash).toBe(staticHash)
    }
  })

  test('rolling hash matches static with random data', () => {
    const size = 1000
    const data = Buffer.alloc(size)
    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(Math.random() * 256)
    }

    const fp = new RabinFingerprint()

    // Fill window
    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    // Check every 10th position while sliding through all bytes
    let checksPerformed = 0
    for (let i = RABIN_WINDOW; i < size; i++) {
      fp.slide(data[i])

      if (i % 10 === 0) {
        const rollingHash = fp.getHash()
        const staticHash = computeRabinHash(data, i - RABIN_WINDOW + 1, RABIN_WINDOW)
        expect(rollingHash).toBe(staticHash)
        checksPerformed++
      }
    }

    expect(checksPerformed).toBeGreaterThan(50)
  })

  test('rolling hash matches static with binary data', () => {
    const data = Buffer.alloc(500)
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }

    const fp = new RabinFingerprint()

    for (let i = 0; i < RABIN_WINDOW; i++) {
      fp.slide(data[i])
    }

    for (let i = RABIN_WINDOW; i < data.length; i += 5) {
      fp.slide(data[i])
      const rollingHash = fp.getHash()
      const staticHash = computeRabinHash(data, i - RABIN_WINDOW + 1, RABIN_WINDOW)
      expect(rollingHash).toBe(staticHash)
    }
  })

  test('window position wraps correctly', () => {
    const data = Buffer.alloc(100, 0x42)
    const fp = new RabinFingerprint()

    // Fill and slide multiple times to ensure wrapping
    for (let i = 0; i < 100; i++) {
      fp.slide(data[i])
    }

    // Window should still contain the last RABIN_WINDOW bytes
    const window = fp.getWindow()
    expect(window.length).toBe(RABIN_WINDOW)
    expect(window.every(b => b === 0x42)).toBe(true)
  })
})
