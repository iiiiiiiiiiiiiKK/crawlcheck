import { describe, expect, it } from 'vitest';
import { blocksEverything, groupsByAgent, isBlockedFor, parseRobots } from '../src/lib/robots';

const BASIC = `# sample
User-agent: Googlebot
Disallow: /private
Allow: /private/public
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml

User-agent: *
Disallow: /tmp
`;

describe('parseRobots', () => {
  it('parses groups, rules, crawl-delay and sitemaps', () => {
    const doc = parseRobots(BASIC);
    expect(doc.groups).toHaveLength(2);
    expect(doc.groups[0].agents).toEqual(['Googlebot']);
    expect(doc.groups[0].rules).toEqual([
      { type: 'disallow', path: '/private', line: 3 },
      { type: 'allow', path: '/private/public', line: 4 },
    ]);
    expect(doc.groups[0].crawlDelay).toBe(2);
    expect(doc.groups[0].sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(doc.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(doc.groups[1].agents).toEqual(['*']);
    expect(doc.groups[1].rules[0].path).toBe('/tmp');
  });

  it('keeps several user-agents that share one group', () => {
    const doc = parseRobots('User-agent: A\nUser-agent: B\nDisallow: /x\n');
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].agents).toEqual(['A', 'B']);
    expect(groupsByAgent(doc)[0].agent).toBe('A, B');
  });

  it('strips comments, BOM, CRLF and inline comments', () => {
    const doc = parseRobots('\uFEFFUser-agent: *\r\n# a comment\r\nDisallow: /admin # inline\r\n');
    expect(doc.groups[0].rules[0].path).toBe('/admin');
    expect(doc.issues.some((issue) => issue.code === 'robots.format-error')).toBe(false);
  });

  it('detects a whole-site block and respects an explicit Allow: /', () => {
    const blocked = parseRobots('User-agent: *\nDisallow: /\n');
    expect(blocksEverything(blocked.groups[0])).toBe(true);
    expect(isBlockedFor(blocked)).toBe(true);
    const blockIssue = blocked.issues.find((issue) => issue.code === 'robots.block-all');
    expect(blockIssue?.status).toBe('fail');

    const reOpened = parseRobots('User-agent: *\nDisallow: /\nAllow: /\n');
    expect(blocksEverything(reOpened.groups[0])).toBe(false);
    expect(reOpened.issues.some((issue) => issue.code === 'robots.block-all')).toBe(false);
  });

  it('does not treat an unrelated disallow as a block', () => {
    const doc = parseRobots('User-agent: *\nDisallow: /admin\n');
    expect(isBlockedFor(doc)).toBe(false);
  });

  it('reports lines without a colon as format errors', () => {
    const doc = parseRobots('User-agent *\nDisallow: /x\nUser-agent *\n');
    const issue = doc.issues.find((item) => item.code === 'robots.format-error');
    expect(issue?.params.count).toBe(2);
    expect(issue?.line).toBe(1);
  });

  it('reports rules that appear before any User-agent', () => {
    const doc = parseRobots('Disallow: /x\nUser-agent: *\n');
    const issue = doc.issues.find((item) => item.code === 'robots.orphan-rule');
    expect(issue?.params.count).toBe(1);
    expect(issue?.line).toBe(1);
  });

  it('flags non-standard directives and invalid crawl-delay values', () => {
    const doc = parseRobots('User-agent: *\nHost: example.com\nRequest-rate: 1/5\nCrawl-delay: fast\n');
    const unknown = doc.issues.find((item) => item.code === 'robots.unknown-directive');
    expect(String(unknown?.params.names)).toContain('host');
    expect(doc.issues.some((item) => item.code === 'robots.bad-crawl-delay')).toBe(true);
  });

  it('flags duplicated user-agent groups', () => {
    const doc = parseRobots('User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\n');
    const issue = doc.issues.find((item) => item.code === 'robots.duplicate-group');
    expect(issue).toBeDefined();
    expect(doc.groups).toHaveLength(2);
  });

  it('flags the same path being allowed and disallowed', () => {
    const doc = parseRobots('User-agent: *\nDisallow: /p\nAllow: /p\n');
    const issue = doc.issues.find((item) => item.code === 'robots.conflict');
    expect(issue?.params.path).toBe('/p');
    expect(issue?.params.count).toBe(1);
  });

  it('flags relative sitemap directives', () => {
    const doc = parseRobots('User-agent: *\nDisallow: /a\nSitemap: /sitemap.xml\n');
    expect(doc.sitemaps).toEqual(['/sitemap.xml']);
    expect(doc.issues.some((item) => item.code === 'robots.bad-sitemap')).toBe(true);
  });

  it('reports empty values and empty documents', () => {
    expect(parseRobots('').issues.some((item) => item.code === 'robots.empty')).toBe(true);
    expect(parseRobots('User-agent:\n').issues.some((item) => item.code === 'robots.empty-user-agent')).toBe(true);
  });

  it('never throws on hostile input', () => {
    const inputs = [':::::', '\u0000\u0001', 'User-agent: *\n'.repeat(500), 'Disallow'.repeat(10)];
    for (const input of inputs) {
      expect(() => parseRobots(input)).not.toThrow();
    }
  });

  it('counts bytes and lines', () => {
    const doc = parseRobots(BASIC);
    expect(doc.lines).toBeGreaterThan(5);
    expect(doc.bytes).toBe(new TextEncoder().encode(BASIC).length);
  });
});
