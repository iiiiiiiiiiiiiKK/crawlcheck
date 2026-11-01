/**
 * Health score.
 *
 * The rule is deliberately boring and fully published in the UI:
 *
 *   score = round(100 * earned / counted)
 *
 *   earned  = Σ weight(pass) + 0.5 × Σ weight(warn)
 *   counted = Σ weight(pass | warn | fail)
 *
 * Findings that are `unverified` (we could not look) or `error` (our tool broke)
 * are removed from **both** sides of the fraction. They can never raise the score
 * and they can never lower it — they are reported separately instead.
 */

import type { Finding, ScoreBreakdown, Status } from './types';

export interface ScoreOptions {
  /** Half credit for warnings. Set to 0 for a harsher "only clean passes count" mode. */
  warnCredit?: number;
}

export function computeScore(findings: Finding[], options: ScoreOptions = {}): ScoreBreakdown {
  const warnCredit = options.warnCredit ?? 0.5;
  const breakdown: ScoreBreakdown = {
    value: 0,
    grade: 'N/A',
    pass: 0,
    warn: 0,
    fail: 0,
    unverified: 0,
    error: 0,
    countedWeight: 0,
    excludedWeight: 0,
  };

  let earned = 0;
  for (const finding of findings) {
    breakdown[finding.status] += 1;
    if (finding.weight <= 0) continue;
    switch (finding.status) {
      case 'pass':
        earned += finding.weight;
        breakdown.countedWeight += finding.weight;
        break;
      case 'warn':
        earned += finding.weight * warnCredit;
        breakdown.countedWeight += finding.weight;
        break;
      case 'fail':
        breakdown.countedWeight += finding.weight;
        break;
      case 'unverified':
      case 'error':
        breakdown.excludedWeight += finding.weight;
        break;
    }
  }

  if (breakdown.countedWeight === 0) {
    return { ...breakdown, value: 0, grade: 'N/A' };
  }

  // Honesty rule: if at least as much weight could not be checked as could be
  // checked, a number would be meaningless — report "no score" instead.
  if (breakdown.excludedWeight >= breakdown.countedWeight) {
    return { ...breakdown, value: 0, grade: 'N/A' };
  }

  const value = Math.max(0, Math.min(100, Math.round((earned / breakdown.countedWeight) * 100)));
  return { ...breakdown, value, grade: gradeFor(value) };
}

export function gradeFor(value: number): string {
  if (value >= 90) return 'A';
  if (value >= 80) return 'B';
  if (value >= 70) return 'C';
  if (value >= 60) return 'D';
  if (value >= 40) return 'E';
  return 'F';
}

export const scoreRuleText = {
  zh: '得分 = 100 × (通过项权重 + 0.5 × 警告项权重) ÷ (通过 + 警告 + 失败 项权重)。无法验证与服务自身错误既不加分也不扣分，单独列出；当无法验证的权重不少于可评分权重时，不给出总分（显示为 —）。等级：90+ A、80+ B、70+ C、60+ D、40+ E、其余 F。',
  en: 'Score = 100 × (weight of passes + 0.5 × weight of warnings) ÷ (weight of pass + warn + fail). Unverifiable items and tool errors are excluded from both sides and listed separately; when unverifiable weight is at least the scorable weight, no total is shown (—). Grades: 90+ A, 80+ B, 70+ C, 60+ D, 40+ E, otherwise F.',
};

export function countByStatus(findings: Finding[]): Record<Status, number> {
  const counts: Record<Status, number> = { pass: 0, warn: 0, fail: 0, unverified: 0, error: 0 };
  for (const finding of findings) counts[finding.status] += 1;
  return counts;
}

/** Problems ordered by severity, used by the overview and by exports. */
export function sortBySeverity(findings: Finding[]): Finding[] {
  const order: Record<Status, number> = { fail: 0, warn: 1, error: 2, unverified: 3, pass: 4 };
  return [...findings].sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);
}
