import { types } from '../commands/types.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { deflate } from '../utils/deflate.js'
import { join } from '../utils/join.js'
import { padHex } from '../utils/padHex.js'
import { createHash } from 'crypto'
import { createDelta } from '../utils/createDelta.js'
import {
  findDeltaBase,
  groupObjectsByType,
  sortBySimilarity,
  shouldUseDelta,
  selectCandidateWindow,
} from '../utils/deltaHeuristics.js'

/**
 * Simple Hash class for Cloudflare Workers
 * Buffers data and computes SHA-1 hash synchronously
 */
class Hash {
  constructor() {
    this.data = []
  }

  update(chunk) {
    this.data.push(chunk)
    return this
  }

  digest() {
    // Concatenate all chunks
    const totalLength = this.data.reduce((sum, arr) => sum + arr.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of this.data) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    // Use Workers crypto.subtle.digestSync if available
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digestSync) {
      const hashBuffer = crypto.subtle.digestSync('SHA-1', combined)
      return Buffer.from(hashBuffer)
    }

    // Fallback: Use Node.js crypto
    const hash = createHash('sha1')
    hash.update(combined)
    return hash.digest()
  }
}

/**
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {any} args.cache
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string[]} args.oids
 */
export async function _pack({
  fs,
  cache,
  dir,
  gitdir = join(dir, '.git'),
  oids,
}) {
  const hash = new Hash()
  const outputStream = []
  function write(chunk, enc) {
    const buff = Buffer.from(chunk, enc)
    outputStream.push(buff)
    hash.update(buff)
  }
  async function writeObject({ stype, object }) {
    // Object type is encoded in bits 654
    const type = types[stype]
    // The length encoding gets complicated.
    let length = object.length
    // Whether the next byte is part of the variable-length encoded number
    // is encoded in bit 7
    let multibyte = length > 0b1111 ? 0b10000000 : 0b0
    // Last four bits of length is encoded in bits 3210
    const lastFour = length & 0b1111
    // Discard those bits
    length = length >>> 4
    // The first byte is then (1-bit multibyte?), (3-bit type), (4-bit least sig 4-bits of length)
    let byte = (multibyte | type | lastFour).toString(16)
    write(byte, 'hex')
    // Now we keep chopping away at length 7-bits at a time until its zero,
    // writing out the bytes in what amounts to little-endian order.
    while (multibyte) {
      multibyte = length > 0b01111111 ? 0b10000000 : 0b0
      byte = multibyte | (length & 0b01111111)
      write(padHex(2, byte), 'hex')
      length = length >>> 7
    }
    // Lastly, we can compress and write the object.
    write(Buffer.from(await deflate(object)))
  }
  write('PACK')
  write('00000002', 'hex')
  // Write a 4 byte (32-bit) int
  write(padHex(8, oids.length), 'hex')
  for (const oid of oids) {
    const { type, object } = await readObject({ fs, cache, gitdir, oid })
    await writeObject({ write, object, stype: type })
  }
  // Write SHA1 checksum
  const digest = hash.digest()
  outputStream.push(digest)
  return outputStream
}

/**
 * Pack objects with delta compression
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {any} args.cache
 * @param {string} [args.dir]
 * @param {string} [args.gitdir=join(dir, '.git')]
 * @param {string[]} args.oids
 * @param {boolean} [args.enableDelta=true] - Enable delta compression
 */
export async function _packWithDelta({
  fs,
  cache,
  dir,
  gitdir = join(dir, '.git'),
  oids,
  enableDelta = true,
}) {
  // If delta disabled, use regular pack
  if (!enableDelta) {
    return _pack({ fs, cache, dir, gitdir, oids })
  }

  const hash = new Hash()
  const outputStream = []
  const packOffsets = new Map() // Track object offsets for OFS_DELTA

  function write(chunk, enc) {
    const buff = Buffer.from(chunk, enc)
    outputStream.push(buff)
    hash.update(buff)
  }

  function getCurrentOffset() {
    return outputStream.reduce((sum, buf) => sum + buf.length, 0)
  }

  async function writeObject({ stype, object, oid }) {
    const offset = getCurrentOffset()
    packOffsets.set(oid, offset)

    const type = types[stype]
    let length = object.length
    let multibyte = length > 0b1111 ? 0b10000000 : 0b0
    const lastFour = length & 0b1111
    length = length >>> 4
    let byte = (multibyte | type | lastFour).toString(16)
    write(byte, 'hex')

    while (multibyte) {
      multibyte = length > 0b01111111 ? 0b10000000 : 0b0
      byte = multibyte | (length & 0b01111111)
      write(padHex(2, byte), 'hex')
      length = length >>> 7
    }

    write(Buffer.from(await deflate(object)))
  }

  async function writeOfsDelta({ baseOffset, delta }) {
    const offset = getCurrentOffset()
    const relativeOffset = offset - baseOffset

    // OFS_DELTA type = 6
    const type = 6
    let length = delta.length
    let multibyte = length > 0b1111 ? 0b10000000 : 0b0
    const lastFour = length & 0b1111
    length = length >>> 4
    let byte = (multibyte | type | lastFour).toString(16)
    write(byte, 'hex')

    while (multibyte) {
      multibyte = length > 0b01111111 ? 0b10000000 : 0b0
      byte = multibyte | (length & 0b01111111)
      write(padHex(2, byte), 'hex')
      length = length >>> 7
    }

    // Write offset encoding (variable length, MSB continuation)
    const offsetBytes = []
    let offset_tmp = relativeOffset
    offsetBytes.push(offset_tmp & 0x7f)
    offset_tmp >>>= 7

    while (offset_tmp > 0) {
      offsetBytes.push(0x80 | (offset_tmp & 0x7f))
      offset_tmp >>>= 7
    }

    // Write in reverse order
    for (let i = offsetBytes.length - 1; i >= 0; i--) {
      write(padHex(2, offsetBytes[i]), 'hex')
    }

    // Write compressed delta
    write(Buffer.from(await deflate(delta)))
  }

  // Read all objects
  const objects = []
  for (const oid of oids) {
    const { type, object } = await readObject({ fs, cache, gitdir, oid })
    objects.push({
      oid,
      type,
      data: Buffer.from(object),
      depth: 0,
    })
  }

  // Group by type and sort by similarity
  const grouped = groupObjectsByType(objects)
  const sortedObjects = []

  for (const [type, objs] of grouped) {
    const sorted = sortBySimilarity(objs)
    sortedObjects.push(...sorted)
  }

  // Write pack header
  write('PACK')
  write('00000002', 'hex')
  write(padHex(8, sortedObjects.length), 'hex')

  // Process objects with delta compression
  const processedOids = new Set()

  for (let i = 0; i < sortedObjects.length; i++) {
    const target = sortedObjects[i]

    if (processedOids.has(target.oid)) continue
    processedOids.add(target.oid)

    // Try to find a good delta base
    const candidates = selectCandidateWindow(sortedObjects, i, 10)
    const base = findDeltaBase(target, candidates)

    if (base && packOffsets.has(base.oid)) {
      // Create delta
      const delta = createDelta(base.data, target.data)

      // Decide whether to use delta
      if (shouldUseDelta(base.data, target.data, delta)) {
        const baseOffset = packOffsets.get(base.oid)
        await writeOfsDelta({ baseOffset, delta })
        continue
      }
    }

    // Write as full object
    await writeObject({
      stype: target.type,
      object: target.data,
      oid: target.oid,
    })
  }

  // Write SHA1 checksum
  const digest = hash.digest()
  outputStream.push(digest)
  return outputStream
}
