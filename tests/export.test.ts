import { describe, expect, it } from 'vitest';
import { reportFilename, toJsonReport, toMarkdown } from '../src/lib/export';
import { buildDemoReport } from '../src/lib/demo';
import { findingText } from '../src/i18n';

const report = buildDemoReport();

describe('toJsonReport', () => {
  const json = toJsonReport(report, 'en');

  it('contains the metadata a machine consumer needs', () => {
    expect(json.tool).toBe('CrawlCheck');
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(json.target.url).toBe('https://demo.crawlcheck.dev/');
    expect(json.scoringRule.length).toBeGreaterThan(20);
    expect(json.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('mirrors the report counts', () => {
    expect(json.counts.fail).toBe(report.score.fail);
    expect(json.counts.pass).toBe(report.score.pass);
    expect(json.findings).toHaveLength(report.findings.length);
    expect(json.findings.filter((finding) => finding.status === 'fail')).toHaveLength(report.score.fail);
  });

  it('translates every finding', () => {
    for (const finding of json.findings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.title).not.toBe(finding.code);
    }
  });

  it('summarises the raw data sections', () => {
    expect(json.data.robots?.groups).toBeGreaterThan(0);
    expect(json.data.sitemaps.length).toBe(2);
    expect(json.data.html?.h1Count).toBe(2);
    expect(json.data.resources).toHaveLength(3);
  });
});

describe('toMarkdown', () => {
  const markdown = toMarkdown(report, 'zh');

  it('has a heading, score and grouped findings', () => {
    expect(markdown).toContain('# CrawlCheck 检查报告');
    expect(markdown).toContain(`${report.score.value}/100`);
    expect(markdown).toContain('## 本次检查的限制');
    expect(markdown).toContain('## 评分规则');
    expect(markdown).toContain('## 错误');
  });

  it('includes why and how-to-fix for problems', () => {
    const failing = report.findings.find((finding) => finding.status === 'fail');
    expect(failing).toBeDefined();
    if (failing) {
      const text = findingText('zh', failing);
      expect(markdown).toContain(text.title);
      if (text.why) expect(markdown).toContain('为什么重要');
    }
  });

  it('is also produced in English', () => {
    const english = toMarkdown(report, 'en');
    expect(english).toContain('# CrawlCheck report');
    expect(english).toContain('Scoring rule');
  });
});

describe('reportFilename', () => {
  it('builds a safe, unique filename', () => {
    const name = reportFilename(report, 'json');
    expect(name).toMatch(/^crawlcheck-demo\.crawlcheck\.dev-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });

  it('falls back to "local" without a host', () => {
    const local = reportFilename({ ...report, target: { input: 'files' } }, 'md');
    expect(local).toContain('crawlcheck-local');
  });
});
