/**
 * Cloudflare Workers type extensions
 * These extend the standard Web Crypto API with Workers-specific features
 */

interface SubtleCrypto {
  /**
   * Cloudflare Workers extension: Synchronous digest
   * @see https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#methods
   */
  digestSync(
    algorithm: AlgorithmIdentifier,
    data: BufferSource
  ): ArrayBuffer
}
