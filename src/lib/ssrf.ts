/**
 * SSRF guard.
 *
 * This module is shared by the browser app (as a pre-flight UX check) and by the
 * optional Cloudflare Worker scan service (as an enforcement layer). It is
 * intentionally dependency free and heavily unit tested: everything else in the
 * product is a nice-to-have, but an URL fetch service that can be pointed at
 * 169.254.169.254 or at a router admin panel is a liability.
 *
 * Design notes
 *  - Only http/https, only default ports, no credentials in the URL.
 *  - Host names are classified both as *names* (`localhost`, `*.internal`, …) and
 *    as *literals* (`127.1`, `0x7f000001`, `[::1]`, `[::ffff:127.0.0.1]`).
 *  - DNS is resolved by the worker before connecting and **every** returned
 *    address is checked, which is what defends against DNS rebinding; the worker
 *    additionally re-validates after every redirect.
 */

export type SsrfReason =
  | 'not-a-url'
  | 'scheme'
  | 'no-host'
  | 'credentials'
  | 'port'
  | 'blocked-hostname'
  | 'ip-format'
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'metadata'
  | 'cgnat'
  | 'multicast'
  | 'reserved'
  | 'unspecified'
  | 'documentation'
  | 'broadcast'
  | 'embedded-private';

export interface SafeUrlOk {
  ok: true;
  url: URL;
  hostname: string;
}
export interface SafeUrlDenied {
  ok: false;
  reason: SsrfReason;
  detail: string;
}
export type SafeUrlResult = SafeUrlOk | SafeUrlDenied;

export const ALLOWED_PORTS = ['', '80', '443'];

/** Host names that must never be resolved, even before DNS. */
const BLOCKED_HOST_SUFFIXES = [
  'localhost',
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.corp',
  '.home',
  '.home.arpa',
  '.lan',
  '.private',
  '.test',
  '.invalid',
  '.example',
  '.onion',
  '.svc',
  '.cluster.local',
];

const BLOCKED_HOST_EXACT = [
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
  'host.docker.internal',
  'gateway.docker.internal',
  'docker.for.mac.host.internal',
  'broadcasthost',
];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOST_EXACT.includes(host)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix));
}

/* ------------------------------------------------------------------ ipv4 */

/**
 * Parses IPv4 in all the forms URL parsers and `inet_aton` accept:
 * `127.0.0.1`, `127.1`, `0x7f.0.0.1`, `0177.0.0.1`, `2130706433`.
 */
export function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(part)) return null;
    let value: number;
    if (/^0x/i.test(part)) value = parseInt(part.slice(2), 16);
    else if (part.length > 1 && part.startsWith('0')) value = parseInt(part, 8);
    else value = parseInt(part, 10);
    if (!Number.isFinite(value) || value < 0) return null;
    nums.push(value);
  }
  const last = nums.pop() as number;
  if (nums.length > 3) return null;
  for (const n of nums) if (n > 255) return null;
  const remaining = 4 - nums.length;
  if (last >= Math.pow(256, remaining)) return null;
  const bytes = [...nums];
  for (let i = remaining - 1; i >= 0; i--) bytes.push((last >>> (8 * i)) & 0xff);
  return bytes.length === 4 ? bytes : null;
}

export function ipv4ToString(bytes: number[]): string {
  return bytes.join('.');
}

export function classifyIpv4(octets: number[]): SsrfReason | 'public' {
  const [o1, o2, o3, o4] = octets;
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return 'unspecified';
  if (o1 === 255 && o2 === 255 && o3 === 255 && o4 === 255) return 'broadcast';
  if (o1 === 127) return 'loopback';
  if (o1 === 10) return 'private';
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return 'private';
  if (o1 === 192 && o2 === 168) return 'private';
  if (o1 === 169 && o2 === 254) {
    // 169.254.169.254 is the cloud metadata endpoint on AWS/GCP/OpenStack…
    if (o3 === 169 && o4 === 254) return 'metadata';
    return 'link-local';
  }
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return 'cgnat';
  if (o1 === 192 && o2 === 0 && o3 === 0) return 'reserved'; // 192.0.0.0/24
  if (o1 === 192 && o2 === 0 && o3 === 2) return 'documentation'; // 192.0.2.0/24
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return 'reserved'; // benchmarking
  if (o1 === 198 && o2 === 51 && o3 === 100) return 'documentation';
  if (o1 === 203 && o2 === 0 && o3 === 113) return 'documentation';
  if (o1 === 192 && o2 === 88 && o3 === 99) return 'reserved'; // 6to4 relay
  if (o1 >= 224 && o1 <= 239) return 'multicast';
  if (o1 >= 240) return 'reserved';
  return 'public';
}

/* ------------------------------------------------------------------ ipv6 */

