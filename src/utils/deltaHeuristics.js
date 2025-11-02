/**
 * Delta Heuristics for Smart Base Selection
 * Implements git's strategies for choosing optimal delta base objects
 */

const MAX_DELTA_CHAIN_DEPTH = 50 // Git default
const MIN_SIZE_FOR_DELTA = 16 // Git's minimum (one window size)

/**
 * Find best base object for creating a delta
 * @param {Object} target - Target object { oid, type, data }
 * @param {Array<Object>} candidates - Potential base objects
 * @param {Object} options - Options { maxChainDepth }
 * @returns {Object|null} Best base object or null
 */
export function findDeltaBase(target, candidates, options = {}) {
  const maxChainDepth = options.maxChainDepth || MAX_DELTA_CHAIN_DEPTH

  // Don't delta very small objects
  if (target.data.length < MIN_SIZE_FOR_DELTA) {
    return null
  }

  // Filter suitable candidates
  const suitable = candidates.filter(candidate => {
    // Must be same type
    if (candidate.type !== target.type) return false

    // Skip if already too deep in delta chain
    if (candidate.depth && candidate.depth >= maxChainDepth) return false

    // Similar size (within 2x)
    const sizeRatio =
      Math.max(candidate.data.length, target.data.length) /
      Math.min(candidate.data.length, target.data.length)
    if (sizeRatio > 2.0) return false

    return true
  })

  if (suitable.length === 0) return null

  // Score each candidate by similarity
  const scored = suitable.map(candidate => ({
    ...candidate,
    score: computeSimilarityScore(candidate, target),
  }))

  // Sort by score (higher = better)
  scored.sort((a, b) => b.score - a.score)

  return scored[0]
}

/**
 * Compute similarity score between base and target
 * @param {Object} base - Base object { oid, type, data, path }
 * @param {Object} target - Target object { oid, type, data, path }
 * @returns {number} Similarity score (0-100)
 */
export function computeSimilarityScore(base, target) {
  let score = 0

  // 1. Size similarity (0-30 points)
  const sizeDiff =
    Math.abs(base.data.length - target.data.length) / target.data.length
  score += (1 - Math.min(sizeDiff, 1)) * 30

  // 2. Prefix matching (0-30 points)
  const prefixLen = Math.min(100, base.data.length, target.data.length)
  let matching = 0
  for (let i = 0; i < prefixLen; i++) {
    if (base.data[i] === target.data[i]) matching++
  }
  score += (matching / prefixLen) * 30

  // 3. Path similarity (0-20 points)
  if (base.path && target.path) {
    if (base.path === target.path) {
      // Same path = likely related versions
      score += 20
    } else if (base.path.split('/').pop() === target.path.split('/').pop()) {
      // Same filename, different directory
      score += 10
    }
  }

  // 4. Chain depth penalty (0-20 points)
  const depthPenalty = (base.depth || 0) / MAX_DELTA_CHAIN_DEPTH
  score += (1 - depthPenalty) * 20

  return score
}

/**
 * Group objects by type for delta processing
 * @param {Array<Object>} objects - Array of { oid, type, data }
 * @returns {Map<string, Array<Object>>} Objects grouped by type
 */
export function groupObjectsByType(objects) {
  const groups = new Map()

  for (const obj of objects) {
    if (!groups.has(obj.type)) {
      groups.set(obj.type, [])
    }
    groups.get(obj.type).push(obj)
  }

  return groups
}

/**
 * Sort objects by similarity for delta processing
 * Objects that are similar should be close together
 * @param {Array<Object>} objects - Objects to sort
 * @returns {Array<Object>} Sorted objects
 */
export function sortBySimilarity(objects) {
  // Group by path/name first
  const byPath = new Map()

  for (const obj of objects) {
    const key = obj.path || obj.oid.slice(0, 2)
    if (!byPath.has(key)) {
      byPath.set(key, [])
    }
    byPath.get(key).push(obj)
  }

  // Sort paths alphabetically for consistent ordering
  const sortedKeys = Array.from(byPath.keys()).sort()

  // Within each group, sort by size (similar sizes together)
  const sorted = []
  for (const key of sortedKeys) {
    const group = byPath.get(key)
    group.sort((a, b) => a.data.length - b.data.length)
    sorted.push(...group)
  }

  return sorted
}

/**
 * Estimate delta savings for a base/target pair
 * @param {Buffer} baseData - Base object data
 * @param {Buffer} targetData - Target object data
 * @returns {number} Estimated compression ratio (0-1)
 */
export function estimateDeltaSavings(baseData, targetData) {
  // Quick estimation without full delta generation

  // If identical, perfect compression
  if (baseData.equals(targetData)) {
    return 0.99
  }

  // Estimate based on prefix similarity
  const checkLength = Math.min(200, baseData.length, targetData.length)
  let matching = 0

  for (let i = 0; i < checkLength; i++) {
    if (baseData[i] === targetData[i]) matching++
  }

  const prefixSimilarity = matching / checkLength

  // Rough estimation: prefix similarity correlates with delta size
  return prefixSimilarity * 0.8 // Conservative estimate
}

/**
 * Select window of candidates for delta base search
 * Uses a sliding window of recent objects
 * @param {Array<Object>} objects - All objects in processing order
 * @param {number} currentIndex - Index of target object
 * @param {number} windowSize - Size of candidate window
 * @returns {Array<Object>} Candidate objects
 */
export function selectCandidateWindow(objects, currentIndex, windowSize = 10) {
  const start = Math.max(0, currentIndex - windowSize)
  return objects.slice(start, currentIndex)
}

/**
 * Decide whether to use delta for an object pair
 * @param {Buffer} baseData - Base object data
 * @param {Buffer} targetData - Target object data
 * @param {Buffer} deltaData - Generated delta
 * @returns {boolean} True if delta should be used
 */
export function shouldUseDelta(baseData, targetData, deltaData) {
  // Delta must save at least 50% of target size
  if (deltaData.length >= targetData.length * 0.5) {
    return false
  }

  // Delta must be smaller than base (sanity check)
  if (deltaData.length >= baseData.length) {
    return false
  }

  // Very small deltas are always good
  if (deltaData.length < 100) {
    return true
  }

  return true
}

export { MAX_DELTA_CHAIN_DEPTH, MIN_SIZE_FOR_DELTA }
