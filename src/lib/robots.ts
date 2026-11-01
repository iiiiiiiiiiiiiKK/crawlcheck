/**
 * robots.txt parser.
 *
 * A deliberately forgiving RFC 9309 reader: it never throws, it keeps line
 * numbers so the UI can point at the offending line, and it reports problems as
 * structured issues instead of failing the whole document.
 *
 * Reminder that is surfaced in the UI as well: robots.txt is a crawling policy,
 * not access control. `Disallow` does not protect anything.
 */

import type { RobotsDoc, RobotsGroup, RobotsIssue, RobotsRule, Status } from './types';

export const STD_DIRECTIVES = ['user-agent', 'allow', 'disallow', 'sitemap', 'crawl-delay'];

interface MutableGroup extends RobotsGroup {
  hasRules: boolean;
}

export function parseRobots(raw: string): RobotsDoc {
  const text = (raw ?? '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r\n|\r|\n/);
  const groups: MutableGroup[] = [];
  const issues: RobotsIssue[] = [];
  const globalSitemaps: string[] = [];
  const unknownDirectives = new Map<string, number>();
  const orphanRules: number[] = [];
  const formatErrors: { line: number; text: string }[] = [];

  let current: MutableGroup | null = null;

  const startGroup = (line: number): MutableGroup => {
    const group: MutableGroup = { agents: [], rules: [], sitemaps: [], line, hasRules: false };
    groups.push(group);
    return group;
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const withoutComment = stripComment(rawLine).trim();
    if (!withoutComment) return;

    const colon = withoutComment.indexOf(':');
    if (colon === -1) {
      formatErrors.push({ line: lineNo, text: withoutComment.slice(0, 120) });
      return;
    }

    const directive = withoutComment.slice(0, colon).trim().toLowerCase();
    const value = withoutComment.slice(colon + 1).trim();

    if (directive === 'user-agent') {
      if (!value) {
        issues.push({ code: 'robots.empty-user-agent', status: 'warn', params: {}, line: lineNo });
        return;
      }
      if (!current || current.hasRules) current = startGroup(lineNo);
      current.agents.push(value);
      return;
    }

    if (directive === 'sitemap') {
      globalSitemaps.push(value);
      if (current) current.sitemaps.push(value);
      return;
    }

    if (directive === 'allow' || directive === 'disallow') {
      if (!current) {
        orphanRules.push(lineNo);
        return;
      }
      const rule: RobotsRule = { type: directive, path: value, line: lineNo };
      current.rules.push(rule);
      current.hasRules = true;
      return;
    }

    if (directive === 'crawl-delay') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        issues.push({ code: 'robots.bad-crawl-delay', status: 'warn', params: { value }, line: lineNo });
      } else if (current) {
        current.crawlDelay = parsed;
        current.hasRules = true;
      } else {
        orphanRules.push(lineNo);
      }
      return;
    }

    // Anything else (host, request-rate, visit-time, noindex…) is not standard.
    if (!STD_DIRECTIVES.includes(directive)) {
      const count = (unknownDirectives.get(directive) ?? 0) + 1;
      unknownDirectives.set(directive, count);
    }
  });

  /* ---------------------------------------------------------- diagnostics */

  if (formatErrors.length > 0) {
    issues.push({
      code: 'robots.format-error',
      status: 'warn',
      params: {
        count: formatErrors.length,
        first: formatErrors[0].text,
        line: formatErrors[0].line,
      },
      line: formatErrors[0].line,
    });
  }

  if (orphanRules.length > 0) {
    issues.push({
      code: 'robots.orphan-rule',
      status: 'warn',
      params: { count: orphanRules.length, line: orphanRules[0] },
      line: orphanRules[0],
    });
  }

  if (unknownDirectives.size > 0) {
    const names = [...unknownDirectives.keys()];
    issues.push({
      code: 'robots.unknown-directive',
      status: 'warn',
      params: { names: names.slice(0, 5).join(', '), count: names.length },
    });
  }

  const duplicates = findDuplicateAgents(groups);
  if (duplicates.length > 0) {
    issues.push({
      code: 'robots.duplicate-group',
      status: 'warn',
      params: { agents: duplicates.join(', ') },
    });
  }

  const conflicting = findConflicts(groups);
  if (conflicting.length > 0) {
    issues.push({
      code: 'robots.conflict',
      status: 'warn',
      params: { agent: conflicting[0].agent, path: conflicting[0].path, count: conflicting.length },
      line: conflicting[0].line,
    });
  }

  const wholeSiteBlocks = groups.filter(
    (g) => g.agents.some((a) => a === '*' || a.trim() === '*') && blocksEverything(g),
  );
  for (const group of wholeSiteBlocks) {
    issues.push({
      code: 'robots.block-all',
      status: 'fail',
      params: { agents: group.agents.join(', ') },
      line: group.rules.find((r) => r.type === 'disallow')?.line,
    });
  }

  if (text.trim() === '') {
    issues.push({ code: 'robots.empty', status: 'warn', params: {} });
  }

  const crawlDelays = groups.filter((g) => typeof g.crawlDelay === 'number');
  if (crawlDelays.length > 0) {
    issues.push({
      code: 'robots.crawl-delay',
      status: 'warn',
      params: { value: crawlDelays[0].crawlDelay ?? 0, agents: crawlDelays[0].agents.join(', ') },
    });
  }

  const badSitemaps = globalSitemaps.filter((s) => !isAbsoluteHttpUrl(s));
  if (badSitemaps.length > 0) {
    issues.push({
      code: 'robots.bad-sitemap',
      status: 'warn',
      params: { value: badSitemaps[0], count: badSitemaps.length },
    });
  }

  return {
    raw: text,
    groups: groups.map(({ hasRules: _hasRules, ...rest }) => rest),
    sitemaps: dedupe(globalSitemaps),
    issues,
    lines: lines.length,
    bytes: byteLength(text),
  };
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  // A '#' at the very start always starts a comment; inside a value it also
  // does per the spec, which is why sitemap URLs with fragments are rare.
  if (hash === -1) return line;
  return line.slice(0, hash);
}