/** Expands an IPv6 literal into 8 numeric hextets, or null. */
export function parseIpv6(input: string): number[] | null {
  let host = input.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host.includes(':')) return null;
  // Zone id (fe80::1%eth0) — reject, we never scan link local anyway.
  if (host.includes('%')) return null;

  // Trailing dotted quad -> convert to two hextets.
  const dotted = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const v4 = parseIpv4(dotted[1]);
    if (!v4) return null;
    host = host.slice(0, host.length - dotted[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    if (host.endsWith('::') || host.endsWith(':')) host = host.replace(/:+$/, '::');
  }

  const halves = host.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (s: string): number[] | null => {
    if (!s) return [];
    const out: number[] = [];
    for (const part of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      out.push(parseInt(part, 16));
    }
    return out;
  };
  const head = parseHalf(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = parseHalf(halves[1]);
  if (!tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function embeddedIpv4(p: number[]): number[] {
  return [(p[6] >> 8) & 0xff, p[6] & 0xff, (p[7] >> 8) & 0xff, p[7] & 0xff];
}

export function classifyIpv6(p: number[]): SsrfReason | 'public' {
  const allZero = p.every((h) => h === 0);
  if (allZero) return 'unspecified';
  const isLoopback = p.slice(0, 7).every((h) => h === 0) && p[7] === 1;
  if (isLoopback) return 'loopback';
  // IPv4-mapped ::ffff:a.b.c.d — classify the embedded address.
  if (p.slice(0, 5).every((h) => h === 0) && p[5] === 0xffff) {
    return classifyIpv4(embeddedIpv4(p));
  }
  // IPv4-compatible (deprecated) ::a.b.c.d — always refused.
  if (p.slice(0, 6).every((h) => h === 0) && !(p[6] === 0 && p[7] === 0)) {
    return 'embedded-private';
  }
  if ((p[0] & 0xfe00) === 0xfc00) return 'private'; // fc00::/7 ULA
  if ((p[0] & 0xffc0) === 0xfe80) return 'link-local'; // fe80::/10
  if ((p[0] & 0xffc0) === 0xfec0) return 'reserved'; // fec0::/10 site local (deprecated)
  if ((p[0] & 0xff00) === 0xff00) return 'multicast'; // ff00::/8
  if (p[0] === 0x2001 && p[1] === 0x0db8) return 'documentation'; // 2001:db8::/32
  if (p[0] === 0x2001 && p[1] === 0x0000) return 'reserved'; // Teredo
  if (p[0] === 0x0064 && p[1] === 0xff9b) {
    // NAT64 64:ff9b::/96 — the tail is an IPv4 address, check it too.
    return classifyIpv4(embeddedIpv4(p));
  }
  if (p[0] === 0x2002) {
    // 6to4 embeds an IPv4 address in the first 4 bytes.
    return classifyIpv4([(p[0] >> 8) & 0xff, p[0] & 0xff, (p[1] >> 8) & 0xff, p[1] & 0xff]);
  }
  return 'public';
}

/** Classifies an IP literal (v4 or v6). Returns 'public' when it is safe to fetch. */
export function classifyIp(ip: string): SsrfReason | 'public' {
  const v4 = parseIpv4(ip);
  if (v4) return classifyIpv4(v4);
  const v6 = parseIpv6(ip);
  if (v6) return classifyIpv6(v6);
  return 'ip-format';
}

export function isBlockedIp(ip: string): boolean {
  return classifyIp(ip) !== 'public';
}

/* ------------------------------------------------------------------ urls */

/**
 * Validates one absolute URL for outbound fetching.
 * Used before the first request and again after every redirect.
 */
export function assertSafeUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not-a-url', detail: raw };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme', detail: url.protocol };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials', detail: url.host };
  }
  if (!url.hostname) return { ok: false, reason: 'no-host', detail: raw };
  if (!ALLOWED_PORTS.includes(url.port)) {
    return { ok: false, reason: 'port', detail: url.port };
  }

  const hostname = url.hostname.toLowerCase();
  // IP literal? (IPv6 literals arrive wrapped in brackets.)
  const literal = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  const looksLikeIp = /^[0-9.]+$/.test(literal) || literal.includes(':');
  if (looksLikeIp) {
    const cls = classifyIp(literal);
    if (cls !== 'public') return { ok: false, reason: cls, detail: literal };
    return { ok: true, url, hostname };
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: 'blocked-hostname', detail: hostname };
  }
  return { ok: true, url, hostname };
}

/**
 * Checks every address a DNS lookup returned. A single private answer is enough
 * to refuse the request — this is the DNS-rebinding defence.
 */
export function assertPublicAddresses(ips: string[]): { ok: true } | { ok: false; reason: SsrfReason; detail: string } {
  if (ips.length === 0) return { ok: false, reason: 'ip-format', detail: 'no-dns-answer' };
  for (const ip of ips) {
    const cls = classifyIp(ip);
    if (cls !== 'public') return { ok: false, reason: cls, detail: ip };
  }
  return { ok: true };
}

/** Resolves a possibly relative `Location` header against the current URL. */
export function resolveRedirect(currentUrl: string, location: string): string | null {
  try {
    const next = new URL(location, currentUrl);
    next.hash = '';
    return next.toString();
  } catch {
    return null;
  }
}
