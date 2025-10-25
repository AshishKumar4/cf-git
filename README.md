# @ashishkumar472/cf-git

A Cloudflare Workers-native fork of [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git), optimized specifically for the Cloudflare Workers runtime.

[![npm version](https://badge.fury.io/js/@ashishkumar472%2Fcf-git.svg)](https://www.npmjs.com/package/@ashishkumar472/cf-git)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Key Differences from Upstream

### 1. Native Cloudflare Workers APIs

- **SHA-1 Hashing**: Uses `crypto.subtle.digestSync()` (Workers-specific synchronous crypto API)
- **No CommonJS Dependencies**: Removed `sha.js`, `async-lock`, and `path-browserify`
- **Pure ESM**: All modules are ES modules with no CommonJS fallbacks

### 2. Modified Components

#### `src/utils/shasum.js`
- Replaced `sha.js` with native `crypto.subtle.digestSync()`
- Falls back to async `crypto.subtle.digest()` if needed
- **Workers-only**: No Node.js crypto support

#### `src/utils/join.js`
- Replaced `path-browserify` with simple string-based path joining
- Sufficient for git operations which always use forward slashes

#### `src/utils/AsyncLock.js`
- Replaced `async-lock` with queue-based implementation

### 3. Testing

Tests run in actual Cloudflare Workers runtime using `@cloudflare/vitest-pool-workers`:

```bash
# Run Workers-specific tests
npm run test:workers

# Watch mode
npm run test:workers:watch
```

## Why This Fork?

The original `isomorphic-git` uses CommonJS modules (`require()`) which don't work in Cloudflare Workers' ESM-only environment. Instead of using polyfills, we modified the source to use native Workers APIs directly, resulting in:

- **Faster performance** - Native crypto is faster than polyfills
- **Smaller bundle** - Fewer dependencies
- **No build issues** - No CommonJS transformation needed
- **Type-safe** - Proper Workers types
- **Tested** - Tests run in actual Workers runtime

## Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Build
npm run build

# Test in Workers environment
npm run test:workers

# Format code
npm run format
```

## Installation

```bash
npm install @ashishkumar472/cf-git
# or
bun add @ashishkumar472/cf-git
```

## Usage

```javascript
import git from '@ashishkumar472/cf-git'
import http from '@ashishkumar472/cf-git/http/web'

// All isomorphic-git APIs work the same way
await git.clone({
  fs,
  http,
  dir: '/repo',
  url: 'https://github.com/owner/repo',
})
```

## Compatibility

**Works with:**
- Cloudflare Workers
- Cloudflare Pages Functions
- Miniflare (local development)
- Vitest with Workers pool

**Does NOT work with:**
- Node.js (use original isomorphic-git)
- Browser (no digestSync support)
- Other edge runtimes without Workers APIs

## License

MIT (same as original isomorphic-git)

## Credits

Based on [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) by William Hilton and contributors.
