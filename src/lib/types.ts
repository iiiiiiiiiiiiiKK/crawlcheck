/**
 * Core domain types for CrawlCheck.
 *
 * The single most important design rule of this project lives here: a check can
 * end in five distinct states, and `unverified` / `error` are **never** treated
 * as `pass`. "The site is fine" and "we could not look" must never be confused.
 */

/** Result of a single check. */
export type Status = 'pass' | 'warn' | 'fail' | 'unverified' | 'error';

export const STATUS_ORDER: Status[] = ['fail', 'warn', 'unverified', 'error', 'pass'];

/** Report sections / navigation groups. */
export type Category = 'url' | 'robots' | 'sitemap' | 'seo' | 'html';

/** Where the data came from. Local, demo and online results are always labelled. */
export type ScanMode = 'online' | 'local' | 'demo';

/**
 * State of a remote resource we tried to read.
 * `missing` means the server said 404/410 -> the site really does not have it.
 * `blocked` / `timeout` / `error` mean *we* could not read it -> `unverified`.
 */
export type ResourceState = 'ok' | 'missing' | 'blocked' | 'timeout' | 'error' | 'not-checked';

export interface ResourceMeta {
  state: ResourceState;
  /** HTTP status code, when known. */
  httpStatus?: number;
  /** Final URL after redirects, when known. */
  url?: string;
  /** Body size in bytes, when known. */
  bytes?: number;
  /** Short machine code explaining a non-ok state: 'cors' | 'network' | 'timeout' | 'too-large' | 'http-500' … */
  message?: string;
  /** Number of redirects followed. */
  redirects?: number;
  contentType?: string;
}

export interface Finding {
  /** Stable id, unique inside a report (category + code + index). */
  id: string;
  category: Category;
  /** Message code resolved through the i18n catalogue. */
  code: string;
  status: Status;
  /** Interpolation values for the message templates. */
  params: Record<string, string | number>;
  /** Contribution to the health score. `0` = informational only. */
  weight: number;
  /** Optional evidence lines rendered as a small monospace block. */
  evidence?: string[];
  /** Optional line number in the source document. */
  line?: number;
}

/* ------------------------------------------------------------------ robots */

export interface RobotsRule {
  type: 'allow' | 'disallow';
  /** Raw path pattern as written by the site owner (may contain * and $). */
  path: string;
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
  sitemaps: string[];
  line: number;
}

export interface RobotsIssue {
  code: string;
  status: Status;
  params: Record<string, string | number>;
  line?: number;
}

export interface RobotsDoc {
  raw: string;
  groups: RobotsGroup[];
  /** Sitemap directives in the order they appeared (global and inside groups). */
  sitemaps: string[];
  issues: RobotsIssue[];
  lines: number;
  bytes: number;
}

/* ----------------------------------------------------------------- sitemap */

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  valid: boolean;
  /** 'empty' | 'invalid-url' | 'not-absolute' */
  reason?: string;
}

export interface SitemapDoc {
  /** Where this document came from (URL or file name). */
  source: string;
  kind: 'urlset' | 'index' | 'unknown';
  entries: SitemapEntry[];
  childSitemaps: SitemapEntry[];
  duplicates: string[];
  emptyLoc: number;
  bytes: number;
  parseError?: string;
  /** True when this document is a child of a sitemap index. */
  isChild?: boolean;
}

/* -------------------------------------------------------------------- html */

export interface HtmlDoc {
  title: string | null;
  titleCount: number;
  description: string | null;
  descriptionCount: number;
  canonical: string | null;
  canonicalCount: number;
  robotsMeta: string[];
  xRobotsTag?: string | null;
  lang: string | null;
  viewport: string | null;
  charset: string | null;
  doctype: boolean;
  h1: string[];
  h2Count: number;
  og: Record<string, string>;
  twitter: Record<string, string>;
  images: { total: number; missingAlt: number; emptyAlt: number };
  links: { internal: number; external: number; total: number };
  hreflang: number;
  structuredData: number;
  bytes: number;
}

export interface HtmlIssue {
  code: string;
  status: Status;
  params: Record<string, string | number>;
}

/* ------------------------------------------------------------------ report */

export interface ReportTarget {
  /** Exactly what the user typed / uploaded. */
  input: string;
  /** Normalised absolute URL (online mode). */
  url?: string;
  origin?: string;
  host?: string;
}

export interface ScoreBreakdown {
  value: number;
  grade: string;
  pass: number;
  warn: number;
  fail: number;
  unverified: number;
  error: number;
  /** Weight that actually entered the score. */
  countedWeight: number;
  /** Weight excluded because it could not be verified. */
  excludedWeight: number;
}

export interface ReportLimits {
  /** e.g. "maxRedirects" */
  name: string;
  value: string;
}

export interface Report {
  id: string;
  createdAt: string;
  mode: ScanMode;
  target: ReportTarget;
  score: ScoreBreakdown;
  findings: Finding[];
  robots: RobotsDoc | null;
  robotsMeta: ResourceMeta;
  sitemaps: SitemapDoc[];
  sitemapMeta: ResourceMeta;
  html: HtmlDoc | null;
  htmlMeta: ResourceMeta;
  /** Machine codes for "why some things were not checked" — shown as a banner. */
  limitationCodes: string[];
}

/** Lightweight record stored in IndexedDB / localStorage. */
export interface HistoryEntry {
  id: string;
  createdAt: string;
  mode: ScanMode;
  input: string;
  host?: string;
  score: number;
  grade: string;
  fail: number;
  warn: number;
  unverified: number;
  error: number;
  pass: number;
  /** Full report so a history row can be reopened. */
  report: Report;
}

export const TOOL_VERSION = '1.0.0';
