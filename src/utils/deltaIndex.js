/**
 * Delta Index for Fast Similarity Matching
 * Uses Rabin fingerprinting with hash table for O(1) lookups
 */

import {
  RabinFingerprint,
  computeRabinHash,
  RABIN_WINDOW,
} from './rabinFingerprint.js'

const MAX_INDEX_SIZE = 100 * 1024 * 1024 // Don't index files > 100MB

/**
 * Entry in the index representing a match location
 */
class IndexEntry {
  constructor(offset) {
    this.offset = offset
    this.next = null
  }
}

/**
 * Delta index for fast similarity matching
 * Uses Rabin fingerprinting with hash table
 */
export class DeltaIndex {
  constructor(source) {
    if (!Buffer.isBuffer(source)) {
      throw new Error('Source must be a Buffer')
    }

    if (source.length > MAX_INDEX_SIZE) {
      throw new Error(
        `Source too large (${source.length} bytes), max ${MAX_INDEX_SIZE}`
      )
    }

    this.source = source
    this.hashTable = new Map()
    this.entries = 0

    this._buildIndex()
  }

  /**
   * Build the index by scanning source with Rabin fingerprinting
   * @private
   */
  _buildIndex() {
    if (this.source.length < RABIN_WINDOW) {
      return // Too small to index
    }

    const fp = new RabinFingerprint()

    // Scan source buffer with sliding window
    for (let i = 0; i < this.source.length; i++) {
      fp.slide(this.source[i])

      if (!fp.isFilled()) {
        continue // Window not full yet
      }

      const hash = fp.getHash()
      const offset = i - RABIN_WINDOW + 1

      // Add entry to hash table
      const entry = new IndexEntry(offset)

      if (!this.hashTable.has(hash)) {
        this.hashTable.set(hash, entry)
      } else {
        // Chain collision entries
        let current = this.hashTable.get(hash)
        while (current.next !== null) {
          current = current.next
        }
        current.next = entry
      }

      this.entries++
    }
  }

  /**
   * Find best match for target data at given position
   * @param {Buffer} target - Target buffer
   * @param {number} targetPos - Position in target
   * @returns {{srcOffset: number, length: number} | null} Match or null
   */
  findMatch(target, targetPos) {
    if (targetPos + RABIN_WINDOW > target.length) {
      return null // Not enough bytes left
    }

    // Compute hash for target window
    const hash = computeRabinHash(target, targetPos, RABIN_WINDOW)

    // Look up in hash table
    let entry = this.hashTable.get(hash)
    if (!entry) {
      return null // No match
    }

    // Find longest match among hash collisions
    let bestMatch = null
    let bestLength = 0

    while (entry !== null) {
      const length = this._matchLength(
        this.source,
        entry.offset,
        target,
        targetPos
      )

      if (length > bestLength) {
        bestMatch = {
          srcOffset: entry.offset,
          length: length,
        }
        bestLength = length
      }

      entry = entry.next
    }

    // Only return match if it's at least RABIN_WINDOW bytes
    return bestLength >= RABIN_WINDOW ? bestMatch : null
  }

  /**
   * Compute actual byte-by-byte match length
   * @private
   */
  _matchLength(source, srcPos, target, tgtPos) {
    let length = 0
    const maxLength = Math.min(source.length - srcPos, target.length - tgtPos)

    while (
      length < maxLength &&
      source[srcPos + length] === target[tgtPos + length]
    ) {
      length++
    }

    return length
  }

  /**
   * Find all matches for target data (for testing/analysis)
   * @param {Buffer} target - Target buffer
   * @param {number} targetPos - Position in target
   * @returns {Array<{srcOffset: number, length: number}>} All matches
   */
  findAllMatches(target, targetPos) {
    if (targetPos + RABIN_WINDOW > target.length) {
      return []
    }

    const hash = computeRabinHash(target, targetPos, RABIN_WINDOW)
    let entry = this.hashTable.get(hash)

    if (!entry) {
      return []
    }

    const matches = []
    while (entry !== null) {
      const length = this._matchLength(
        this.source,
        entry.offset,
        target,
        targetPos
      )

      if (length >= RABIN_WINDOW) {
        matches.push({
          srcOffset: entry.offset,
          length: length,
        })
      }

      entry = entry.next
    }

    return matches
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      sourceSize: this.source.length,
      entries: this.entries,
      hashBuckets: this.hashTable.size,
      avgChainLength: this.entries / this.hashTable.size,
      loadFactor:
        this.hashTable.size /
        Math.max(1, this.source.length - RABIN_WINDOW + 1),
    }
  }

  /**
   * Get collision statistics (for analysis)
   */
  getCollisionStats() {
    const chainLengths = []

    for (const entry of this.hashTable.values()) {
      let count = 0
      let current = entry
      while (current !== null) {
        count++
        current = current.next
      }
      chainLengths.push(count)
    }

    chainLengths.sort((a, b) => a - b)

    return {
      minChainLength: chainLengths[0] || 0,
      maxChainLength: chainLengths[chainLengths.length - 1] || 0,
      medianChainLength: chainLengths[Math.floor(chainLengths.length / 2)] || 0,
      avgChainLength:
        chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length || 0,
    }
  }
}
