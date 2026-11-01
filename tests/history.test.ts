import { beforeEach, describe, expect, it } from 'vitest';
import { clearHistory, deleteEntry, listHistory, saveReport, storageKind } from '../src/lib/history';
import { buildDemoReport } from '../src/lib/demo';
import { runLocalCheck } from '../src/lib/localScan';

function localReport(host: string) {
  return runLocalCheck({
    robotsText: 'User-agent: *\nDisallow: /admin\n',
    htmlText: '<!doctype html><html lang="en"><head><title>Hello world page</title></head><body><h1>Hi</h1></body></html>',
    fileNames: [host],
  });
}

describe('history storage (localStorage fallback in jsdom)', () => {
  beforeEach(async () => {
    await clearHistory();
  });

  it('falls back to localStorage when IndexedDB is unavailable', () => {
    expect(storageKind()).toBe('localstorage');
  });

  it('saves and lists reports newest first', async () => {
    const first = localReport('first-report');
    const second = localReport('second-report');
    expect(await saveReport(first)).toBe(true);
    expect(await saveReport(second)).toBe(true);

    const entries = await listHistory();
    expect(entries).toHaveLength(2);
    expect(entries[0].createdAt >= entries[1].createdAt).toBe(true);
    expect(entries.some((entry) => entry.id === first.id)).toBe(true);
  });

  it('never stores demo reports', async () => {
    expect(await saveReport(buildDemoReport())).toBe(false);
    expect(await listHistory()).toHaveLength(0);
  });

  it('deletes one entry and clears everything', async () => {
    const report = localReport('delete-me');
    await saveReport(report);
    expect(await listHistory()).toHaveLength(1);

    await deleteEntry(report.id);
    expect(await listHistory()).toHaveLength(0);

    await saveReport(localReport('a'));
    await saveReport(localReport('b'));
    await clearHistory();
    expect(await listHistory()).toHaveLength(0);
  });

  it('keeps a compact but complete report inside the entry', async () => {
    const report = localReport('shape');
    await saveReport(report);
    const [entry] = await listHistory();
    expect(entry.report.findings.length).toBe(report.findings.length);
    expect(entry.score).toBe(report.score.value);
    expect(entry.grade).toBe(report.score.grade);
    expect(entry.fail).toBe(report.score.fail);
  });

  it('survives corrupted storage', async () => {
    localStorage.setItem('crawlcheck.history.v1', 'not json');
    expect(await listHistory()).toEqual([]);
  });
});
