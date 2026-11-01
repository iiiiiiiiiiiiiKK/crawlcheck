/**
 * Report export: JSON (machine readable) and Markdown (human/README friendly).
 */

import { findingText, reasonText, type Lang } from '../i18n';
import { scoreRuleText } from './score';
import { TOOL_VERSION, type Finding, type Report } from './types';

export interface JsonReport {
  tool: string;
  version: string;
  generatedAt: string;
  mode: string;
  target: { input: string; url?: string; host?: string };
  score: Report['score'];
  scoringRule: string;
  counts: { pass: number; warn: number; fail: number; unverified: number; error: number };
  limitations: { code: string; title: string; detail?: string }[];
  findings: {
    id: string;
    category: string;
    code: string;
    status: string;
    weight: number;
    title: string;
    current?: string;
    why?: string;
    fix?: string;
    params: Record<string, string | number>;
    line?: number;
  }[];
  data: {
    robots: { bytes: number; lines: number; groups: number; sitemaps: string[] } | null;
    sitemaps: { source: string; kind: string; count: number; duplicates: number; parseError?: string }[];
    html: {
      title: string | null;
      description: string | null;
      canonical: string | null;
      lang: string | null;
      h1Count: number;
      images: { total: number; missingAlt: number };
      links: { internal: number; external: number };
    } | null;
    resources: { name: string; state: string; httpStatus?: number; message?: string }[];
  };
}

export function toJsonReport(report: Report, lang: Lang): JsonReport {
  return {
    tool: 'CrawlCheck',
    version: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    mode: report.mode,
    target: { input: report.target.input, url: report.target.url, host: report.target.host },
    score: report.score,
    scoringRule: scoreRuleText[lang],
    counts: {
      pass: report.score.pass,
      warn: report.score.warn,
      fail: report.score.fail,
      unverified: report.score.unverified,
      error: report.score.error,
    },
    limitations: report.limitationCodes.map((code) => {
      const text = findingText(lang, { ...emptyFinding, code } as Finding);
      return { code, title: text.title, detail: text.detail };
    }),
    findings: report.findings.map((finding) => {
      const text = findingText(lang, finding);
      return {
        id: finding.id,
        category: finding.category,
        code: finding.code,
        status: finding.status,
        weight: finding.weight,
        title: text.title,
        current: text.detail,
        why: text.why,
        fix: text.fix,
        params: finding.params,
        line: finding.line,
      };
    }),
    data: {
      robots: report.robots
        ? {
            bytes: report.robots.bytes,
            lines: report.robots.lines,
            groups: report.robots.groups.length,
            sitemaps: report.robots.sitemaps,
          }
        : null,
      sitemaps: report.sitemaps.map((sitemap) => ({
        source: sitemap.source,
        kind: sitemap.kind,
        count: sitemap.kind === 'index' ? sitemap.childSitemaps.length : sitemap.entries.length,
        duplicates: sitemap.duplicates.length,
        parseError: sitemap.parseError,
      })),
      html: report.html
        ? {
            title: report.html.title,
            description: report.html.description,
            canonical: report.html.canonical,
            lang: report.html.lang,
            h1Count: report.html.h1.length,
            images: report.html.images,
            links: report.html.links,
          }
        : null,
      resources: [
        { name: 'home', state: report.htmlMeta.state, httpStatus: report.htmlMeta.httpStatus, message: report.htmlMeta.message },
        { name: 'robots.txt', state: report.robotsMeta.state, httpStatus: report.robotsMeta.httpStatus, message: report.robotsMeta.message },
        { name: 'sitemap', state: report.sitemapMeta.state, httpStatus: report.sitemapMeta.httpStatus, message: report.sitemapMeta.message },
      ],
    },
  };
}

const emptyFinding: Finding = {
  id: 'limitation',
  category: 'html',
  code: '',
  status: 'pass',
  params: {},
  weight: 0,
};

const STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  fail: { zh: '错误', en: 'Error' },
  warn: { zh: '警告', en: 'Warning' },
  unverified: { zh: '无法验证', en: 'Unverified' },
  error: { zh: '检查出错', en: 'Tool error' },
  pass: { zh: '正常', en: 'Pass' },
};

export function toMarkdown(report: Report, lang: Lang): string {
  const zh = lang === 'zh';
  const json = toJsonReport(report, lang);
  const lines: string[] = [];
  const target = report.target.url ?? report.target.input;

  lines.push(`# ${zh ? 'CrawlCheck 检查报告' : 'CrawlCheck report'} — ${target}`);
  lines.push('');
  lines.push(`- **${zh ? '检查方式' : 'Mode'}**: ${json.mode}`);
  lines.push(`- **${zh ? '检查时间' : 'Checked at'}**: ${report.createdAt}`);
  lines.push(`- **${zh ? '健康度' : 'Health score'}**: ${report.score.value}/100 (${report.score.grade})`);
  lines.push(
    `- **${zh ? '结果统计' : 'Counts'}**: ${zh ? '错误' : 'errors'} ${report.score.fail} · ${zh ? '警告' : 'warnings'} ${report.score.warn} · ${zh ? '无法验证' : 'unverified'} ${report.score.unverified} · ${zh ? '正常' : 'pass'} ${report.score.pass}`,
  );
  lines.push('');
  if (report.limitationCodes.length > 0) {
    lines.push(`## ${zh ? '本次检查的限制' : 'Limitations'}`);
    lines.push('');
    for (const code of report.limitationCodes) {
      const text = json.limitations.find((item) => item.code === code);
      if (!text) continue;
      lines.push(`- **${text.title}**${text.detail ? `：${text.detail}` : ''}`);
    }
    lines.push('');
  }

  const groups: { status: keyof typeof STATUS_LABEL; items: Finding[] }[] = [
    { status: 'fail', items: report.findings.filter((f) => f.status === 'fail') },
    { status: 'warn', items: report.findings.filter((f) => f.status === 'warn') },
    { status: 'unverified', items: report.findings.filter((f) => f.status === 'unverified' || f.status === 'error') },
    { status: 'pass', items: report.findings.filter((f) => f.status === 'pass') },
  ];

  for (const group of groups) {
    if (group.items.length === 0) continue;
    lines.push(`## ${STATUS_LABEL[group.status][lang]} (${group.items.length})`);
    lines.push('');
    group.items.forEach((finding, index) => {
      const text = findingText(lang, finding);
      lines.push(`### ${index + 1}. ${text.title}`);
      lines.push('');
      if (text.detail) lines.push(`- **${zh ? '当前结果' : 'Current'}**: ${text.detail}`);
      lines.push(`- **${zh ? '分类' : 'Category'}**: ${finding.category}`);
      if (finding.line) lines.push(`- **${zh ? '行号' : 'Line'}**: ${finding.line}`);
      if (text.why) lines.push(`- **${zh ? '为什么重要' : 'Why it matters'}**: ${text.why}`);
      if (text.fix) lines.push(`- **${zh ? '如何修复' : 'How to fix'}**: ${text.fix}`);
      lines.push('');
    });
  }

  lines.push(`## ${zh ? '评分规则' : 'Scoring rule'}`);
  lines.push('');
  lines.push(scoreRuleText[lang]);
  lines.push('');
  lines.push(`> ${zh ? '本报告由 CrawlCheck v' : 'Generated by CrawlCheck v'}${TOOL_VERSION}${zh ? ' 生成。无法验证的项目不计为通过。' : '. Unverified items are never counted as passing.'}`);
  lines.push('');
  return lines.join('\n');
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportFilename(report: Report, extension: string): string {
  const host = (report.target.host ?? 'local').replace(/[^a-z0-9.-]/gi, '-');
  const stamp = report.createdAt.replace(/[:.]/g, '-').slice(0, 19);
  return `crawlcheck-${host}-${stamp}.${extension}`;
}

export { reasonText };
