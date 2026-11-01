/**
 * HTML extraction (no rendering, no JavaScript execution).
 *
 * Everything is read from the raw response body with DOMParser, which is exactly
 * what a non-rendering crawler sees. The UI states this explicitly: results here
 * are *not* a post-JavaScript DOM audit.
 */

import type { HtmlDoc } from './types';
import { byteLength } from './robots';

export const TITLE_MIN = 15;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

export interface ExtractOptions {
  /** Base URL used to classify internal vs external links. */
  baseUrl?: string;
}

export function extractHtml(html: string, options: ExtractOptions = {}): HtmlDoc {
  const text = html ?? '';
  const empty: HtmlDoc = {
    title: null,
    titleCount: 0,
    description: null,
    descriptionCount: 0,
    canonical: null,
    canonicalCount: 0,
    robotsMeta: [],
    lang: null,
    viewport: null,
    charset: null,
    doctype: false,
    h1: [],
    h2Count: 0,
    og: {},
    twitter: {},
    images: { total: 0, missingAlt: 0, emptyAlt: 0 },
    links: { internal: 0, external: 0, total: 0 },
    hreflang: 0,
    structuredData: 0,
    bytes: byteLength(text),
  };
  if (!text.trim() || typeof DOMParser === 'undefined') return empty;

  const doc = new DOMParser().parseFromString(text, 'text/html');
  const all = <T extends Element>(selector: string): T[] => Array.from(doc.querySelectorAll(selector)) as T[];

  /* title */
  const titles = all<HTMLTitleElement>('title');
  const titleText = titles.length > 0 ? collapse(titles[0].textContent) : null;

  /* meta tags indexed by lower-cased name / property */
  const metas = all<HTMLMetaElement>('meta');
  const byName = new Map<string, string[]>();
  for (const meta of metas) {
    const key = (meta.getAttribute('name') ?? '').trim().toLowerCase();
    if (!key) continue;
    const content = (meta.getAttribute('content') ?? '').trim();
    const list = byName.get(key) ?? [];
    list.push(content);
    byName.set(key, list);
  }

  const descriptionValues = byName.get('description') ?? [];
  const robotsValues = (byName.get('robots') ?? []).concat(byName.get('googlebot') ?? []);

  /* canonical */
  const canonicalLinks = all<HTMLLinkElement>('link[rel]').filter(
    (link) => link.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('canonical'),
  );

  /* language */
  const htmlEl = doc.documentElement;
  const lang = htmlEl?.getAttribute('lang')?.trim() || null;

  /* viewport */
  const viewport = documentedViewport(metas, byName);

  /* charset */
  const charsetMeta = metas.find((m) => m.hasAttribute('charset'));
  const charset =
    charsetMeta?.getAttribute('charset')?.trim() ||
    (metas.find((m) => (m.getAttribute('http-equiv') ?? '').toLowerCase() === 'content-type')?.getAttribute('content') ?? null);

  /* headings */
  const h1 = all<HTMLHeadingElement>('h1')
    .map((el) => collapse(el.textContent))
    .filter((value): value is string => !!value);
  const h2Count = all('h2').length;

  /* open graph / twitter cards */
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  for (const meta of metas) {
    const property = (meta.getAttribute('property') ?? '').trim();
    const name = (meta.getAttribute('name') ?? '').trim().toLowerCase();
    const content = (meta.getAttribute('content') ?? '').trim();
    if (property.toLowerCase().startsWith('og:')) og[property.toLowerCase()] = content;
    if (name.startsWith('twitter:')) twitter[name] = content;
  }

  /* images */
  const images = all<HTMLImageElement>('img');
  const missingAlt = images.filter((img) => !img.hasAttribute('alt')).length;
  const emptyAlt = images.filter((img) => img.hasAttribute('alt') && (img.getAttribute('alt') ?? '').trim() === '').length;

  /* links */
  const anchors = all<HTMLAnchorElement>('a[href]');
  let internal = 0;
  let external = 0;
  let base: URL | null = null;
  if (options.baseUrl) {
    try {
      base = new URL(options.baseUrl);
    } catch {
      base = null;
    }
  }
  for (const anchor of anchors) {
    const href = (anchor.getAttribute('href') ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith('//')) {
      try {
        const url = new URL(href, base ?? 'https://example.invalid/');
        if (base && url.hostname.toLowerCase() === base.hostname.toLowerCase()) internal += 1;
        else external += 1;
      } catch {
        external += 1;
      }
    } else {
      internal += 1;
    }
  }

  return {
    title: titleText && titleText.length > 0 ? titleText : null,
    titleCount: titles.length,
    description: descriptionValues[0]?.length ? descriptionValues[0] : null,
    descriptionCount: descriptionValues.length,
    canonical: canonicalLinks[0]?.getAttribute('href')?.trim() || null,
    canonicalCount: canonicalLinks.length,
    robotsMeta: robotsValues
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    lang,
    viewport,
    charset: charset ? charset.trim() : null,
    doctype: !!doc.doctype,
    h1,
    h2Count,
    og,
    twitter,
    images: { total: images.length, missingAlt, emptyAlt },
    links: { internal, external, total: internal + external },
    hreflang: all<HTMLLinkElement>('link[hreflang]').length,
    structuredData: all('script[type="application/ld+json"]').length,
    bytes: byteLength(text),
  };
}

function documentedViewport(metas: HTMLMetaElement[], byName: Map<string, string[]>): string | null {
  const direct = byName.get('viewport')?.[0];
  if (direct) return direct;
  const viaEquiv = metas.find((m) => (m.getAttribute('http-equiv') ?? '').toLowerCase() === 'viewport');
  return viaEquiv?.getAttribute('content')?.trim() || null;
}

export function collapse(value: string | null | undefined): string | null {
  if (value == null) return null;
  const out = value.replace(/\s+/g, ' ').trim();
  return out.length > 0 ? out : null;
}

/** Does the robots meta tag forbid indexing? */
export function isNoindex(robotsMeta: string[]): boolean {
  return robotsMeta.some((value) => value === 'noindex' || value === 'none');
}

export function isNofollow(robotsMeta: string[]): boolean {
  return robotsMeta.some((value) => value === 'nofollow' || value === 'none');
}

/** Is the viewport meta tag mobile friendly (no fixed width, allows zoom)? */
export function viewportIssue(viewport: string | null): 'missing' | 'fix-width' | 'no-zoom' | null {
  if (!viewport) return 'missing';
  const lower = viewport.toLowerCase();
  if (!lower.includes('width=device-width')) return 'fix-width';
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(lower)) return 'no-zoom';
  return null;
}
