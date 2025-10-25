/* eslint-env cloudflare */
/// <reference types="@cloudflare/workers-types" />
import { toHex } from './toHex.js'

/**
 * Cloudflare Workers SHA-1 implementation
 * Uses native crypto.subtle.digestSync() for synchronous hashing
 * @param {Uint8Array | ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export async function shasum(buffer) {
  // Cloudflare Workers provides digestSync for synchronous hashing
  // @ts-ignore - digestSync is a Workers-specific extension
  if (crypto.subtle.digestSync) {
    // @ts-ignore - digestSync is a Workers-specific extension
    const hash = crypto.subtle.digestSync('SHA-1', buffer)
    return toHex(hash)
  }

  // Fallback to async crypto.subtle.digest for other environments
  const hash = await crypto.subtle.digest('SHA-1', buffer)
  return toHex(hash)
}
