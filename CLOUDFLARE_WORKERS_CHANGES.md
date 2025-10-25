# Cloudflare Workers Compatibility Changes

## Summary

Minimal changes to core isomorphic-git files - **only import statements modified** to use custom Cloudflare Workers-compatible utilities.

## Changes Made

### 1. Custom AsyncLock Implementation

**New File:** `src/utils/AsyncLock.js`

**Purpose:** Replace npm `async-lock` package with Cloudflare Workers-compatible implementation

**API Compatibility:**
- ✅ `acquire(key, fn)` - Compatible with npm async-lock API
- ✅ `acquire(key)` - Returns release function for manual control  
- ✅ `run(key, fn)` - Alias for acquire(key, fn)
- ✅ Constructor accepts `options` parameter (ignored, for compatibility)

**Key Features:**
- No external dependencies
- Uses native Promise and Map
- Simple wait-based locking mechanism
- Compatible with both npm async-lock and custom APIs

---

### 2. Core File Changes (Minimal)

**Changed Files:** (Only import statements)
- `src/managers/GitIndexManager.js` - Line 4
- `src/managers/GitRefManager.js` - Line 4  
- `src/managers/GitShallowManager.js` - Line 2

**Before:**
```javascript
import AsyncLock from 'async-lock'
```

**After:**
```javascript
import AsyncLock from '../utils/AsyncLock.js'
```

**No other changes** to these core files - all logic remains identical.

---

## AsyncLock Implementation Details

```javascript
/**
 * Simple async lock for Cloudflare Workers
 * Compatible with npm 'async-lock' API
 */
export default class AsyncLock {
  constructor(options = {}) {
    this.locks = new Map()
  }

  async acquire(key, fn) {
    const lockKey = Array.isArray(key) ? key.join(':') : key

    // Wait for existing lock
    while (this.locks.has(lockKey)) {
      await this.locks.get(lockKey)
    }

    // Create new lock
    let releaseFn
    const lockPromise = new Promise(resolve => {
      releaseFn = resolve
    })
    this.locks.set(lockKey, lockPromise)

    const release = () => {
      this.locks.delete(lockKey)
      releaseFn()
    }

    // If function provided, run with lock (async-lock API)
    if (typeof fn === 'function') {
      try {
        return await fn()
      } finally {
        release()
      }
    }

    // Otherwise return release function (custom API)
    return release
  }

  async run(key, fn) {
    return this.acquire(key, fn)
  }
}
```

---

## Testing

All operations verified working:

```bash
✓ git.init()
✓ git.add()  
✓ git.commit()
✓ git.log()
✓ AsyncLock with callbacks (async-lock API)
✓ AsyncLock with manual release (custom API)
```

---

## Benefits

1. **Minimal Core Changes** - Only 3 import statements modified
2. **Full Compatibility** - Works with existing isomorphic-git code
3. **No Dependencies** - Pure JavaScript implementation
4. **Workers Optimized** - No Node.js dependencies
5. **Flexible API** - Supports both callback and manual release patterns

---

## Migration Guide

If you need to update other files using `async-lock`:

1. Change import:
   ```javascript
   // Before
   import AsyncLock from 'async-lock'
   
   // After
   import AsyncLock from '../utils/AsyncLock.js'
   ```

2. Code works without changes - API compatible!

---

## Maintenance Notes

- AsyncLock is a standalone utility
- No npm package dependencies
- Can be used in any Cloudflare Workers project
- No modifications needed to existing lock usage patterns