export function blocksEverything(group: RobotsGroup): boolean {
  const disallowsAll = group.rules.some((r) => r.type === 'disallow' && r.path === '/');
  if (!disallowsAll) return false;
  // An explicit Allow: / (or a more specific allow) re-opens the site.
  const hasRootAllow = group.rules.some((r) => r.type === 'allow' && r.path === '/');
  return !hasRootAllow;
}

function findDuplicateAgents(groups: RobotsGroup[]): string[] {
  const seen = new Map<string, number>();
  for (const group of groups) {
    for (const agent of group.agents) {
      const key = agent.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([agent]) => agent);
}

function findConflicts(groups: RobotsGroup[]): { agent: string; path: string; line: number }[] {
  const found: { agent: string; path: string; line: number }[] = [];
  for (const group of groups) {
    const allows = new Map(group.rules.filter((r) => r.type === 'allow').map((r) => [r.path, r]));
    for (const rule of group.rules) {
      if (rule.type !== 'disallow') continue;
      const allow = allows.get(rule.path);
      if (allow) {
        found.push({ agent: group.agents.join(', ') || '*', path: rule.path, line: rule.line });
      }
    }
  }
  return found;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}

/** Groups robots rules by the agent they apply to, for the "rules view". */
export function groupsByAgent(doc: RobotsDoc): { agent: string; rules: RobotsRule[]; crawlDelay?: number; sitemaps: string[] }[] {
  return doc.groups.map((group) => ({
    agent: group.agents.join(', '),
    rules: group.rules,
    crawlDelay: group.crawlDelay,
    sitemaps: group.sitemaps,
  }));
}

/** True when the given agent (default `*`) is fully blocked. */
export function isBlockedFor(doc: RobotsDoc, agent = '*'): boolean {
  const relevant = doc.groups.filter((g) => g.agents.some((a) => a.trim().toLowerCase() === agent.toLowerCase()));
  return relevant.some((g) => blocksEverything(g));
}

export const ROBOTS_STATUS_ORDER: Status[] = ['fail', 'warn', 'unverified', 'error', 'pass'];
