import { describe, expect, it } from 'vitest';
import { parseSitemap, sitemapCandidates, sitemapUrlCount } from '../src/lib/sitemap';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://a.test/1</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://a.test/2</loc></url>
  <url><loc>https://a.test/1</loc></url>
  <url><loc></loc></url>
  <url><loc>relative/path</loc></url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://a.test/s1.xml</loc><lastmod>2026-02-02</lastmod></sitemap>
  <sitemap><loc>/s2.xml</loc></sitemap>
</sitemapindex>`;

describe('parseSitemap', () => {
  it('parses a urlset with locations, lastmod, duplicates and bad entries', () => {
    const doc = parseSitemap(URLSET, 'https://a.test/sitemap.xml');
    expect(doc.kind).toBe('urlset');
    expect(doc.parseError).toBeUndefined();
    expect(doc.entries).toHaveLength(5);
    expect(doc.entries[0]).toMatchObject({ loc: 'https://a.test/1', lastmod: '2026-01-01', valid: true });
    expect(doc.entries[1].valid).toBe(true);
    expect(doc.duplicates).toEqual(['https://a.test/1']);
    expect(doc.emptyLoc).toBe(1);
    const invalid = doc.entries.filter((entry) => !entry.valid);
    expect(invalid).toHaveLength(2);
    expect(sitemapUrlCount(doc)).toBe(5);
  });

  it('parses a sitemap index and its child entries', () => {
    const doc = parseSitemap(INDEX, 'https://a.test/sitemap_index.xml');
    expect(doc.kind).toBe('index');
    expect(doc.childSitemaps).toHaveLength(2);
    expect(doc.childSitemaps[0]).toMatchObject({ loc: 'https://a.test/s1.xml', valid: true, lastmod: '2026-02-02' });
    expect(doc.childSitemaps[1].valid).toBe(false);
    expect(sitemapUrlCount(doc)).toBe(2);
  });

  it('works without a namespace declaration', () => {
    const doc = parseSitemap('<urlset><url><loc>https://a.test/x</loc></url></urlset>', 'inline');
    expect(doc.kind).toBe('urlset');
    expect(doc.entries[0].loc).toBe('https://a.test/x');
  });

  it('reports broken XML instead of throwing', () => {
    const doc = parseSitemap('<urlset><url><loc>https://a.test/</url></urlset>', 'https://a.test/sitemap.xml');
    expect(doc.parseError).toBe('xml');
    expect(doc.entries).toHaveLength(0);
  });

  it('rejects a wrong root element', () => {
    expect(parseSitemap('<html><body/></html>', 'x').parseError).toBe('root:html');
  });

  it('reports an empty document', () => {
    expect(parseSitemap('   ', 'x').parseError).toBe('empty');
  });

  it('handles CDATA and extra whitespace', () => {
    const xml = `<urlset><url><loc>
      https://a.test/cdata
    </loc></url></urlset>`;
    expect(parseSitemap(xml, 'x').entries[0].loc).toBe('https://a.test/cdata');
  });
});

describe('sitemapCandidates', () => {
  it('puts declared sitemaps first and always includes the default path', () => {
    const candidates = sitemapCandidates(['https://a.test/sm.xml'], 'https://a.test');
    expect(candidates).toEqual(['https://a.test/sm.xml', 'https://a.test/sitemap.xml']);
  });

  it('de-duplicates and caps the list', () => {
    const candidates = sitemapCandidates(
      ['https://a.test/sitemap.xml', 'https://a.test/sitemap.xml', 'https://a.test/1.xml', 'https://a.test/2.xml', 'https://a.test/3.xml'],
      'https://a.test',
    );
    expect(candidates.length).toBeLessThanOrEqual(4);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
