/**
 * Finding catalogue: human text for every machine code the analyser can emit.
 * Pass-type findings only need a title; problems always carry "why" and "fix".
 */

export type Msg = { zh: string; en: string };

export interface FindingMsg {
  title: Msg;
  detail?: Msg;
  why?: Msg;
  fix?: Msg;
}

const b = (zh: string, en: string): Msg => ({ zh, en });

export const FINDING_MESSAGES: Record<string, FindingMsg> = {
  /* ------------------------------------------------------------------ url */
  'url.valid': {
    title: b('URL 格式', 'URL format'),
    detail: b('{url}', '{url}'),
  },
  'url.https': {
    title: b('协议', 'Protocol'),
    detail: b('使用 HTTPS', 'HTTPS is used'),
  },
  'url.http': {
    title: b('协议', 'Protocol'),
    detail: b('当前使用 HTTP：{origin}', 'Site is served over plain HTTP: {origin}'),
    why: b(
      '搜索引擎与浏览器都会把 HTTP 视为不安全，HTTPS 是排名与信任的基础信号，也是 HSTS、HTTP/2 等能力的前提。',
      'Search engines and browsers treat plain HTTP as insecure. HTTPS is a baseline trust and ranking signal and a prerequisite for HTTP/2 and HSTS.',
    ),
    fix: b(
      '为域名申请证书并全站启用 HTTPS，然后用 301 把 HTTP 永久跳转到 HTTPS，并确保 canonical、sitemap、内链都使用 https:// 开头。',
      'Enable HTTPS for the domain, then permanently (301) redirect HTTP to HTTPS and make sure canonical URLs, the sitemap and internal links all use https://.',
    ),
  },
  'url.reachable': {
    title: b('首页可访问', 'Home page reachable'),
    detail: b('HTTP {status}', 'HTTP {status}'),
  },
  'url.home-status': {
    title: b('首页状态码异常', 'Home page returned an unexpected status'),
    detail: b('HTTP {status}', 'HTTP {status}'),
    why: b(
      '爬虫依赖状态码判断页面是否存在。4xx 表示页面不存在，5xx 表示服务端故障，反复返回 5xx 会让抓取频率下降。',
      'Crawlers rely on the status code to decide whether a page exists. 4xx means "gone", 5xx means "server failure", and repeated 5xx responses reduce crawl rate.',
    ),
    fix: b(
      '先确认该状态码是预期行为（如维护页）还是故障；故障请查看服务端日志与反向代理配置，确认首页稳定返回 200。',
      'Confirm whether the status is intentional (e.g. a maintenance page) or a fault. For faults, check server and reverse-proxy logs until the home page reliably returns 200.',
    ),
  },
  'url.unverified': {
    title: b('首页无法验证', 'Home page could not be verified'),
    detail: b('原因：{reason}', 'Reason: {reason}'),
    why: b(
      '工具没有拿到首页内容，因此下面的页面级检查都没有依据，不能算作通过。',
      'The tool did not receive the page, so the page-level checks below have no evidence and must not be counted as passing.',
    ),
    fix: b(
      '如果是浏览器跨域（CORS）限制，请配置一个检查服务地址，或改用本地文件模式粘贴页面源码。',
      'If this is a browser CORS restriction, configure a scan service endpoint or paste the page source in local file mode.',
    ),
  },
  'url.redirected': {
    title: b('首页发生跳转', 'Home page redirects'),
    detail: b('{from} → {to}', '{from} → {to}'),
    why: b(
      '入口地址跳转到另一个地址会分散链接信号，也会让 sitemap、canonical 与实际地址不一致。',
      'An entry URL that redirects to another address splits link signals and can desynchronise the sitemap and canonical from the real URL.',
    ),
    fix: b(
      '统一站点的规范入口：让 sitemap、canonical、内链都直接指向最终地址，避免链式跳转。',
      'Pick one canonical entry point and point the sitemap, canonical tags and internal links straight at the final URL.',
    ),
  },
  'url.content-type': {
    title: b('Content-Type 不是 HTML', 'Content-Type is not HTML'),
    detail: b('{value}', '{value}'),
    why: b(
      '首页返回非 HTML 内容时，搜索引擎无法解析标题、描述等页面信息。',
      'When the home page is not HTML, search engines cannot parse the title, description or other page-level signals.',
    ),
    fix: b('确认首页返回 text/html 且字符集声明正确。', 'Make sure the home page is served as text/html with a correct charset declaration.'),
  },

  /* --------------------------------------------------------------- robots */
  'robots.found': {
    title: b('robots.txt 可访问', 'robots.txt is reachable'),
    detail: b('{bytes} 字节 / {lines} 行 / {groups} 组规则 / {agents} 个 User-agent', '{bytes} bytes / {lines} lines / {groups} groups / {agents} user-agents'),
  },
  'robots.missing': {
    title: b('未找到 robots.txt', 'robots.txt not found'),
    detail: b('HTTP {status}', 'HTTP {status}'),
    why: b(
      '没有 robots.txt 时爬虫默认可以抓取全站，这通常不会致命，但你也就失去了声明 sitemap 与限制无关路径的入口。',
      'Without robots.txt crawlers may fetch everything by default. That is rarely fatal, but you lose the place where you declare sitemaps and limit irrelevant paths.',
    ),
    fix: b(
      '在站点根目录添加 robots.txt，至少声明 Sitemap: 地址，并按需 Disallow 后台、搜索结果页等无价值路径。',
      'Add robots.txt at the site root with at least a Sitemap: line, and Disallow low-value paths such as admin areas or internal search pages.',
    ),
  },
  'robots.unverified': {
    title: b('robots.txt 无法验证', 'robots.txt could not be verified'),
    detail: b('原因：{reason}', 'Reason: {reason}'),
    why: b('我们没能读取 robots.txt，因此不能判断它是否存在或是否禁止抓取。', 'We could not read robots.txt, so we cannot tell whether it exists or blocks crawling.'),
    fix: b(
      '请在浏览器直接打开 /robots.txt 确认可访问，或使用本地文件模式粘贴内容进行检查。',
      'Open /robots.txt directly in a browser to confirm it loads, or paste its content in local file mode.',
    ),
  },
  'robots.security-note': {
    title: b('提示：robots.txt 不是访问控制', 'Note: robots.txt is not access control'),
    detail: b(
      'Disallow 只是抓取约定，任何客户端都可以忽略它读取被禁止的地址。',
      'Disallow is only a crawling convention; any client may ignore it and read the path anyway.',
    ),
    why: b(
      '很多人误以为把敏感目录写进 Disallow 就安全了，实际上这反而会把这些路径公开列出来。',
      'A common mistake is believing a Disallow line protects a sensitive directory; in practice it advertises the path.',
    ),
    fix: b(
      '真正的保护要靠登录鉴权、权限校验或服务端拒绝访问，敏感文件不要放在公开目录。',
      'Real protection comes from authentication, authorisation or server-side access denial; never leave sensitive files in a public directory.',
    ),
  },
  'robots.sitemap-declared': {
    title: b('已声明 Sitemap', 'Sitemap declared'),
    detail: b('{value}（共 {count} 条）', '{value} (total {count})'),
  },
  'robots.block-all': {
    title: b('规则禁止抓取整站', 'Rules block the entire site'),
    detail: b('User-agent: {agents} 下的 Disallow: / 禁止抓取全站', 'Disallow: / under User-agent: {agents} blocks the whole site'),
    why: b(
      '这条规则会让对应爬虫放弃抓取站点几乎所有页面，站点可能因此从搜索结果中消失。',
      'This rule makes the matching crawler skip almost every page, and the site can disappear from search results.',
    ),
    fix: b(
      '如果只想屏蔽部分路径，请把 Disallow: / 改成具体目录；如果确实需要临时全站禁止，请确认这是预期状态并在上线前移除。',
      'If you only meant to block a few paths, replace Disallow: / with those directories. If a full block is intentional and temporary, remember to remove it before launch.',
    ),
  },
  'robots.format-error': {
    title: b('存在无法解析的行', 'Unparsable lines found'),
    detail: b('第 {line} 行等共 {count} 行，例如：{first}', '{count} line(s), first at line {line}: {first}'),
    why: b(
      'robots.txt 每行必须是“指令: 值”格式。格式错误的行会被爬虫忽略，导致规则与预期不符。',
      'Each robots.txt line must be "directive: value". Malformed lines are ignored by crawlers, so your intent silently changes.',
    ),
    fix: b('按行修正，例如把 “User-agent *” 改成 “User-agent: *”，删除多余字符与行内注释。', 'Fix them line by line, e.g. change "User-agent *" to "User-agent: *" and remove stray characters.'),
  },
  'robots.orphan-rule': {
    title: b('规则缺少对应的 User-agent', 'Rules without a User-agent'),
    detail: b('第 {line} 行等共 {count} 处', '{count} rule(s), first at line {line}'),
    why: b(
      'Allow / Disallow 必须写在 User-agent 之后，否则不生效，这会让“禁止抓取”的意图失效。',
      'Allow/Disallow must follow a User-agent line, otherwise they are ignored — which silently disables the restriction you intended.',
    ),
    fix: b('在第一条规则前补充 User-agent: *（或具体爬虫名）。', 'Add "User-agent: *" (or the specific crawler name) before the first rule.'),
  },
  'robots.unknown-directive': {
    title: b('包含非标准指令', 'Non-standard directives present'),
    detail: b('{names}（共 {count} 类）', '{names} (total {count})'),
    why: b(
      'Host、Request-rate、Noindex 等指令不属于 robots.txt 标准，主流搜索引擎不会按你的预期执行。',
      'Directives such as Host, Request-rate or Noindex are not part of the robots.txt standard and are not honoured the way most people expect.',
    ),
    fix: b(
      'Noindex 请用 meta robots 或 X-Robots-Tag 实现；Host 已废弃，用 canonical 或 301 表达首选域名。',
      'Implement noindex with a meta robots tag or the X-Robots-Tag header. Host is obsolete; express your preferred host with canonical or a 301.',
    ),
  },
  'robots.duplicate-group': {
    title: b('同一 User-agent 出现多组规则', 'The same User-agent appears in multiple groups'),
    detail: b('{agents}', '{agents}'),
    why: b(
      '按规范，同一爬虫的多组规则会被合并或按实现差异处理，容易出现难排查的意外屏蔽。',
      'Per the spec, groups for the same crawler are merged (or handled differently by each implementation), which produces confusing accidental blocks.',
    ),
    fix: b('把同一 User-agent 的规则合并成一个连续的组。', 'Merge the rules for one user-agent into a single contiguous group.'),
  },
  'robots.conflict': {
    title: b('同一路径同时 Allow 与 Disallow', 'Same path both allowed and disallowed'),
    detail: b('{agent}：{path}（共 {count} 处）', '{agent}: {path} (total {count})'),
    why: b(
      '两条规则互相冲突，最终结果取决于爬虫对最长匹配规则的实现，行为不可预测。',
      'Conflicting rules make the outcome depend on each crawler\'s longest-match implementation; behaviour becomes unpredictable.',
    ),
    fix: b('删除多余的一条，只保留你真正想要的那条规则。', 'Delete one of the two and keep only the rule you actually want.'),
  },
  'robots.empty': {
    title: b('robots.txt 为空', 'robots.txt is empty'),
    detail: b('没有任何有效指令', 'No effective directives'),
    why: b('空文件等价于“不限制抓取”，同时也无法声明 sitemap。', 'An empty file means "no restrictions" and gives you nowhere to declare the sitemap.'),
    fix: b('至少添加 User-agent: * 与 Sitemap: 声明。', 'Add at least "User-agent: *" and a Sitemap: line.'),
  },
  'robots.crawl-delay': {
    title: b('使用了 Crawl-delay', 'Crawl-delay is used'),
    detail: b('{agents} 设置为 {value} 秒', '{agents} set to {value}s'),
    why: b(
      'Crawl-delay 不属于 robots.txt 标准，Google 明确不支持；它只对部分爬虫有效。',
      'Crawl-delay is not part of the robots.txt standard and Google explicitly ignores it; only some crawlers honour it.',
    ),
    fix: b(
      '优先通过 Google Search Console / Bing Webmaster Tools 的抓取速率设置控制频率，或优化服务端响应时间。',
      'Control crawl rate through Google Search Console or Bing Webmaster Tools, or improve server response time.',
    ),
  },
  'robots.bad-sitemap': {
    title: b('Sitemap 地址格式不正确', 'Sitemap directive is malformed'),
    detail: b('{value}（共 {count} 个）', '{value} (total {count})'),
    why: b('Sitemap 必须写完整绝对地址，例如 https://example.com/sitemap.xml。', 'Sitemap must be an absolute URL such as https://example.com/sitemap.xml.'),
    fix: b('补全协议与域名，确保地址可直接访问。', 'Add the protocol and host so the URL is directly fetchable.'),
  },
  'robots.empty-user-agent': {
    title: b('User-agent 为空', 'Empty User-agent'),
    detail: b('第 {line} 行', 'Line {line}'),
    why: b('没有名称的 User-agent 行无效，后续规则会失去归属。', 'A User-agent line without a name is invalid and the following rules lose their owner.'),
    fix: b('填入 * 或具体爬虫名。', 'Fill in * or a specific crawler name.'),
  },
  'robots.bad-crawl-delay': {
    title: b('Crawl-delay 值无效', 'Invalid Crawl-delay value'),
    detail: b('{value}', '{value}'),
    why: b('取值必须是秒数，无效值会被忽略。', 'The value must be a number of seconds; invalid values are ignored.'),
    fix: b('改成非负数字，例如 Crawl-delay: 5。', 'Use a non-negative number, e.g. Crawl-delay: 5.'),
  },

  /* -------------------------------------------------------------- sitemap */
  'sitemap.found': {
    title: b('Sitemap 可访问', 'Sitemap is reachable'),
    detail: b('{source}：{kind}，{bytes} 字节', '{source}: {kind}, {bytes} bytes'),
  },
  'sitemap.missing': {
    title: b('未找到 sitemap', 'No sitemap found'),
    detail: b('HTTP {status}', 'HTTP {status}'),
    why: b(
      'Sitemap 能帮助搜索引擎更快发现新页面与更新页面，缺少它会降低收录效率。',
      'A sitemap helps search engines discover new and updated URLs faster; without one, indexing is slower and less complete.',
    ),
    fix: b(
      '生成 sitemap.xml 并放到站点根目录，同时在 robots.txt 中声明 Sitemap 地址。',
      'Generate sitemap.xml at the site root and declare it in robots.txt.',
    ),
  },
  'sitemap.unverified': {
    title: b('Sitemap 无法验证', 'Sitemap could not be verified'),
    detail: b('原因：{reason}', 'Reason: {reason}'),
    why: b('我们没能读取 sitemap，因此不能判断其存在性与有效性。', 'We could not read the sitemap, so its existence and validity are unknown.'),
    fix: b('直接在浏览器打开 sitemap 地址确认可访问，或用本地文件模式粘贴 XML。', 'Open the sitemap URL in a browser, or paste the XML in local file mode.'),
  },
  'sitemap.invalid-xml': {
    title: b('Sitemap XML 无效', 'Sitemap XML is invalid'),
    detail: b('{source}：{error}', '{source}: {error}'),
    why: b(
      'XMl 无法解析时整份 sitemap 会被搜索引擎丢弃，等于没有声明任何 URL。',
      'If the XML cannot be parsed the whole sitemap is discarded, which is the same as declaring nothing.',
    ),
    fix: b(
      '检查未转义的 & 与 <、缺失的结束标签、编码声明，并用 XML 校验器验证；根节点必须是 urlset 或 sitemapindex。',
      'Check for unescaped & and <, missing closing tags, and the encoding declaration; validate with an XML checker. The root element must be urlset or sitemapindex.',
    ),
  },
  'sitemap.index-detected': {
    title: b('识别到 Sitemap Index', 'Sitemap index detected'),
    detail: b('{source}：包含 {children} 个子 sitemap', '{source}: {children} child sitemaps'),
  },
  'sitemap.count-info': {
    title: b('URL 数量', 'URL count'),
    detail: b('{source}：{count} 条', '{source}: {count} entries'),
  },
  'sitemap.no-urls': {
    title: b('Sitemap 中没有 URL', 'Sitemap contains no URLs'),
    detail: b('{source}', '{source}'),
    why: b('空 sitemap 无法帮助抓取，通常是生成脚本出错或筛选条件过严。', 'An empty sitemap cannot help crawling and usually means the generator is broken or over-filtering.'),
    fix: b('检查 sitemap 生成逻辑，确认至少包含一个有效 <loc>。', 'Check the generator and make sure it emits at least one valid <loc>.'),
  },
  'sitemap.too-many': {
    title: b('单个 Sitemap 超出 URL 上限', 'Sitemap exceeds the URL limit'),
    detail: b('{source}：{count} 条（上限 50000）', '{source}: {count} entries (limit 50000)'),
    why: b('规范规定单个 sitemap 最多 5 万条 URL、50MB，超出部分会被忽略。', 'The spec limits one sitemap to 50,000 URLs and 50MB; anything beyond that is ignored.'),
    fix: b('拆分为多个子 sitemap，并用 sitemapindex 汇总。', 'Split it into several child sitemaps and reference them from a sitemapindex.'),
  },
  'sitemap.duplicates': {
    title: b('存在重复 URL', 'Duplicate URLs'),
    detail: b('{source}：{count} 条重复，例如 {example}', '{source}: {count} duplicates, e.g. {example}'),
    why: b('重复 URL 会浪费抓取预算，也让搜索引擎难以判断哪一个是规范地址。', 'Duplicates waste crawl budget and make the canonical URL ambiguous.'),
    fix: b('在生成端去重；同一内容的多个地址请用 canonical 指向唯一版本。', 'De-duplicate in the generator and use canonical to point multiple URLs of the same content at one version.'),
  },
  'sitemap.invalid-loc': {
    title: b('loc 地址无效', 'Invalid <loc> value'),
    detail: b('{source}：{count} 条，例如 {example}', '{source}: {count} entries, e.g. {example}'),
    why: b('loc 必须是完整绝对 URL。相对地址、含空格或含无效字符的地址会被丢弃。', 'loc must be an absolute URL. Relative URLs, or ones with spaces or invalid characters, are discarded.'),
    fix: b('输出前对 URL 做编码与拼接校验，确保每条 loc 都能在浏览器直接打开。', 'Encode and validate URLs before printing them so every loc opens directly in a browser.'),
  },
  'sitemap.empty-loc': {
    title: b('存在空的 loc', 'Empty <loc> elements'),
    detail: b('{source}：{count} 条', '{source}: {count} entries'),
    why: b('空的 loc 会让整条记录失效，通常是模板渲染时变量为空。', 'An empty loc invalidates the entry, usually because a template variable was empty.'),
    fix: b('在生成端跳过没有 URL 的记录。', 'Skip records without a URL in the generator.'),
  },
  'sitemap.lastmod-missing': {
    title: b('全部缺少 lastmod', 'No lastmod values'),
    detail: b('{source}', '{source}'),
    why: b('lastmod 能帮助搜索引擎判断是否需要重新抓取，全部缺失会降低 sitemap 的价值。', 'lastmod helps crawlers decide whether a page needs re-fetching; without it the sitemap is less useful.'),
    fix: b('为每条 URL 输出真实的最后修改时间，避免使用当前时间伪造。', 'Emit a truthful last-modified time per URL — never fake it with "now".'),
  },
  'sitemap.cross-origin': {
    title: b('包含其他域名的 URL', 'URLs on other hosts'),
    detail: b('{source}：{count} 条，例如 {example}', '{source}: {count} entries, e.g. {example}'),
    why: b('sitemap 中的 URL 必须与 sitemap 所在主机一致（跨提交需在 Search Console 验证）。', 'URLs in a sitemap must live on the same host as the sitemap unless the other host is verified in Search Console.'),
    fix: b('移除其他域名的地址，或分域名各自提交 sitemap。', 'Remove foreign-host URLs or submit a separate sitemap per host.'),
  },
  'sitemap.not-in-robots': {
    title: b('robots.txt 未声明 Sitemap', 'Sitemap not declared in robots.txt'),
    detail: b('当前 sitemap：{source}', 'Current sitemap: {source}'),
    why: b('在 robots.txt 中声明 sitemap 是让爬虫发现它的最省事方式之一。', 'Declaring the sitemap in robots.txt is the simplest way for crawlers to discover it.'),
    fix: b('在 robots.txt 顶部加一行：Sitemap: https://你的域名/sitemap.xml', 'Add one line near the top of robots.txt: Sitemap: https://your-domain/sitemap.xml'),
  },

  /* ------------------------------------------------------------------ seo */
  'seo.title': {
    title: b('页面标题', 'Page title'),
    detail: b('{value}（{length} 字符）', '{value} ({length} chars)'),
  },
  'seo.title-missing': {
    title: b('缺少页面标题', 'Missing page title'),
    detail: b('未找到非空 <title>', 'No non-empty <title> found'),
    why: b('标题是搜索结果的主标题，也是最重要的页面相关性信号之一。', 'The title is the headline of a search result and one of the strongest relevance signals.'),
    fix: b('在 <head> 内添加唯一、准确概括页面内容的 <title>，并避免整站使用同一标题。', 'Add a unique, descriptive <title> in <head>, and never reuse one title across the whole site.'),
  },
  'seo.title-length': {
    title: b('标题长度不在建议区间', 'Title length outside the recommended range'),
    detail: b('当前 {length} 字符，建议 {min}–{max}', 'Currently {length} chars, recommended {min}–{max}'),
    why: b('过短浪费曝光机会，过长会在搜索结果中被截断。', 'Too short wastes visible space; too long gets truncated in search results.'),
    fix: b('把核心关键词与品牌放在前 60 个字符内，去掉冗余修饰。', 'Put the key phrase and brand within the first ~60 characters and trim filler.'),
  },
  'seo.title-multiple': {
    title: b('存在多个 <title> 标签', 'Multiple <title> tags'),
    detail: b('共 {count} 个', '{count} tags'),
    why: b('浏览器与爬虫通常只取第一个，多余标签容易导致标题与预期不一致。', 'Browsers and crawlers usually take the first one, so extra tags cause mismatched titles.'),
    fix: b('只保留一个 <title>，删除由组件重复渲染产生的多余标签。', 'Keep exactly one <title> and remove duplicates emitted by components.'),
  },
  'seo.description': {
    title: b('Meta Description', 'Meta description'),
    detail: b('{length} 字符', '{length} chars'),
  },
  'seo.description-missing': {
    title: b('缺少 Meta Description', 'Missing meta description'),
    detail: b('未找到 name="description"', 'No name="description" meta tag'),
    why: b('描述会作为搜索结果的摘要文案，缺失时搜索引擎会自己截取页面文本。', 'The description becomes the snippet in search results; without it search engines extract text themselves.'),
    fix: b('为每个页面写 50–160 字符的独特描述，概括页面价值并包含行动引导。', 'Write a unique 50–160 character description per page that states the value and invites a click.'),
  },
  'seo.description-length': {
    title: b('描述长度不在建议区间', 'Description length outside the recommended range'),
    detail: b('当前 {length} 字符，建议 {min}–{max}', 'Currently {length} chars, recommended {min}–{max}'),
    why: b('过短信息量不足，过长会被截断。', 'Too short lacks information; too long is truncated.'),
    fix: b('精简到 160 字符以内，把关键信息放在前半句。', 'Trim to under 160 characters and front-load the key information.'),
  },
  'seo.h1': {
    title: b('H1 标题', 'H1 heading'),
    detail: b('{value}', '{value}'),
  },
  'seo.h1-missing': {
    title: b('缺少 H1', 'Missing H1'),
    detail: b('页面没有 H1 标题', 'The page has no H1'),
    why: b('H1 帮助爬虫与用户确认页面主题，是内容结构的第一层。', 'The H1 tells crawlers and readers what the page is about; it is the first level of document structure.'),
    fix: b('为页面添加一个描述主题的 H1，避免用图片或纯样式文字代替。', 'Add one H1 describing the topic, not an image or styled text.'),
  },
  'seo.h1-multiple': {
    title: b('存在多个 H1', 'Multiple H1 headings'),
    detail: b('共 {count} 个', '{count} headings'),
    why: b('多个 H1 会弱化主题信号，通常是模板结构问题（如卡片标题也用 H1）。', 'Multiple H1s dilute the topical signal and usually indicate a template issue such as card titles marked up as H1.'),
    fix: b('保留一个页面级 H1，其余改为 H2/H3。', 'Keep one page-level H1 and demote the rest to H2/H3.'),
  },
  'seo.canonical': {
    title: b('Canonical 地址', 'Canonical URL'),
    detail: b('{value}', '{value}'),
  },
  'seo.canonical-missing': {
    title: b('缺少 Canonical', 'Missing canonical'),
    detail: b('未找到 rel="canonical"', 'No rel="canonical" link'),
    why: b('带参数、大小写或 www/非 www 的重复地址会分散权重，canonical 用于指明唯一版本。', 'Parameterised, mixed-case or www/non-www duplicates split ranking signals; canonical names the one true URL.'),
    fix: b('在每个页面 <head> 添加指向自身的绝对 canonical 地址。', 'Add an absolute self-referencing canonical URL in each page\'s <head>.'),
  },
  'seo.canonical-invalid': {
    title: b('Canonical 地址无效', 'Canonical URL is invalid'),
    detail: b('{value}', '{value}'),
    why: b('无法解析的 canonical 会被忽略，等于没有声明。', 'An unparsable canonical is ignored, which is the same as having none.'),
    fix: b('使用完整绝对地址（含 https:// 与域名），并确保该地址可正常访问且返回 200。', 'Use a full absolute URL with https:// and the host, and make sure it returns 200.'),
  },
  'seo.canonical-cross-origin': {
    title: b('Canonical 指向其他域名', 'Canonical points to another host'),
    detail: b('{value}', '{value}'),
    why: b('指向其他域名会让本页的权重转移过去；若不是刻意做域名合并，属于配置错误。', 'Pointing at another host moves signals away from this page; unless you are consolidating domains this is a misconfiguration.'),
    fix: b('确认是否刻意跨域声明，否则改为本域名的规范地址。', 'Confirm the cross-host canonical is intentional; otherwise point it at this host.'),
  },
  'seo.canonical-multiple': {
    title: b('存在多个 canonical', 'Multiple canonical links'),
    detail: b('共 {count} 个', '{count} links'),
    why: b('多个 canonical 互相冲突时搜索引擎会全部忽略。', 'When several canonicals conflict, search engines ignore all of them.'),
    fix: b('只保留一个 canonical 声明。', 'Keep exactly one canonical declaration.'),
  },
  'seo.robotsmeta': {
    title: b('Robots Meta', 'Robots meta'),
    detail: b('{value}', '{value}'),
  },
  'seo.robotsmeta-noindex': {
    title: b('页面声明了 noindex', 'Page declares noindex'),
    detail: b('{value}', '{value}'),
    why: b('noindex 会让页面彻底退出搜索结果，常见于误把测试环境的设置带到生产。', 'noindex removes the page from search results entirely — often a staging setting that leaked into production.'),
    fix: b('如果页面需要被收录，移除 noindex；如果是刻意隐藏，请确认它同时从 sitemap 中移除。', 'Remove noindex if the page should be indexed; if it is intentionally hidden, also remove it from the sitemap.'),
  },
  'seo.lang': {
    title: b('页面语言', 'Page language'),
    detail: b('html lang="{value}"', 'html lang="{value}"'),
  },
  'seo.lang-missing': {
    title: b('未声明页面语言', 'Missing page language'),
    detail: b('<html> 没有 lang 属性', 'The <html> element has no lang attribute'),
    why: b('语言声明帮助搜索引擎与屏幕阅读器正确处理内容，多语言站点更依赖它。', 'A language declaration helps search engines and screen readers process the page, and matters even more for multilingual sites.'),
    fix: b('在 <html> 上添加 lang，例如 lang="zh-CN" 或 lang="en"。', 'Add lang to <html>, e.g. lang="zh-CN" or lang="en".'),
  },
  'seo.viewport': {
    title: b('Viewport', 'Viewport'),
    detail: b('{value}', '{value}'),
  },
  'seo.viewport-missing': {
    title: b('缺少 viewport', 'Missing viewport'),
    detail: b('没有 name="viewport"', 'No name="viewport" meta tag'),
    why: b('缺少 viewport 时移动端会按桌面宽度缩放渲染，移动可用性极差。', 'Without a viewport, mobile browsers render at desktop width and the page becomes barely usable.'),
    fix: b('添加 <meta name="viewport" content="width=device-width, initial-scale=1">。', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'),
  },
  'seo.viewport-fixwidth': {
    title: b('Viewport 未使用 device-width', 'Viewport does not use device-width'),
    detail: b('{value}', '{value}'),
    why: b('固定宽度会让移动端出现横向滚动或整体缩小。', 'A fixed width causes horizontal scrolling or a shrunken page on mobile.'),
    fix: b('改为 width=device-width，并用 CSS 处理断点。', 'Use width=device-width and handle breakpoints in CSS.'),
  },
  'seo.viewport-nozoom': {
    title: b('Viewport 禁止缩放', 'Viewport disables zoom'),
    detail: b('{value}', '{value}'),
    why: b('禁止缩放会伤害低视力用户的可用性，也是移动友好性评估中的负面项。', 'Blocking zoom harms accessibility for low-vision users and counts against mobile-friendliness.'),
    fix: b('移除 user-scalable=no 与 maximum-scale=1。', 'Remove user-scalable=no and maximum-scale=1.'),
  },
  'seo.og': {
    title: b('Open Graph 信息', 'Open Graph metadata'),
    detail: b('已声明 {count} 项', '{count} properties declared'),
  },
  'seo.og-missing': {
    title: b('缺少 Open Graph 信息', 'Missing Open Graph metadata'),
    detail: b('未找到 og:title / og:description / og:image', 'No og:title / og:description / og:image'),
    why: b('社交平台与部分聊天工具依赖 OG 标签生成分享卡片，缺失时分享链接没有标题与配图。', 'Social platforms and chat apps build share cards from OG tags; without them links look empty.'),
    fix: b('添加 og:title、og:description、og:image（建议 1200×630）与 og:url。', 'Add og:title, og:description, og:image (1200×630 recommended) and og:url.'),
  },
  'seo.og-partial': {
    title: b('Open Graph 信息不完整', 'Open Graph metadata incomplete'),
    detail: b('缺少：{missing}', 'Missing: {missing}'),
    why: b('缺少关键字段时分享卡片会退化为纯文本链接。', 'With key fields missing, share cards fall back to a plain text link.'),
    fix: b('补齐 {missing}，并保证 og:url 与 canonical 一致。', 'Add {missing} and keep og:url consistent with the canonical URL.'),
  },
  'seo.twitter': {
    title: b('X Card 信息', 'X (Twitter) card metadata'),
    detail: b('twitter:card = {value}', 'twitter:card = {value}'),
  },
  'seo.twitter-missing': {
    title: b('缺少 twitter:card', 'Missing twitter:card'),
    detail: b('未声明 twitter:card', 'No twitter:card declared'),
    why: b('没有 twitter:card 时，链接在 X 上不会生成富卡片。', 'Without twitter:card, links do not expand into a rich card on X.'),
    fix: b('添加 <meta name="twitter:card" content="summary_large_image"> 及配套 title/description/image。', 'Add <meta name="twitter:card" content="summary_large_image"> plus matching title/description/image tags.'),
  },
  'seo.not-checked': {
    title: b('SEO 信息无法验证', 'SEO metadata could not be verified'),
    detail: b('原因：{reason}', 'Reason: {reason}'),
    why: b('没有拿到 HTML，标题、描述、canonical 等全部无法判断。', 'Without the HTML we cannot evaluate title, description, canonical or anything else.'),
    fix: b('配置检查服务地址，或用本地文件模式粘贴 HTML 源码。', 'Configure a scan service endpoint, or paste the HTML source in local file mode.'),
  },

  /* ----------------------------------------------------------------- html */
  'html.parsed': {
    title: b('HTML 已解析', 'HTML parsed'),
    detail: b('{bytes} 字节', '{bytes} bytes'),
  },
  'html.not-checked': {
    title: b('HTML 无法验证', 'HTML could not be verified'),
    detail: b('原因：{reason}', 'Reason: {reason}'),
    why: b('没有拿到页面 HTML，本节的检查全部没有依据。', 'No HTML was received, so nothing in this section has evidence.'),
    fix: b('配置检查服务地址，或用本地文件模式粘贴 HTML 源码。', 'Configure a scan service endpoint, or paste the HTML source in local file mode.'),
  },
  'html.img-alt': {
    title: b('图片缺少 alt', 'Images without alt text'),
    detail: b('{count} / {total} 张图片没有 alt', '{count} of {total} images have no alt attribute'),
    why: b('alt 是图片内容的替代文本，影响可访问性、图片搜索与页面理解。', 'alt is the text alternative for an image and affects accessibility, image search and page understanding.'),
    fix: b('为每张有意义的图片补上简短 alt；纯装饰图片使用 alt=""。', 'Add a short alt to meaningful images and alt="" to purely decorative ones.'),
  },
  'html.img-alt-ok': {
    title: b('图片 alt 完整', 'All images have alt'),
    detail: b('共 {total} 张图片', '{total} images'),
  },
  'html.charset': {
    title: b('缺少字符集声明', 'Missing charset declaration'),
    detail: b('未找到 <meta charset>', 'No <meta charset> found'),
    why: b('缺少字符集声明时浏览器需要猜测编码，中文内容容易乱码。', 'Without a charset declaration browsers must guess the encoding and non-ASCII text can be garbled.'),
    fix: b('在 <head> 最前面添加 <meta charset="utf-8">。', 'Add <meta charset="utf-8"> as the first element in <head>.'),
  },
  'html.charset-ok': {
    title: b('字符集声明', 'Charset declaration'),
    detail: b('{value}', '{value}'),
  },
  'html.doctype': {
    title: b('缺少 DOCTYPE', 'Missing DOCTYPE'),
    detail: b('文档开头没有 <!doctype html>', 'No <!doctype html> at the start of the document'),
    why: b('缺少 DOCTYPE 会让浏览器进入怪异模式，布局与样式表现不一致。', 'Without a DOCTYPE browsers fall into quirks mode and layout differs.'),
    fix: b('在文件第一行添加 <!doctype html>。', 'Add <!doctype html> as the first line of the file.'),
  },
  'html.links': {
    title: b('链接统计', 'Link counts'),
    detail: b('内部 {internal} / 外部 {external}（共 {total}）', 'internal {internal} / external {external} (total {total})'),
  },
  'html.structured-data': {
    title: b('结构化数据', 'Structured data'),
    detail: b('发现 {count} 段 JSON-LD', '{count} JSON-LD block(s)'),
    why: b('结构化数据能带来富结果展示，缺失不算错误，但会失去额外曝光机会。', 'Structured data enables rich results; missing it is not an error, just a missed opportunity.'),
    fix: b('按内容类型添加 Article、Product、FAQ 等 JSON-LD，并用校验工具验证。', 'Add Article, Product or FAQ JSON-LD as appropriate and validate it with a testing tool.'),
  },
  'html.hreflang': {
    title: b('hreflang 声明', 'hreflang declarations'),
    detail: b('{count} 条', '{count} entries'),
  },
  'html.size': {
    title: b('HTML 体积', 'HTML size'),
    detail: b('约 {kb} KB', 'about {kb} KB'),
  },

  /* ----------------------------------------------------------- limitations */
  'limitation.no-js': {
    title: b('未执行页面 JavaScript', 'Page JavaScript is not executed'),
    detail: b(
      '所有结果基于服务器返回的原始 HTML；由 JS 注入的 meta、canonical、链接不在检查范围内。',
      'All results are based on the raw HTML returned by the server; metadata, canonicals or links injected by JS are not covered.',
    ),
  },
  'limitation.single-page': {
    title: b('只检查首页与基础文件', 'Only the home page and well-known files are checked'),
    detail: b('本工具不做全站爬取，内页需要单独检查。', 'This tool does not crawl the site; individual pages must be checked separately.'),
  },
  'limitation.cors': {
    title: b('部分资源无法验证', 'Some resources could not be verified'),
    detail: b(
      '浏览器同源策略（CORS）阻止了直接读取。这不是网站的错误，请配置检查服务或使用本地文件模式。',
      'The browser same-origin policy (CORS) blocked direct reading. This is not a fault of the site — configure a scan service or use local file mode.',
    ),
  },
  'limitation.local': {
    title: b('本地文件检查', 'Local file check'),
    detail: b(
      '结果仅基于你提供的文件，未访问任何服务器；与在线检查结果分开记录。',
      'Results are based only on the files you provided; no server was contacted. They are kept separate from online results.',
    ),
  },
  'limitation.demo': {
    title: b('演示数据', 'Demo data'),
    detail: b('当前报告来自内置示例站点，不是真实检查结果，也不会写入历史记录。', 'This report uses the built-in sample site. It is not a real check and is never written to history.'),
  },
  'limitation.direct-partial': {
    title: b('在线检查为浏览器直连', 'Online check used direct browser requests'),
    detail: b('仅检查首页与一个 sitemap，且目标站点必须允许跨域读取。', 'Only the home page and one sitemap were checked, and the target must allow cross-origin reads.'),
  },
};
