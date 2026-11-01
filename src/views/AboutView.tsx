import { IconX, IconGlobe, IconLayers, IconCheck } from '../components/Icons';
import { SectionHeading } from '../components/primitives';
import { useI18n } from '../i18n/context';
import { scoreRuleText } from '../lib/score';
import { AUTHOR_HANDLE, AUTHOR_URL, REPO_URL } from '../constants';

export function AboutView() {
  const { t, lang } = useI18n();
  const sections = [
    { title: t('about.what'), body: t('about.what.body'), icon: <IconLayers className="h-4 w-4" /> },
    { title: t('about.not'), body: t('about.not.body'), icon: <IconCheck className="h-4 w-4" /> },
    { title: t('about.privacy'), body: t('about.privacy.body'), icon: <IconGlobe className="h-4 w-4" /> },
    { title: t('about.score'), body: scoreRuleText[lang], icon: <IconCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <SectionHeading title={t('about.title')} hint={t('about.intro')} />

      <div className="space-y-3">
        {sections.map((section) => (
          <section key={section.title} className="surface-card px-4 py-3.5">
            <div className="flex items-center gap-2 text-fg">
              <span className="text-muted">{section.icon}</span>
              <h2 className="text-[13.5px] font-semibold">{section.title}</h2>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="surface-card mt-3 px-4 py-3.5">
        <h2 className="text-[13.5px] font-semibold">{t('about.author')}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost !min-h-9 !px-2.5 text-[12.5px]"
          >
            <IconX className="h-3.5 w-3.5" />
            {AUTHOR_HANDLE}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost !min-h-9 !px-2.5 text-[12.5px]"
          >
            {t('footer.source')} · GitHub
          </a>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{t('about.tech')}: React 19 · TypeScript · Vite · Tailwind CSS · Vitest · Playwright · Cloudflare Workers</p>
      </div>

      <p className="mt-4 text-center text-[11px] text-subtle">{t('footer.made')}</p>
    </div>
  );
}
