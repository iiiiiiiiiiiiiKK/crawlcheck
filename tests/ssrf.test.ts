import { describe, expect, it } from 'vitest';
import {
  assertPublicAddresses,
  assertSafeUrl,
  classifyIp,
  classifyIpv4,
  isBlockedIp,
  parseIpv4,
  parseIpv6,
  resolveRedirect,
} from '../src/lib/ssrf';

describe('parseIpv4 (inet_aton compatibility)', () => {
  it('parses dotted quads', () => {
    expect(parseIpv4('127.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('8.8.8.8')).toEqual([8, 8, 8, 8]);
  });

  it('parses short, octal, hex and decimal forms', () => {
    expect(parseIpv4('127.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0177.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0x7f.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0x7f000001')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('2130706433')).toEqual([127, 0, 0, 1]);
  });

  it('rejects out-of-range and malformed input', () => {
    expect(parseIpv4('256.1.1.1')).toBeNull();
    expect(parseIpv4('1.2.3.4.5')).toBeNull();
    expect(parseIpv4('example.com')).toBeNull();
    expect(parseIpv4('1.2.3.999999')).toBeNull();
  });
});

describe('parseIpv6', () => {
  it('expands :: and trailing dotted quads', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x1]);
    expect(parseIpv6('[2606:4700::1111]')).toEqual([0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111]);
  });

  it('rejects invalid literals', () => {
    expect(parseIpv6('not:an:ip')).toBeNull();
    expect(parseIpv6('fe80::1%eth0')).toBeNull();
  });
});

describe('classifyIpv4', () => {
  it.each([
    [[0, 0, 0, 0], 'unspecified'],
    [[127, 0, 0, 1], 'loopback'],
    [[10, 1, 2, 3], 'private'],
    [[172, 16, 0, 1], 'private'],
    [[172, 31, 255, 1], 'private'],
    [[172, 32, 0, 1], 'public'],
    [[192, 168, 0, 1], 'private'],
    [[169, 254, 169, 254], 'metadata'],
    [[169, 254, 1, 1], 'link-local'],
    [[100, 64, 0, 1], 'cgnat'],
    [[100, 127, 255, 254], 'cgnat'],
    [[192, 0, 2, 1], 'documentation'],
    [[198, 51, 100, 7], 'documentation'],
    [[203, 0, 113, 9], 'documentation'],
    [[198, 18, 0, 1], 'reserved'],
    [[224, 0, 0, 1], 'multicast'],
    [[240, 0, 0, 1], 'reserved'],
    [[255, 255, 255, 255], 'broadcast'],
    [[93, 184, 216, 34], 'public'],
  ])('%j → %s', (octets, expected) => {
    expect(classifyIpv4(octets as number[])).toBe(expected);
  });
});

describe('classifyIp', () => {
  it('classifies IPv6 ranges', () => {
    expect(classifyIp('::1')).toBe('loopback');
    expect(classifyIp('::')).toBe('unspecified');
    expect(classifyIp('fd00::1')).toBe('private');
    expect(classifyIp('fc00::1')).toBe('private');
    expect(classifyIp('fe80::1')).toBe('link-local');
    expect(classifyIp('ff02::1')).toBe('multicast');
    expect(classifyIp('2001:db8::1')).toBe('documentation');
    expect(classifyIp('2001:0000::1')).toBe('reserved');
    expect(classifyIp('2606:4700::1111')).toBe('public');
  });

  it('looks through IPv4-mapped and NAT64 addresses', () => {
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedIp('64:ff9b::a00:1')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it.each([
    ['http://localhost/', 'blocked-hostname'],
    ['http://LOCALHOST:80/', 'blocked-hostname'],
    ['http://app.localhost/', 'blocked-hostname'],
    ['http://127.0.0.1/', 'loopback'],
    ['http://127.1/', 'loopback'],
    ['http://0x7f000001/', 'loopback'],
    ['http://2130706433/', 'loopback'],
    ['http://10.0.0.1/', 'private'],
    ['http://192.168.1.1:443/', 'private'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata'],
    ['http://100.64.0.1/', 'cgnat'],
    ['http://[::1]/', 'loopback'],
    ['http://[fe80::1]/', 'link-local'],
    ['http://[fd00::1]/', 'private'],
    ['http://[::ffff:127.0.0.1]/', 'loopback'],
    ['http://metadata.google.internal/', 'blocked-hostname'],
    ['http://metadata/', 'blocked-hostname'],
    ['http://foo.internal/', 'blocked-hostname'],
    ['http://printer.local/', 'blocked-hostname'],
    ['http://service.test/', 'blocked-hostname'],
    ['http://192.0.2.10/', 'documentation'],
    ['http://224.0.0.1/', 'multicast'],
    ['http://0.0.0.0/', 'unspecified'],
    ['http://user:pass@example.com/', 'credentials'],
    ['https://example.com:8443/', 'port'],
    ['ftp://example.com/', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
  ])('blocks %s (%s)', (input, reason) => {
    const result = assertSafeUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('allows ordinary public http(s) URLs', () => {
    for (const url of ['https://example.com/', 'http://example.com/robots.txt', 'https://example.com:443/a?b=c']) {
      expect(assertSafeUrl(url).ok).toBe(true);
    }
  });

  it('rejects unparsable input', () => {
    expect(assertSafeUrl('nonsense')).toMatchObject({ ok: false, reason: 'not-a-url' });
  });
});

describe('assertPublicAddresses (DNS rebinding defence)', () => {
  it('accepts a set of public answers', () => {
    expect(assertPublicAddresses(['93.184.216.34', '2606:2800:220:1::1'])).toEqual({ ok: true });
  });

  it('rejects when any single answer is private', () => {
    const verdict = assertPublicAddresses(['93.184.216.34', '10.0.0.5']);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe('private');
      expect(verdict.detail).toBe('10.0.0.5');
    }
  });

  it('rejects an empty answer set', () => {
    expect(assertPublicAddresses([])).toMatchObject({ ok: false, reason: 'ip-format' });
  });
});

describe('resolveRedirect', () => {
  it('resolves relative and absolute locations', () => {
    expect(resolveRedirect('https://example.com/a', '/b')).toBe('https://example.com/b');
    expect(resolveRedirect('https://example.com/a', 'https://other.test/x#f')).toBe('https://other.test/x');
  });

  it('returns null for unusable locations', () => {
    expect(resolveRedirect('https://example.com', 'http://[oops')).toBeNull();
  });
});
