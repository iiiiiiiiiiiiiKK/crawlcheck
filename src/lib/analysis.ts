/**
 * The analyser: turns raw material (HTTP meta, robots.txt text, sitemap XML,
 * HTML source) into a typed report of findings.
 *
 * Both modes (local files and online scan) run through this exact code path, so
 * a local-file report and an online report can never disagree about a parser.
 */

import { computeScore } from './score';
import { parseRobots } from './robots';
import { parseSitemap } from './sitemap';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
  extractHtml,
  isNoindex,
  viewportIssue,
} from './html';
import { sameOrigin } from './url';
import type {
  Category,
  Finding,
  HtmlDoc,
  Report,
  ResourceMeta,
  RobotsDoc,
  ScanMode,
  SitemapDoc,
  Status,
  ReportTarget,
} from './types';

export interface HttpMeta {
  status: number;
  finalUrl: string;
  requestedUrl: string;
  redirected: boolean;
  contentType?: string | null;
  xRobotsTag?: string | null;
}

export interface AnalyzeInput {
  mode: ScanMode;
  target: ReportTarget;
  http?: HttpMeta | null;
  robotsText?: string | null;
  robotsMeta: ResourceMeta;
  sitemapTexts?: { text: string; source: string; isChild?: boolean }[];
  sitemapMeta: ResourceMeta;
  htmlText?: string | null;
  htmlMeta: ResourceMeta;
  limitationCodes?: string[];
}

const SITEMAP_MAX_CHILDREN = 5;

