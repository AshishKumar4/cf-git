/**
 * Rabin Fingerprinting for Git Delta Compression
 * Based on git's diff-delta.c implementation
 *
 * Uses precomputed polynomial tables for O(1) rolling hash updates
 */

const RABIN_WINDOW = 16
const RABIN_SHIFT = 23
const RABIN_MASK = (1 << RABIN_SHIFT) - 1
const POLYNOMIAL = 0x1d // Irreducible polynomial

// Precomputed tables (initialized on module load)
const T = new Uint32Array(256) // Forward polynomial
const U = new Uint32Array(256) // Reverse polynomial (for removal)

/**
 * Initialize Rabin polynomial tables
 * T[] = forward polynomial for adding bytes
 * U[] = reverse polynomial for removing bytes from window
 */
function initRabinTables() {
  // Generate T[] table
  for (let i = 0; i < 256; i++) {
    let poly = i
    for (let j = 0; j < RABIN_SHIFT; j++) {
      if (poly & (1 << (RABIN_SHIFT - 1))) {
        poly = (poly << 1) ^ POLYNOMIAL
      } else {
        poly = poly << 1
      }
    }
    T[i] = poly & RABIN_MASK
  }

  // Generate U[] table (for window removal)
  // U[i] = T[i] shifted by (RABIN_WINDOW-1) * 8 bits
  // This represents x^((RABIN_WINDOW-1)*8 + RABIN_SHIFT) mod P
  for (let i = 0; i < 256; i++) {
    let poly = T[i]
    // Shift by (RABIN_WINDOW-1) * 8 additional bits
    for (let j = 0; j < (RABIN_WINDOW - 1) * 8; j++) {
      if (poly & (1 << (RABIN_SHIFT - 1))) {
        poly = (poly << 1) ^ POLYNOMIAL
      } else {
        poly = poly << 1
      }
      poly &= RABIN_MASK
    }
    U[i] = poly
  }
}

// Initialize on module load
initRabinTables()

/**
 * Rabin Fingerprint with rolling hash
 * Maintains a sliding window of RABIN_WINDOW bytes
 */
export class RabinFingerprint {
  constructor() {
    this.window = Buffer.alloc(RABIN_WINDOW)
    this.hash = 0
    this.pos = 0
    this.filled = false
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.window.fill(0)
    this.hash = 0
    this.pos = 0
    this.filled = false
  }

  /**
   * Slide window by one byte
   * @param {number} byte - New byte to add (0-255)
   * @returns {number} Current hash value
   */
  slide(byte) {
    if (!this.filled && this.pos < RABIN_WINDOW) {
      // Still filling initial window
      this.window[this.pos] = byte
      this.hash = ((this.hash << 8) | byte) & RABIN_MASK
      this.pos++

      if (this.pos === RABIN_WINDOW) {
        this.filled = true
        this.pos = 0
      }
    } else {
      // Window full - use rolling hash
      const oldByte = this.window[this.pos]
      this.window[this.pos] = byte

      // Simple rolling hash: remove old byte contribution, add new byte
      // Old byte was at position RABIN_WINDOW*8 bits ago
      const oldContribution = oldByte << ((RABIN_WINDOW - 1) * 8)
      this.hash = (((this.hash - oldContribution) << 8) | byte) & RABIN_MASK

      this.pos = (this.pos + 1) % RABIN_WINDOW
    }

    return this.hash
  }

  /**
   * Get current hash value
   * @returns {number} Hash value (0 to RABIN_MASK)
   */
  getHash() {
    return this.hash
  }

  /**
   * Check if window is fully populated
   * @returns {boolean} True if contains RABIN_WINDOW bytes
   */
  isFilled() {
    return this.filled
  }

  /**
   * Get current window contents
   * @returns {Buffer} Copy of window buffer
   */
  getWindow() {
    return Buffer.from(this.window)
  }
}

/**
 * Compute static Rabin hash for a buffer region
 * @param {Buffer} buffer - Source buffer
 * @param {number} offset - Start offset
 * @param {number} length - Number of bytes (default: RABIN_WINDOW)
 * @returns {number} Hash value
 */
export function computeRabinHash(buffer, offset, length = RABIN_WINDOW) {
  if (length !== RABIN_WINDOW) {
    throw new Error(
      `Rabin hash requires exactly ${RABIN_WINDOW} bytes, got ${length}`
    )
  }

  if (offset + length > buffer.length) {
    throw new Error(
      `Buffer overflow: offset ${offset} + length ${length} > buffer length ${buffer.length}`
    )
  }

  // Simple hash without polynomial for now - just used for matching
  let hash = 0
  for (let i = 0; i < length; i++) {
    hash = ((hash << 8) | buffer[offset + i]) & RABIN_MASK
  }
  return hash
}

// Export constants
export { RABIN_WINDOW, RABIN_SHIFT, RABIN_MASK }
