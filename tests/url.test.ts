import { describe, expect, it } from 'vitest';
import { normalizeUrl, resolveAgainst, sameOrigin } from '../src/lib/url';

describe('normalizeUrl', () => {
  it('adds a scheme when the user omits one', () => {
    const result = normalizeUrl('example.com');
    expect(result.ok).toBe(true);
    expect(result.hadScheme).toBe(false);
    expect(result.url?.toString()).toBe('https://example.com/');
  });

  it('keeps the path and query, drops the fragment', () => {
    const result = normalizeUrl('https://example.com/a/b?x=1#frag');
    expect(result.url?.toString()).toBe('https://example.com/a/b?x=1');
  });

  it('lower-cases the host but keeps the path case', () => {
    const result = normalizeUrl('HTTP://Example.COM/Path');
    expect(result.ok).toBe(true);
    expect(result.url?.hostname).toBe('example.com');
    expect(result.url?.pathname).toBe('/Path');
    expect(result.url?.protocol).toBe('http:');
  });

  it('accepts the default https port but rejects custom ports', () => {
    expect(normalizeUrl('https://example.com:443/x').ok).toBe(true);
    expect(normalizeUrl('https://example.com:8443/x')).toMatchObject({ ok: false, error: 'url.port' });
  });

  it.each([
    ['', 'url.empty'],
    ['   ', 'url.empty'],
    ['exa mple.com', 'url.whitespace'],
    ['example.com/\u200bpath', 'url.whitespace'],
    ['ftp://example.com', 'url.scheme'],
    ['javascript:alert(1)', 'url.scheme'],
    ['file:///etc/passwd', 'url.scheme'],
    ['https://user:pass@example.com', 'url.credentials'],
    ['https://example', 'url.host'],
  ])('rejects %s with %s', (input, code) => {
    expect(normalizeUrl(input)).toMatchObject({ ok: false, error: code });
  });

  it('accepts IPv6 literals and localhost (SSRF layer decides about them later)', () => {
    expect(normalizeUrl('http://[::1]/').ok).toBe(true);
    expect(normalizeUrl('http://localhost:80/').ok).toBe(true);
  });
});

describe('sameOrigin', () => {
  it('ignores default ports and host case', () => {
    expect(sameOrigin('https://Example.com/a', 'https://example.com:443/b')).toBe(true);
  });

  it('detects different origins', () => {
    expect(sameOrigin('https://example.com/a', 'http://example.com/b')).toBe(false);
    expect(sameOrigin('https://www.example.com', 'https://example.com')).toBe(false);
    expect(sameOrigin('not a url', 'https://example.com')).toBe(false);
  });
});

describe('resolveAgainst', () => {
  it('resolves relative references', () => {
    expect(resolveAgainst('https://example.com/a/b', '../c')).toBe('https://example.com/c');
    expect(resolveAgainst('https://example.com/a/b', 'https://other.test/x')).toBe('https://other.test/x');
  });

  it('returns null on garbage', () => {
    expect(resolveAgainst('https://example.com', 'http://[bad')).toBeNull();
  });
});
