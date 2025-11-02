/**
 * Git Delta Generation
 * Creates deltas in git's exact binary pack format
 * Uses Rabin fingerprinting for efficient match finding
 */

import { DeltaIndex } from './deltaIndex.js'
import { RABIN_WINDOW } from './rabinFingerprint.js'

const MIN_COPY_LENGTH = RABIN_WINDOW // Minimum match to use COPY
const MAX_INSERT_LENGTH = 127 // Maximum single INSERT instruction

/**
 * Create git delta from source to target
 * @param {Buffer} source - Base buffer
 * @param {Buffer} target - Target buffer
 * @returns {Buffer} Delta in git pack format
 */
export function createDelta(source, target) {
  if (!Buffer.isBuffer(source) || !Buffer.isBuffer(target)) {
    throw new Error('Source and target must be Buffers')
  }

  // Empty target case
  if (target.length === 0) {
    return encodeDelta(source.length, 0, [])
  }

  // Build index of source
  const index = new DeltaIndex(source)

  // Generate instructions
  const instructions = []
  let pos = 0

  while (pos < target.length) {
    const match = index.findMatch(target, pos)

    if (match && match.length >= MIN_COPY_LENGTH) {
      // Good match found - emit COPY instruction
      instructions.push({
        type: 'COPY',
        srcOffset: match.srcOffset,
        length: match.length,
      })
      pos += match.length
    } else {
      // No good match - accumulate bytes for INSERT
      const insertStart = pos
      let insertEnd = pos + 1

      // Look ahead to see if there's a good match soon
      while (insertEnd < target.length) {
        const nextMatch = index.findMatch(target, insertEnd)
        if (nextMatch && nextMatch.length >= MIN_COPY_LENGTH) {
          break // Found good match, stop accumulating
        }
        insertEnd++

        // Don't let INSERT get too large
        if (insertEnd - insertStart >= MAX_INSERT_LENGTH) {
          break
        }
      }

      instructions.push({
        type: 'INSERT',
        data: target.slice(insertStart, insertEnd),
      })
      pos = insertEnd
    }
  }

  // Encode delta in git format
  return encodeDelta(source.length, target.length, instructions)
}

/**
 * Encode delta instructions in git's binary pack format
 * @private
 */
function encodeDelta(sourceSize, targetSize, instructions) {
  const opcodes = []

  // Write header: source size and target size (varint)
  writeVarInt(opcodes, sourceSize)
  writeVarInt(opcodes, targetSize)

  // Write instructions
  for (const instr of instructions) {
    if (instr.type === 'COPY') {
      encodeCopyInstruction(opcodes, instr.srcOffset, instr.length)
    } else {
      encodeInsertInstruction(opcodes, instr.data)
    }
  }

  return Buffer.from(opcodes)
}

/**
 * Encode COPY instruction
 * Format: 1xxxxxxx [offset bytes] [size bytes]
 * @private
 */
function encodeCopyInstruction(opcodes, offset, length) {
  let code = 0x80 // MSB = 1 for COPY
  const codeIdx = opcodes.length
  opcodes.push(0) // Placeholder for code byte

  // Encode offset (4 bytes max, little-endian)
  if (offset & 0xff) {
    opcodes.push(offset & 0xff)
    code |= 0x01
  }
  if (offset & 0xff00) {
    opcodes.push((offset >> 8) & 0xff)
    code |= 0x02
  }
  if (offset & 0xff0000) {
    opcodes.push((offset >> 16) & 0xff)
    code |= 0x04
  }
  if (offset & 0xff000000) {
    opcodes.push((offset >> 24) & 0xff)
    code |= 0x08
  }

  // Encode length (3 bytes max, little-endian)
  if (length & 0xff) {
    opcodes.push(length & 0xff)
    code |= 0x10
  }
  if (length & 0xff00) {
    opcodes.push((length >> 8) & 0xff)
    code |= 0x20
  }
  if (length & 0xff0000) {
    opcodes.push((length >> 16) & 0xff)
    code |= 0x40
  }

  // Special case: length 0 means 0x10000 (65536)
  if (length === 0x10000) {
    code &= ~0x70 // Clear length bits
  }

  // Write code byte
  opcodes[codeIdx] = code
}

/**
 * Encode INSERT instruction
 * Format: 0xxxxxxx [data bytes]
 * @private
 */
function encodeInsertInstruction(opcodes, data) {
  const length = data.length

  if (length === 0) {
    throw new Error('INSERT length cannot be 0')
  }

  if (length > MAX_INSERT_LENGTH) {
    throw new Error(`INSERT length ${length} exceeds max ${MAX_INSERT_LENGTH}`)
  }

  // MSB = 0, lower 7 bits = length
  opcodes.push(length & 0x7f)

  // Append data bytes
  for (let i = 0; i < length; i++) {
    opcodes.push(data[i])
  }
}

/**
 * Write variable-length integer (LEB128)
 * @private
 */
function writeVarInt(opcodes, value) {
  opcodes.push(value & 0x7f)
  value >>>= 7

  let i = opcodes.length - 1
  while (value > 0) {
    opcodes[i] |= 0x80 // Set continuation bit
    opcodes.push(value & 0x7f)
    value >>>= 7
    i = opcodes.length - 1
  }
}

/**
 * Analyze delta to get instruction statistics
 * @param {Buffer} source - Base buffer
 * @param {Buffer} target - Target buffer
 * @returns {Object} Delta statistics
 */
export function analyzeDelta(source, target) {
  const index = new DeltaIndex(source)

  let copyBytes = 0
  let insertBytes = 0
  let copyInstructions = 0
  let insertInstructions = 0
  let pos = 0

  while (pos < target.length) {
    const match = index.findMatch(target, pos)

    if (match && match.length >= MIN_COPY_LENGTH) {
      copyBytes += match.length
      copyInstructions++
      pos += match.length
    } else {
      const insertStart = pos
      let insertEnd = pos + 1

      while (insertEnd < target.length) {
        const nextMatch = index.findMatch(target, insertEnd)
        if (nextMatch && nextMatch.length >= MIN_COPY_LENGTH) {
          break
        }
        insertEnd++
        if (insertEnd - insertStart >= MAX_INSERT_LENGTH) {
          break
        }
      }

      insertBytes += insertEnd - insertStart
      insertInstructions++
      pos = insertEnd
    }
  }

  return {
    sourceSize: source.length,
    targetSize: target.length,
    copyBytes,
    insertBytes,
    copyInstructions,
    insertInstructions,
    compressionRatio: copyBytes / Math.max(1, target.length),
    totalInstructions: copyInstructions + insertInstructions,
  }
}

export { MIN_COPY_LENGTH, MAX_INSERT_LENGTH }
