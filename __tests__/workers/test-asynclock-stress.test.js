import { describe, it, expect } from 'vitest'
import AsyncLock from '../../src/utils/AsyncLock.js'

describe('AsyncLock Stress Tests', () => {
  it('should handle high concurrency without race conditions', async () => {
    const lock = new AsyncLock()
    const results = []
    let counter = 0

    async function task(id) {
      await lock.run('counter', async () => {
        const current = counter
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1))
        counter = current + 1
        results.push(id)
      })
    }

    // Launch 50 concurrent tasks
    await Promise.all(Array.from({ length: 50 }, (_, i) => task(i)))

    // Counter should be exactly 50 (no lost updates)
    expect(counter).toBe(50)
    // All tasks should have completed
    expect(results.length).toBe(50)
  })

  it('should handle multiple different locks independently', async () => {
    const lock = new AsyncLock()
    const results = { a: [], b: [] }

    async function taskA(id) {
      await lock.run('lock-a', async () => {
        results.a.push(`start-${id}`)
        await new Promise((resolve) => setTimeout(resolve, 10))
        results.a.push(`end-${id}`)
      })
    }

    async function taskB(id) {
      await lock.run('lock-b', async () => {
        results.b.push(`start-${id}`)
        await new Promise((resolve) => setTimeout(resolve, 10))
        results.b.push(`end-${id}`)
      })
    }

    // Run tasks for lock-a and lock-b in parallel
    await Promise.all([taskA(1), taskA(2), taskB(1), taskB(2)])

    // Each lock should enforce sequential execution independently
    expect(results.a).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
    expect(results.b).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('should cleanup queues after all tasks complete', async () => {
    const lock = new AsyncLock()

    await lock.run('test', async () => {
      // Do nothing
    })

    // Queue should be cleaned up
    expect(lock.queues.has('test')).toBe(false)
  })

  it('should maintain FIFO order', async () => {
    const lock = new AsyncLock()
    const order = []

    async function task(id) {
      const release = await lock.acquire('fifo')
      order.push(id)
      // Small delay to ensure tasks are queued
      await new Promise((resolve) => setTimeout(resolve, 5))
      release()
    }

    // Start all tasks nearly simultaneously
    const tasks = [task(1), task(2), task(3), task(4), task(5)]
    await Promise.all(tasks)

    // Order should be maintained
    expect(order).toEqual([1, 2, 3, 4, 5])
  })
})
