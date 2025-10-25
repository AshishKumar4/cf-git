import { describe, it, expect } from 'vitest'
import { join } from '../../src/utils/join.js'

describe('join - path-browserify compatibility', () => {
  // Tests adapted from path-browserify to ensure full compatibility
  const fixtures = [
    { args: ['/foo/bar', 'baz'], expected: '/foo/bar/baz' },
    { args: ['foo/bar', 'baz'], expected: 'foo/bar/baz' },
    { args: ['foo', 'bar', 'baz'], expected: 'foo/bar/baz' },
    { args: ['/', 'foo', 'bar', 'baz'], expected: '/foo/bar/baz' },
    { args: ['.', 'foo'], expected: 'foo' },
    { args: ['foo', '.'], expected: 'foo' },
    { args: ['.', '.'], expected: '.' },
    { args: ['.', 'foo', '.'], expected: 'foo' },
    { args: ['.', '.', '.'], expected: '.' },
    { args: ['/', '.'], expected: '/' },
    { args: ['/', '.git'], expected: '/.git' },
    { args: ['.', '.git'], expected: '.git' },
    { args: [], expected: '.' },
    { args: ['foo/x', './bar'], expected: 'foo/x/bar' },
    { args: ['foo/x/', './bar'], expected: 'foo/x/bar' },
    { args: ['foo/x/', '.', 'bar'], expected: 'foo/x/bar' },
    { args: ['.', '.', '.'], expected: '.' },
    { args: ['.', './', '.'], expected: '.' },
    { args: ['.', '/./', '.'], expected: '/' },
    { args: ['.', '/////./', '.'], expected: '/' },
    { args: ['.'], expected: '.' },
    { args: ['', '.'], expected: '.' },
    { args: ['foo', '/bar'], expected: '/bar' },
    { args: ['foo', ''], expected: 'foo' },
    { args: ['foo', '', '/bar'], expected: '/bar' },
    { args: ['/'], expected: '/' },
    { args: ['/', '.'], expected: '/' },
    { args: [''], expected: '.' },
    { args: ['', ''], expected: '.' },
    { args: ['', 'foo'], expected: 'foo' },
    { args: ['', '', 'foo'], expected: 'foo' },
    { args: [' /foo'], expected: ' /foo' },
    { args: [' ', 'foo'], expected: ' /foo' },
    { args: [' ', '.'], expected: ' ' },
    { args: [' ', ''], expected: ' ' },
    { args: ['/', '/foo'], expected: '/foo' },
    { args: ['/', '//foo'], expected: '/foo' },
    { args: ['/', '', '/foo'], expected: '/foo' },
  ]

  fixtures.forEach(({ args, expected }) => {
    it(`join(${JSON.stringify(args)}) should return "${expected}"`, () => {
      expect(join(...args)).toBe(expected)
    })
  })
})

describe('join - path normalization', () => {
  it('should handle .. segments', () => {
    expect(join('foo/bar', '..', 'baz')).toBe('foo/baz')
    expect(join('foo/bar/baz', '../..')).toBe('foo')
    expect(join('/foo/bar', '..', 'baz')).toBe('/foo/baz')
  })

  it('should handle .. at the start', () => {
    expect(join('..', 'foo')).toBe('../foo')
    expect(join('..', '..', 'foo')).toBe('../../foo')
    expect(join('/..', 'foo')).toBe('/foo')
  })

  it('should handle complex paths with . and ..', () => {
    expect(join('foo/./bar', '../baz')).toBe('foo/baz')
    expect(join('foo', 'bar/./..', 'baz')).toBe('foo/baz')
    expect(join('foo', './bar', '../baz')).toBe('foo/baz')
  })

  it('should remove duplicate slashes', () => {
    expect(join('foo//bar', 'baz')).toBe('foo/bar/baz')
    expect(join('foo', '//bar')).toBe('/bar')
    expect(join('///foo///bar///')).toBe('/foo/bar/')
  })

  it('should handle trailing slashes correctly', () => {
    expect(join('foo/', 'bar')).toBe('foo/bar')
    expect(join('foo', 'bar/')).toBe('foo/bar/')
    expect(join('foo/', 'bar/')).toBe('foo/bar/')
    expect(join('/', 'foo/')).toBe('/foo/')
  })

  it('should preserve leading slash for absolute paths', () => {
    expect(join('/foo', 'bar')).toBe('/foo/bar')
    expect(join('/', 'foo', 'bar')).toBe('/foo/bar')
    expect(join('//foo', 'bar')).toBe('/foo/bar')
  })

  it('should handle empty segments', () => {
    expect(join('foo', '', 'bar')).toBe('foo/bar')
    expect(join('', 'foo', '', 'bar', '')).toBe('foo/bar')
  })
})

describe('join - edge cases', () => {
  it('should handle single segment', () => {
    expect(join('foo')).toBe('foo')
    expect(join('/foo')).toBe('/foo')
    expect(join('.')).toBe('.')
  })

  it('should handle absolute path override', () => {
    expect(join('foo/bar', '/baz')).toBe('/baz')
    expect(join('foo', 'bar', '/baz')).toBe('/baz')
  })

  it('should handle whitespace', () => {
    expect(join(' foo', 'bar')).toBe(' foo/bar')
    expect(join('foo ', 'bar')).toBe('foo /bar')
  })

  it('should handle special characters in paths', () => {
    expect(join('foo', 'bar.txt')).toBe('foo/bar.txt')
    expect(join('foo', 'bar-baz')).toBe('foo/bar-baz')
    expect(join('foo', 'bar_baz')).toBe('foo/bar_baz')
  })

  it('should be consistent with Node.js path.posix.join', () => {
    // These are common git operations that should work correctly
    expect(join('.git', 'objects', 'pack')).toBe('.git/objects/pack')
    expect(join('/repo', '.git', 'refs', 'heads', 'main')).toBe(
      '/repo/.git/refs/heads/main'
    )
    expect(join('src', '../dist', 'index.js')).toBe('dist/index.js')
  })
})

describe('join - performance', () => {
  it('should handle long paths efficiently', () => {
    const segments = Array(100).fill('segment')
    const result = join(...segments)
    expect(result).toBe(segments.join('/'))
  })

  it('should handle many segments', () => {
    const result = join('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j')
    expect(result).toBe('a/b/c/d/e/f/g/h/i/j')
  })
})
