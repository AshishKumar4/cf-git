/**
 * Jest setup file to polyfill Cloudflare Workers globals for Node.js test environment
 */

// Polyfill crypto global for Cloudflare Workers compatibility
import { webcrypto } from 'crypto'

// Make crypto available as a global (as it is in Cloudflare Workers)
global.crypto = webcrypto
