import { describe, it, expect } from 'vitest'
import { shasum } from '../../src/utils/shasum.js'

describe('shasum (Workers environment)', () => {
  it('should hash empty buffer', async () => {
    const buffer = new Uint8Array([])
    const hash = await shasum(buffer)
    expect(hash).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('should hash "hello world"', async () => {
    const buffer = new TextEncoder().encode('hello world')
    const hash = await shasum(buffer)
    expect(hash).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed')
  })

  it('should work with binary data', async () => {
    const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
    const hash = await shasum(buffer)
    expect(hash).toBe('f7ff9e8b7bb2e09b70935a5d785e0cc5d9d0abf0')
  })
})
