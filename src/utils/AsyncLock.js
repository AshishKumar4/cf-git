/**
 * Simple async lock for Cloudflare Workers
 * Provides mutual exclusion for async operations
 * 
 * Compatible with npm 'async-lock' API:
 * - acquire(key, fn) - acquire lock and run function (async-lock API)
 * - acquire(key) - acquire lock and return release function (custom API)
 */
export default class AsyncLock {
  constructor(options = {}) {
    this.locks = new Map()
    // Accept maxPending option for compatibility with async-lock, but ignore it
    // since we use a simpler wait-based approach
  }

  async acquire(key, fn) {
    const lockKey = Array.isArray(key) ? key.join(':') : key

    // Wait for existing lock to release
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey)
    }

    // Create new lock
    let releaseFn
    const lockPromise = new Promise(resolve => {
      releaseFn = resolve
    })

    this.locks.set(lockKey, lockPromise)

    // Create release function
    const release = () => {
      this.locks.delete(lockKey)
      releaseFn()
    }

    // If function provided, run it with lock (async-lock npm package API)
    if (typeof fn === 'function') {
      try {
        return await fn()
      } finally {
        release()
      }
    }

    // Otherwise return release function (custom API for manual control)
    return release
  }

  async run(key, fn) {
    // run() is just an alias for acquire(key, fn)
    return this.acquire(key, fn)
  }
}
