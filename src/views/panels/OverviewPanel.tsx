import { Callout, Disclosure, ScoreRing, SectionHeading } from '../../components/primitives';
import { FindingList } from '../../components/FindingCard';
import { IconAlert, IconCheck, IconQuestion, IconTool } from '../../components/Icons';
import { useI18n } from '../../i18n/context';
import { scoreRuleText } from '../../lib/score';
import type { Finding, Report } from '../../lib/types';

export function OverviewPanel({ report }: { report: Report }) {
  const { t, lang, lim } = useI18n();
  const { score } = report;
  const fails = report.findings.filter((finding) => finding.status === 'fail');
  const warns = report.findings.filter((finding) => finding.status === 'warn');
  const unverified = report.findings.filter((finding) => finding.status === 'unverified' || finding.status === 'error');
  const passes = report.findings.filter((finding) => finding.status === 'pass');

  const verdict =
    score.grade === 'N/A'
      ? t('overview.verdict.unknown')
      : score.value >= 90
        ? t('overview.verdict.excellent')
        : score.value >= 75
          ? t('overview.verdict.good')
          : score.value >= 55
            ? t('overview.verdict.fair')
            : t('overview.verdict.poor');

  return (
    <div className="space-y-5">
      <div className="surface-card overflow-hidden">
        <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          <ScoreRing value={score.value} grade={score.grade} size={124} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t('overview.health')}</p>
            <p className="mt-1 text-base font-semibold leading-snug sm:text-lg">{verdict}</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1 sm:justify-start">
              <CountChip status="fail" count={score.fail} />
              <CountChip status="warn" count={score.warn} />
              <CountChip status="unverified" count={score.unverified} />
              <CountChip status="error" count={score.error} />
              <CountChip status="pass" count={score.pass} />
            </div>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <Disclosure summary={t('label.scoreRule')}>
            <p className="text-[12px] leading-relaxed text-muted">{scoreRuleText[lang]}</p>
            <p className="mono mt-1.5 text-[11.5px] text-subtle">
              counted {score.countedWeight} · {t('overview.unverified')} {score.excludedWeight}
            </p>
          </Disclosure>
        </div>
      </div>

      {report.limitationCodes.length > 0 ? (
        <div className="space-y-2">
          <SectionHeading title={t('label.limitations')} />
          {report.limitationCodes.map((code) => {
            const text = lim(code);
            return (
              <div key={code} data-limitation={code}>
                <Callout tone="unv" title={text.title} icon={<IconQuestion className="h-4 w-4" />}>
                  {text.detail}
                </Callout>
              </div>
            );
          })}
        </div>
      ) : null}

      {fails.length > 0 ? (
        <section>
          <SectionHeading title={`${t('overview.severe')} · ${fails.length}`} />
          <FindingList findings={fails} />
        </section>
      ) : null}

      {warns.length > 0 ? (
        <section>
          <SectionHeading title={`${t('overview.warnings')} · ${warns.length}`} />
          <FindingList findings={warns} />
        </section>
      ) : null}

      {unverified.length > 0 ? (
        <section>
          <SectionHeading title={`${t('overview.unverified')} · ${unverified.length}`} />
          <FindingList findings={unverified} />
        </section>
      ) : null}

      {fails.length === 0 && warns.length === 0 && unverified.length === 0 ? (
        <Callout tone="pass" title={t('overview.allClear')} icon={<IconCheck className="h-4 w-4" />} />
      ) : null}

      {passes.length > 0 ? (
        <section>
          <SectionHeading title={`${t('overview.passed')} · ${passes.length}`} />
          <FindingList findings={passes} showAdvice={false} />
        </section>
      ) : null}
    </div>
  );
}

function CountChip({ status, count }: { status: Finding['status']; count: number }) {
  const icons = { fail: IconAlert, warn: IconAlert, unverified: IconQuestion, error: IconTool, pass: IconCheck };
  const Icon = icons[status];
  const tone =
    status === 'fail'
      ? 'text-fail'
      : status === 'warn'
        ? 'text-warn'
        : status === 'pass'
          ? 'text-pass'
          : status === 'error'
            ? 'text-tool'
            : 'text-unv';
  return (
    <span className={`inline-flex items-center gap-1 text-[12.5px] font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="mono tabular-nums">{count}</span>
    </span>
  );
}
