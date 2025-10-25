/**
 * Simple path join for Cloudflare Workers
 * Joins path segments with forward slashes
 */
export function join(...paths) {
  if (paths.length === 0) return '.'

  let joined
  for (const arg of paths) {
    if (arg && arg.length > 0) {
      if (joined === undefined) {
        joined = arg
      } else {
        joined += '/' + arg
      }
    }
  }

  if (joined === undefined) return '.'

  // Basic normalization - remove duplicate slashes
  return joined.replace(/\/+/g, '/')
}
