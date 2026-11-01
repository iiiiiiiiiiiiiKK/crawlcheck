/**
 * sitemap.xml / sitemap index parser.
 *
 * Uses the platform DOMParser (available in every browser, in jsdom for tests and
 * in the Worker runtime), so no XML dependency is shipped.
 */

import type { SitemapDoc, SitemapEntry } from './types';
import { byteLength } from './robots';

export const SITEMAP_URL_LIMIT = 50_000;
export const SITEMAP_SIZE_LIMIT = 50 * 1024 * 1024;

export function parseSitemap(xml: string, source: string, isChild = false): SitemapDoc {
  const base: SitemapDoc = {
    source,
    kind: 'unknown',
    entries: [],
    childSitemaps: [],
    duplicates: [],
    emptyLoc: 0,
    bytes: byteLength(xml ?? ''),
    isChild,
  };

  const text = (xml ?? '').replace(/^\uFEFF/, '').trim();
  if (!text) return { ...base, parseError: 'empty' };

  if (typeof DOMParser === 'undefined') {
    return { ...base, parseError: 'no-domparser' };
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    return { ...base, parseError: 'exception' };
  }

  const root = doc.documentElement;
  const rootName = (root?.localName ?? root?.nodeName ?? '').toLowerCase();
  const parserErrors = doc.getElementsByTagName('parsererror');
  if (rootName === 'parsererror' || parserErrors.length > 0) {
    return { ...base, parseError: 'xml' };
  }
  if (rootName !== 'urlset' && rootName !== 'sitemapindex') {
    return { ...base, parseError: `root:${rootName || 'none'}` };
  }

  const kind: SitemapDoc['kind'] = rootName === 'urlset' ? 'urlset' : 'index';
  const children = Array.from(root.children ?? []);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  let emptyLoc = 0;

  const parseEntry = (element: Element): SitemapEntry | null => {
    const locEl = findChild(element, 'loc');
    const lastmodEl = findChild(element, 'lastmod');
    const loc = (locEl?.textContent ?? '').trim();
    const lastmod = (lastmodEl?.textContent ?? '').trim() || undefined;
    if (!loc) {
      emptyLoc += 1;
      return { loc: '', lastmod, valid: false, reason: 'empty' };
    }
    let valid = true;
    let reason: string | undefined;
    try {
      const url = new URL(loc);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        valid = false;
        reason = 'invalid-url';
      }
    } catch {
      valid = false;
      reason = 'invalid-url';
    }
    if (valid) {
      if (seen.has(loc)) duplicates.push(loc);
      else seen.add(loc);
    }
    return { loc, lastmod, valid, reason };
  };

  const entries: SitemapEntry[] = [];
  const childSitemaps: SitemapEntry[] = [];
  for (const child of children) {
    const name = (child.localName ?? child.nodeName ?? '').toLowerCase();
    if (kind === 'urlset' && name === 'url') {
      const entry = parseEntry(child);
      if (entry) entries.push(entry);
    } else if (kind === 'index' && name === 'sitemap') {
      const entry = parseEntry(child);
      if (entry) childSitemaps.push(entry);
      if (entry?.valid && entry.loc) {
        // Child sitemap URLs must not be counted as content duplicates.
        seen.delete(entry.loc);
      }
    }
  }

  return {
    ...base,
    kind,
    entries,
    childSitemaps,
    duplicates,
    emptyLoc,
  };
}

function findChild(parent: Element, localName: string): Element | null {
  const children = Array.from(parent.children ?? []);
  return children.find((el) => (el.localName ?? el.nodeName ?? '').toLowerCase() === localName) ?? null;
}

export function sitemapUrlCount(doc: SitemapDoc): number {
  return doc.kind === 'index' ? doc.childSitemaps.length : doc.entries.length;
}

/** Extracts `<loc>` values from sitemap declarations in robots.txt. */
export function sitemapCandidates(robotsSitemaps: string[], origin: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    if (!value || out.includes(value)) return;
    out.push(value);
  };
  for (const sitemap of robotsSitemaps) push(sitemap.trim());
  try {
    push(new URL('/sitemap.xml', origin).toString());
  } catch {
    /* ignore malformed origins */
  }
  return out.slice(0, 4);
}
