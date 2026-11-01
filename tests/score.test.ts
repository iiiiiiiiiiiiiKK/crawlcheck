import { describe, expect, it } from 'vitest';
import { computeScore, countByStatus, gradeFor, sortBySeverity } from '../src/lib/score';
import type { Finding, Status } from '../src/lib/types';

function finding(status: Status, weight: number, code = 'test'): Finding {
  return { id: `${code}-${status}-${weight}`, category: 'seo', code, status, params: {}, weight };
}

describe('computeScore', () => {
  it('gives 100 when every weighted check passes', () => {
    const score = computeScore([finding('pass', 4), finding('pass', 2)]);
    expect(score.value).toBe(100);
    expect(score.grade).toBe('A');
    expect(score.countedWeight).toBe(6);
  });

  it('counts warnings at half credit', () => {
    const score = computeScore([finding('pass', 4), finding('warn', 4)]);
    expect(score.value).toBe(75);
    expect(score.grade).toBe('C');
  });

  it('scores zero when everything fails', () => {
    expect(computeScore([finding('fail', 5)]).value).toBe(0);
  });

  it('excludes unverified and tool errors from both sides of the fraction', () => {
    const score = computeScore([finding('pass', 4), finding('unverified', 1), finding('error', 1)]);
    expect(score.value).toBe(100);
    expect(score.countedWeight).toBe(4);
    expect(score.excludedWeight).toBe(2);
    expect(score.unverified).toBe(1);
    expect(score.error).toBe(1);
  });

  it('ignores informational findings (weight 0)', () => {
    const score = computeScore([finding('pass', 2), finding('fail', 0), finding('warn', 0)]);
    expect(score.value).toBe(100);
    expect(score.countedWeight).toBe(2);
  });

  it('returns N/A when nothing could be scored', () => {
    const score = computeScore([finding('unverified', 5)]);
    expect(score.grade).toBe('N/A');
    expect(score.value).toBe(0);
    expect(score.countedWeight).toBe(0);
  });

  it('refuses to give a number when unverifiable weight reaches the scorable weight', () => {
    const score = computeScore([finding('pass', 2), finding('unverified', 2)]);
    expect(score.grade).toBe('N/A');
    expect(score.countedWeight).toBe(2);
    expect(score.excludedWeight).toBe(2);

    const stillScored = computeScore([finding('pass', 8), finding('unverified', 2)]);
    expect(stillScored.grade).toBe('A');
    expect(stillScored.value).toBe(100);
  });
});

describe('gradeFor', () => {
  it('maps values to the published thresholds', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89)).toBe('B');
    expect(gradeFor(79)).toBe('C');
    expect(gradeFor(69)).toBe('D');
    expect(gradeFor(59)).toBe('E');
    expect(gradeFor(10)).toBe('F');
  });
});

describe('countByStatus / sortBySeverity', () => {
  it('counts each status', () => {
    const counts = countByStatus([finding('pass', 1), finding('fail', 1), finding('fail', 1), finding('warn', 1)]);
    expect(counts).toEqual({ pass: 1, warn: 1, fail: 2, unverified: 0, error: 0 });
  });

  it('orders problems before passes, heaviest first', () => {
    const ordered = sortBySeverity([finding('pass', 1), finding('warn', 1), finding('fail', 1), finding('fail', 9)]);
    expect(ordered[0].weight).toBe(9);
    expect(ordered[ordered.length - 1].status).toBe('pass');
  });
});
