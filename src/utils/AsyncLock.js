/**
 * Simple async lock for Cloudflare Workers
 * Provides mutual exclusion for async operations
 */
export default class AsyncLock {
  constructor(options = {}) {
    this.queues = new Map()
    // Accept maxPending option for compatibility with async-lock, but ignore it
  }

  async acquire(key, fn) {
    const lockKey = Array.isArray(key) ? key.join(':') : key

    // Get or create queue for this key
    if (!this.queues.has(lockKey)) {
      this.queues.set(lockKey, [])
    }
    const queue = this.queues.get(lockKey)

    // Create a promise that will resolve when it's this task's turn
    let resolveAcquire
    const acquirePromise = new Promise(resolve => {
      resolveAcquire = resolve
    })

    // Add to queue
    queue.push(resolveAcquire)

    // If not first in queue, wait for turn
    if (queue.length > 1) {
      await acquirePromise
    }

    // Now we have the lock - create release function
    const release = () => {
      // Remove self from queue
      queue.shift()

      // If queue has more waiters, release the next one
      if (queue.length > 0) {
        queue[0]()
      } else {
        // No more waiters, clean up the queue
        this.queues.delete(lockKey)
      }
    }

    // If function provided, run it with lock
    if (typeof fn === 'function') {
      try {
        return await fn()
      } finally {
        release()
      }
    }

    // Otherwise return release function
    return release
  }

  async run(key, fn) {
    // run() is just an alias for acquire(key, fn)
    return this.acquire(key, fn)
  }
}