export function analyze(input: AnalyzeInput): Report {
  let seq = 0;
  const findings: Finding[] = [];
  const add = (
    category: Category,
    code: string,
    status: Status,
    weight: number,
    params: Record<string, string | number> = {},
    extra: { evidence?: string[]; line?: number } = {},
  ): void => {
    findings.push({ id: `${category}:${code}:${seq++}`, category, code, status, weight, params, ...extra });
  };

  /* ---------------------------------------------------------------- URL */

  const origin = input.target.origin ?? originOf(input.target.url);
  const protocol = (() => {
    try {
      return origin ? new URL(origin).protocol : '';
    } catch {
      return '';
    }
  })();

  if (input.mode === 'online') {
    add('url', 'url.valid', 'pass', 1, { url: input.target.url ?? input.target.input, host: input.target.host ?? '' });
    if (protocol === 'http:') {
      add('url', 'url.http', 'warn', 2, { origin: origin ?? '' });
    } else if (protocol === 'https:') {
      add('url', 'url.https', 'pass', 2, {});
    }

    const http = input.http;
    if (!http) {
      add('url', 'url.unverified', 'unverified', 3, { reason: input.htmlMeta.message ?? 'network' });
    } else {
      if (http.status >= 200 && http.status < 300) {
        add('url', 'url.reachable', 'pass', 3, { status: http.status });
      } else if (http.status >= 400) {
        add('url', 'url.home-status', 'fail', 3, { status: http.status });
      } else {
        add('url', 'url.home-status', 'warn', 2, { status: http.status });
      }
      if (http.redirected && http.finalUrl && http.requestedUrl && http.finalUrl !== http.requestedUrl) {
        add('url', 'url.redirected', 'warn', 1, { from: http.requestedUrl, to: http.finalUrl });
      }
      if (http.contentType && !/text\/html|application\/xhtml/i.test(http.contentType)) {
        add('url', 'url.content-type', 'warn', 1, { value: http.contentType });
      }
    }
  }

  /* ------------------------------------------------------------- robots */

  let robotsDoc: RobotsDoc | null = null;
  if (input.robotsMeta.state === 'ok' && typeof input.robotsText === 'string') {
    robotsDoc = parseRobots(input.robotsText);
    add('robots', 'robots.found', 'pass', 1, {
      bytes: robotsDoc.bytes,
      lines: robotsDoc.lines,
      groups: robotsDoc.groups.length,
      agents: robotsDoc.groups.reduce((sum, group) => sum + group.agents.length, 0),
    });
    for (const issue of robotsDoc.issues) {
      add('robots', issue.code, issue.status, weightForRobots(issue.code), issue.params, issue.line ? { line: issue.line } : {});
    }
    if (robotsDoc.sitemaps.length > 0) {
      add('robots', 'robots.sitemap-declared', 'pass', 1, {
        count: robotsDoc.sitemaps.length,
        value: robotsDoc.sitemaps[0],
      });
    }
  } else if (input.robotsMeta.state === 'missing') {
    add('robots', 'robots.missing', 'warn', 1, { status: input.robotsMeta.httpStatus ?? 404 });
  } else {
    add('robots', 'robots.unverified', 'unverified', 2, {
      reason: input.robotsMeta.message ?? input.robotsMeta.state,
    });
  }
  add('robots', 'robots.security-note', 'pass', 0);

  /* ------------------------------------------------------------ sitemap */

  const sitemapDocs: SitemapDoc[] = [];
  const sitemapInputs = input.sitemapTexts ?? [];
  if (sitemapInputs.length > 0) {
    sitemapInputs.slice(0, SITEMAP_MAX_CHILDREN + 1).forEach((item, index) => {
      const doc = parseSitemap(item.text, item.source, item.isChild);
      sitemapDocs.push(doc);
      const prefix = item.isChild ? 'child' : 'main';
      if (doc.parseError) {
        add('sitemap', 'sitemap.invalid-xml', 'fail', 3, { source: item.source, error: doc.parseError });
        return;
      }
      if (index === 0) {
        add('sitemap', 'sitemap.found', 'pass', 1, {
          source: item.source,
          bytes: doc.bytes,
          kind: doc.kind,
        });
      }
      if (doc.kind === 'index') {
        add('sitemap', 'sitemap.index-detected', 'pass', 2, {
          source: item.source,
          children: doc.childSitemaps.length,
        });
        if (doc.childSitemaps.length === 0) {
          add('sitemap', 'sitemap.no-urls', 'warn', 1, { source: item.source });
        }
        const invalidChildren = doc.childSitemaps.filter((child) => !child.valid);
        if (invalidChildren.length > 0) {
          add('sitemap', 'sitemap.invalid-loc', 'fail', 2, {
            source: item.source,
            count: invalidChildren.length,
            example: invalidChildren[0].loc || '(empty)',
          });
        }
      } else {
        add('sitemap', 'sitemap.count-info', 'pass', 0, {
          source: item.source,
          count: doc.entries.length,
          prefix,
        });
        if (doc.entries.length === 0) {
          add('sitemap', 'sitemap.no-urls', 'warn', 2, { source: item.source });
        }
        if (doc.entries.length > 50_000) {
          add('sitemap', 'sitemap.too-many', 'fail', 2, { source: item.source, count: doc.entries.length });
        }
        if (doc.duplicates.length > 0) {
          add('sitemap', 'sitemap.duplicates', 'warn', 1, {
            source: item.source,
            count: doc.duplicates.length,
            example: doc.duplicates[0],
          });
        }
        const invalid = doc.entries.filter((entry) => !entry.valid);
        if (invalid.length > 0) {
          add('sitemap', 'sitemap.invalid-loc', 'fail', 2, {
            source: item.source,
            count: invalid.length,
            example: (invalid[0].loc || '(empty)').slice(0, 120),
          });
        }
        if (doc.emptyLoc > 0) {
          add('sitemap', 'sitemap.empty-loc', 'fail', 2, { source: item.source, count: doc.emptyLoc });
        }
        const missingLastmod = doc.entries.filter((entry) => entry.valid && !entry.lastmod).length;
        if (doc.entries.length > 0 && missingLastmod === doc.entries.length) {
          add('sitemap', 'sitemap.lastmod-missing', 'warn', 0, { source: item.source });
        }
        if (origin && doc.entries.length > 0) {
          const crossOrigin = doc.entries.filter((entry) => entry.valid && entry.loc && !sameOrigin(entry.loc, origin));
          if (crossOrigin.length > 0) {
            add('sitemap', 'sitemap.cross-origin', 'warn', 1, {
              source: item.source,
              count: crossOrigin.length,
              example: crossOrigin[0].loc.slice(0, 120),
            });
          }
        }
      }
    });
  } else if (input.sitemapMeta.state === 'missing') {
    add('sitemap', 'sitemap.missing', 'warn', 2, { status: input.sitemapMeta.httpStatus ?? 404 });
  } else {
    add('sitemap', 'sitemap.unverified', 'unverified', 2, {
      reason: input.sitemapMeta.message ?? input.sitemapMeta.state,
    });
  }

  if (robotsDoc && robotsDoc.sitemaps.length === 0 && sitemapDocs.length > 0) {
    add('sitemap', 'sitemap.not-in-robots', 'warn', 1, { source: sitemapDocs[0].source });
  }

  /* ----------------------------------------------------------- SEO / HTML */

  let htmlDoc: HtmlDoc | null = null;
  if (input.htmlMeta.state === 'ok' && typeof input.htmlText === 'string') {
    htmlDoc = extractHtml(input.htmlText, { baseUrl: input.http?.finalUrl ?? input.target.url });
    add('html', 'html.parsed', 'pass', 0, { bytes: htmlDoc.bytes });

    /* title */
    if (!htmlDoc.title) {
      add('seo', 'seo.title-missing', 'fail', 4, {});
    } else {
      const length = htmlDoc.title.length;
      add('seo', 'seo.title', 'pass', 4, { value: htmlDoc.title, length });
      if (length < TITLE_MIN || length > TITLE_MAX) {
        add('seo', 'seo.title-length', 'warn', 1, { length, min: TITLE_MIN, max: TITLE_MAX, value: htmlDoc.title });
      }
    }
    if (htmlDoc.titleCount > 1) add('seo', 'seo.title-multiple', 'warn', 1, { count: htmlDoc.titleCount });

    /* description */
    if (!htmlDoc.description) {
      add('seo', 'seo.description-missing', 'warn', 3, {});
    } else {
      const length = htmlDoc.description.length;
      add('seo', 'seo.description', 'pass', 3, { length });
      if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
        add('seo', 'seo.description-length', 'warn', 1, {
          length,
          min: DESCRIPTION_MIN,
          max: DESCRIPTION_MAX,
        });
      }
    }

    /* h1 */
    if (htmlDoc.h1.length === 0) {
      add('seo', 'seo.h1-missing', 'warn', 2, {});
    } else if (htmlDoc.h1.length === 1) {
      add('seo', 'seo.h1', 'pass', 2, { value: htmlDoc.h1[0].slice(0, 160) });
    } else {
      add('seo', 'seo.h1-multiple', 'warn', 1, { count: htmlDoc.h1.length });
    }

    /* canonical */
    if (!htmlDoc.canonical) {
      add('seo', 'seo.canonical-missing', 'warn', 2, {});
    } else {
      const base = input.http?.finalUrl ?? input.target.url ?? '';
      let valid = true;
      try {
        const url = new URL(htmlDoc.canonical, base || undefined);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') valid = false;
        if (valid && base && !sameOrigin(url, base)) {
          add('seo', 'seo.canonical-cross-origin', 'warn', 1, { value: htmlDoc.canonical });
        }
      } catch {
        valid = false;
      }
      if (valid) add('seo', 'seo.canonical', 'pass', 2, { value: htmlDoc.canonical });
      else add('seo', 'seo.canonical-invalid', 'fail', 2, { value: htmlDoc.canonical });
    }
    if (htmlDoc.canonicalCount > 1) {
      add('seo', 'seo.canonical-multiple', 'warn', 1, { count: htmlDoc.canonicalCount });
    }

    /* robots meta */
    if (isNoindex(htmlDoc.robotsMeta)) {
      add('seo', 'seo.robotsmeta-noindex', 'fail', 3, { value: htmlDoc.robotsMeta.join(', ') });
    } else {
      add('seo', 'seo.robotsmeta', 'pass', 1, { value: htmlDoc.robotsMeta.join(', ') || 'index, follow' });
    }

    /* language */
    if (!htmlDoc.lang) add('seo', 'seo.lang-missing', 'warn', 1, {});
    else add('seo', 'seo.lang', 'pass', 1, { value: htmlDoc.lang });

    /* viewport */
    const viewportProblem = viewportIssue(htmlDoc.viewport);
    if (viewportProblem === 'missing') add('seo', 'seo.viewport-missing', 'warn', 2, {});
    else if (viewportProblem === 'fix-width') add('seo', 'seo.viewport-fixwidth', 'warn', 2, { value: htmlDoc.viewport ?? '' });
    else if (viewportProblem === 'no-zoom') add('seo', 'seo.viewport-nozoom', 'warn', 1, { value: htmlDoc.viewport ?? '' });
    else add('seo', 'seo.viewport', 'pass', 1, { value: htmlDoc.viewport ?? '' });

    /* social */
    const ogKeys = ['og:title', 'og:description', 'og:image'];
    const ogMissing = ogKeys.filter((key) => !htmlDoc?.og[key]);
    if (ogMissing.length === ogKeys.length) add('seo', 'seo.og-missing', 'warn', 1, {});
    else if (ogMissing.length > 0) add('seo', 'seo.og-partial', 'warn', 1, { missing: ogMissing.join(', ') });
    else add('seo', 'seo.og', 'pass', 1, { count: Object.keys(htmlDoc.og).length });

    if (!htmlDoc.twitter['twitter:card']) {
      add('seo', 'seo.twitter-missing', 'warn', 1, {});
    } else {
      add('seo', 'seo.twitter', 'pass', 1, { value: htmlDoc.twitter['twitter:card'] });
    }

    /* html level */
    if (htmlDoc.images.missingAlt > 0) {
      add('html', 'html.img-alt', 'warn', 1, {
        count: htmlDoc.images.missingAlt,
        total: htmlDoc.images.total,
      });
    } else if (htmlDoc.images.total > 0) {
      add('html', 'html.img-alt-ok', 'pass', 1, { total: htmlDoc.images.total });
    }
    if (!htmlDoc.lang) {
      /* reported in the SEO section */
    }
    if (!htmlDoc.charset) add('html', 'html.charset', 'warn', 1, {});
    else add('html', 'html.charset-ok', 'pass', 0, { value: htmlDoc.charset.slice(0, 60) });
    if (!htmlDoc.doctype) add('html', 'html.doctype', 'warn', 0, {});
    add('html', 'html.links', 'pass', 0, {
      internal: htmlDoc.links.internal,
      external: htmlDoc.links.external,
      total: htmlDoc.links.total,
    });
    add('html', 'html.structured-data', htmlDoc.structuredData > 0 ? 'pass' : 'warn', 0, {
      count: htmlDoc.structuredData,
    });
    if (htmlDoc.hreflang > 0) add('html', 'html.hreflang', 'pass', 0, { count: htmlDoc.hreflang });
    add('html', 'html.size', 'pass', 0, { kb: Math.round(htmlDoc.bytes / 1024) });
  } else {
    add('html', 'html.not-checked', 'unverified', 0, { reason: input.htmlMeta.message ?? input.htmlMeta.state });
    add('seo', 'seo.not-checked', 'unverified', 0, { reason: input.htmlMeta.message ?? input.htmlMeta.state });
  }

  /* --------------------------------------------------------- wrap it up */

  const limitationCodes = new Set<string>(input.limitationCodes ?? []);
  if (input.mode !== 'local') limitationCodes.add('limitation.no-js');
  if (input.mode === 'online') {
    limitationCodes.add('limitation.single-page');
    const blocked = [input.robotsMeta, input.sitemapMeta, input.htmlMeta].some(
      (meta) => meta.state === 'blocked' || meta.state === 'timeout' || meta.state === 'error',
    );
    if (blocked) limitationCodes.add('limitation.cors');
  }
  if (input.mode === 'local') limitationCodes.add('limitation.local');
  if (input.mode === 'demo') limitationCodes.add('limitation.demo');

  const score = computeScore(findings);
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    mode: input.mode,
    target: input.target,
    score,
    findings,
    robots: robotsDoc,
    robotsMeta: input.robotsMeta,
    sitemaps: sitemapDocs,
    sitemapMeta: input.sitemapMeta,
    html: htmlDoc,
    htmlMeta: input.htmlMeta,
    limitationCodes: [...limitationCodes],
  };
}

function weightForRobots(code: string): number {
  switch (code) {
    case 'robots.block-all':
      return 4;
    case 'robots.conflict':
      return 2;
    case 'robots.orphan-rule':
      return 2;
    case 'robots.format-error':
      return 1;
    case 'robots.bad-sitemap':
      return 1;
    case 'robots.empty-user-agent':
      return 1;
    case 'robots.duplicate-group':
      return 1;
    case 'robots.unknown-directive':
      return 0;
    case 'robots.crawl-delay':
      return 0;
    case 'robots.empty':
      return 0;
    default:
      return 1;
  }
}

function originOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
