/**
 * path.join implementation for Cloudflare Workers
 * Compatible with path-browserify behavior
 * Normalizes and joins path segments with forward slashes
 */
export function join(...paths) {
  if (paths.length === 0) return '.'

  // Filter and join segments
  let joined
  for (let i = 0; i < paths.length; i++) {
    const arg = paths[i]
    if (arg && typeof arg === 'string' && arg.length > 0) {
      // If segment starts with '/', it's an absolute path that overrides previous segments
      if (arg.charCodeAt(0) === 47) {
        joined = arg
      } else if (joined === undefined) {
        joined = arg
      } else {
        joined += '/' + arg
      }
    }
  }

  if (joined === undefined) return '.'

  return normalize(joined)
}

/**
 * Normalize a path string
 * Resolves '.' and '..' segments, removes duplicate slashes
 */
function normalize(path) {
  if (path.length === 0) return '.'

  const isAbsolute = path.charCodeAt(0) === 47 // '/'
  const trailingSlash = path.charCodeAt(path.length - 1) === 47

  // Normalize the path
  const segments = []
  let current = ''

  for (let i = 0; i <= path.length; i++) {
    const code = i < path.length ? path.charCodeAt(i) : 47

    if (code === 47) {
      if (current.length === 0) {
        // Empty segment (duplicate slash), skip
        continue
      } else if (current === '.') {
        // Current directory, skip
        current = ''
        continue
      } else if (current === '..') {
        // Parent directory
        if (segments.length > 0 && segments[segments.length - 1] !== '..') {
          // Remove last segment
          segments.pop()
        } else if (!isAbsolute) {
          // Keep '..' if we're at the start and not absolute
          segments.push('..')
        }
        current = ''
        continue
      }

      segments.push(current)
      current = ''
    } else {
      current += path[i]
    }
  }

  // Build result
  let result = segments.join('/')

  // Handle absolute paths
  if (isAbsolute) {
    result = '/' + result
  }

  // Handle trailing slash
  if (trailingSlash && result.length > 1) {
    result += '/'
  }

  // Return '.' for empty relative paths
  if (result.length === 0) {
    return '.'
  }

  return result
}
