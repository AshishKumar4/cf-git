/**
 * Git Delta Generation V2
 * Uses proven 'diff' library for finding changes
 * Encodes in git's exact binary pack format
 */

import * as Diff from 'diff'

const MIN_COPY_LENGTH = 16 // Minimum match to use COPY (Git standard)

/**
 * Create git delta from source to target using diff algorithm
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

  // Use diff library to find changes at byte level
  const sourceStr = source.toString('binary')
  const targetStr = target.toString('binary')
  
  const patches = Diff.diffChars(sourceStr, targetStr)
  
  // Convert diff patches to COPY/INSERT instructions
  const instructions = []
  let sourcePos = 0
  let targetPos = 0
  
  for (const patch of patches) {
    const length = patch.value.length
    
    if (!patch.added && !patch.removed) {
      // Unchanged - this is a COPY from source
      if (length >= MIN_COPY_LENGTH) {
        instructions.push({
          type: 'COPY',
          srcOffset: sourcePos,
          length: length,
        })
      } else {
        // Too small for COPY, treat as INSERT
        instructions.push({
          type: 'INSERT',
          data: target.slice(targetPos, targetPos + length),
        })
      }
      sourcePos += length
      targetPos += length
    } else if (patch.removed) {
      // Deleted from source - just advance source position
      sourcePos += length
    } else if (patch.added) {
      // Added to target - INSERT instruction
      instructions.push({
        type: 'INSERT',
        data: Buffer.from(patch.value, 'binary'),
      })
      targetPos += length
    }
  }

  // Encode delta in git format
  return encodeDelta(source.length, target.length, instructions)
}

/**
 * Encode delta instructions in git's binary pack format
 * Format: <src_size><tgt_size><instruction>*
 */
function encodeDelta(srcSize, tgtSize, instructions) {
  const parts = []

  // Encode source size (variable length)
  parts.push(encodeSize(srcSize))

  // Encode target size (variable length)
  parts.push(encodeSize(tgtSize))

  // Encode each instruction
  for (const instr of instructions) {
    if (instr.type === 'COPY') {
      parts.push(encodeCopyInstruction(instr.srcOffset, instr.length))
    } else {
      parts.push(encodeInsertInstruction(instr.data))
    }
  }

  return Buffer.concat(parts)
}

/**
 * Encode a size in variable-length format
 */
function encodeSize(size) {
  const bytes = []
  let value = size

  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) {
      byte |= 0x80
    }
    bytes.push(byte)
  } while (value !== 0)

  return Buffer.from(bytes)
}

/**
 * Encode COPY instruction
 * Format: 1xxxxxxx [offset1 offset2 offset3 offset4] [size1 size2 size3]
 */
function encodeCopyInstruction(offset, size) {
  const parts = []
  let command = 0x80

  // Encode offset (up to 4 bytes)
  const offsetBytes = []
  for (let i = 0; i < 4; i++) {
    const byte = (offset >>> (i * 8)) & 0xff
    if (byte !== 0 || offsetBytes.length > 0) {
      offsetBytes.push(byte)
      command |= 1 << i
    }
  }

  // Encode size (up to 3 bytes)
  const sizeBytes = []
  for (let i = 0; i < 3; i++) {
    const byte = (size >>> (i * 8)) & 0xff
    if (byte !== 0 || sizeBytes.length > 0) {
      sizeBytes.push(byte)
      command |= 1 << (i + 4)
    }
  }

  // If size is 0, it means 0x10000
  if (sizeBytes.length === 0) {
    // Size of 0 means 64KB
  }

  parts.push(Buffer.from([command]))
  if (offsetBytes.length > 0) {
    parts.push(Buffer.from(offsetBytes))
  }
  if (sizeBytes.length > 0) {
    parts.push(Buffer.from(sizeBytes))
  }

  return Buffer.concat(parts)
}

/**
 * Encode INSERT instruction
 * Format: 0xxxxxxx <data>
 * where xxxxxxx is the size (max 127)
 */
function encodeInsertInstruction(data) {
  const size = data.length
  if (size > 127) {
    // Split into multiple INSERT instructions
    const parts = []
    for (let i = 0; i < size; i += 127) {
      const chunkSize = Math.min(127, size - i)
      const chunk = data.slice(i, i + chunkSize)
      parts.push(Buffer.from([chunkSize]))
      parts.push(chunk)
    }
    return Buffer.concat(parts)
  }

  return Buffer.concat([Buffer.from([size]), data])
}

/**
 * Analyze delta to get instruction statistics
 * @param {Buffer} source - Base buffer
 * @param {Buffer} target - Target buffer
 * @returns {Object} Delta statistics
 */
export function analyzeDelta(source, target) {
  const sourceStr = source.toString('binary')
  const targetStr = target.toString('binary')
  const patches = Diff.diffChars(sourceStr, targetStr)

  let copyBytes = 0
  let insertBytes = 0
  let copyInstructions = 0
  let insertInstructions = 0

  for (const patch of patches) {
    const length = patch.value.length

    if (!patch.added && !patch.removed) {
      // Unchanged - would be a COPY
      if (length >= MIN_COPY_LENGTH) {
        copyBytes += length
        copyInstructions++
      } else {
        insertBytes += length
        insertInstructions++
      }
    } else if (patch.added) {
      // Added - INSERT
      insertBytes += length
      insertInstructions++
    }
    // removed patches don't add to target
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

// Export constants for compatibility
export { MIN_COPY_LENGTH }
export const MAX_INSERT_LENGTH = 127
