import {
  initialState,
  mutate,
  metrics,
  effectiveRuns,
  usableFacts,
  retrieve,
  exportRevision,
  previewRevision,
  evaluateExperiment,
  technicalSources,
  VERSION,
} from './platform.mjs';

(async () => {
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const pct = (value) => (value === null ? '—' : (value * 100).toFixed(1) + '%');
  const name = (id) => state.products.find((p) => p.id === id)?.sku || id;
  const pretty = (value) => esc(JSON.stringify(value, null, 2));
  const nav = [
    ['overview', '◈', '增长总览'],
    ['knowledge', '▦', '商品与事实库'],
    ['prompts', '≋', '采购问题集'],
    ['plans', '◷', '监测计划'],
    ['data', '▤', 'GEO 数据中心'],
    ['diagnosis', '◎', '差距诊断'],
    ['content', '✎', '内容工作台'],
    ['experiments', '⇄', '复测实验室'],
  ];
  let state,
    providers = [],
    backend = false,
    page = 'overview',
    origin = 'real',
    productId = '',
    selectedRun = '',
    selectedRevision = '',
    drawer = '',
    metricFilter = '',
    dataFilters = {},
    rowsShown = 12,
    retrievalResult = null,
    busy = false;
  const storageKey = 'geo-platform-v3';
  try {
    state = JSON.parse(localStorage.getItem(storageKey));
  } catch {}
  if (state?.schemaVersion !== 3) state = initialState();
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    try {
      const response = await fetch('/api/state', { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const data = await response.json();
        state = data.state;
        providers = data.providers;
        backend = true;
      }
    } catch {}
  }
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      toast('浏览器存储空间不足，请下载备份');
    }
  };
  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 4500);
  }
  async function refresh() {
    if (backend) {
      const response = await fetch('/api/state');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      state = data.state;
      providers = data.providers;
    } else save();
  }
  async function act(action, input = {}) {
    if (busy) return;
    busy = true;
    try {
      let result;
      if (backend) {
        const response = await fetch('/api/' + action, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...input, stateRevision: state.revision }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        result = data;
      } else {
        if (action === 'execute')
          throw new Error('联网监测需要本地后端。先双击 start-demo.cmd，再在本机配置 API。');
        const next = structuredClone(state);
        result = mutate(next, action, input);
        state = next;
      }
      await refresh();
      render();
      return result;
    } catch (error) {
      await refresh().catch(() => {});
      toast(error.message);
      return null;
    } finally {
      busy = false;
    }
  }
  function currentProduct() {
    return state.products.find((p) => p.id === productId) || state.products[0];
  }
  function scope() {
    return { origin, ...(productId ? { productId } : {}) };
  }
  function chip(value, kind = '') {
    return `<span class="chip ${kind}">${esc(value)}</span>`;
  }
  function badge(o) {
    return chip(
      o === 'synthetic'
        ? '案例数据'
        : o === 'public'
          ? '公开资料'
          : o === 'real'
            ? '真实 API 样本'
            : '用户授权资料',
      o === 'synthetic' ? 'amber' : 'blue',
    );
  }
  function empty(title, body, button = '') {
    return `<div class="empty"><div class="empty-icon">◇</div><h3>${title}</h3><p>${body}</p>${button}</div>`;
  }
  function panel(title, body, extra = '') {
    return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
  }
  function table(headers, rows) {
    return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function btn(label, action, id = '', style = '') {
    return `<button class="${style}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
  }
  function selectProducts(value = '') {
    return state.products
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.sku + ' · ' + p.name)}</option>`,
      )
      .join('');
  }
  function field(label, html) {
    return `<label>${label}${html}</label>`;
  }
  function input(key, value = '', type = 'text', extra = '') {
    return `<input name="${key}" type="${type}" value="${esc(value)}" ${extra}>`;
  }
  function intro(title, body, extra = '') {
    return `<div class="page-heading"><div><div class="eyebrow">GEO OPERATIONS / ${VERSION}</div><h1>${title}</h1><p>${body}</p></div><div>${extra}</div></div>`;
  }
  function overview() {
    const m = metrics(state, scope());
    const cards = [
      [
        origin === 'synthetic' ? '案例有效回答 N' : '有效联网回答 N',
        m.N,
        '去重、成功且实际搜索',
        'N',
      ],
      ['品牌提及 B', m.B, pct(m.brandRate) + ' · B / N', 'B'],
      ['品牌推荐 R', m.R, pct(m.overallRecommendationRate) + ' · R / N', 'R'],
      ['我方网址引用 C', m.C, pct(m.citationRate) + ' · C / N', 'C'],
    ];
    return (
      intro(
        '让每一次 AI 曝光，都有证据可查',
        '从可信商品事实开始，持续监测、诊断并验证内容修改。',
        btn('查看原始样本 →', 'goto-data', '', 'primary'),
      ) +
      `<div class="stats">${cards.map(([title, value, sub, filter]) => `<button class="stat" data-action="metric" data-id="${filter}"><span>${title}</span><strong>${value}</strong><small>${sub}</small></button>`).join('')}</div>` +
      `<div class="grid two">${panel('可见度漏斗', `<div class="funnel"><div><b>${m.N}</b><span>有效回答</span><i>N</i></div><div><b>${m.B}</b><span>提及品牌</span><i>B / N ${pct(m.brandRate)}</i></div><div><b>${m.R}</b><span>明确推荐</span><i>R / B ${pct(m.recommendationRate)}</i></div></div><p class="caption">网址引用 ${m.C} 和商品提及 ${m.P} 独立统计；引用可以没有品牌提及。</p>`)}
  ${panel('下一步行动', `<ol class="steps"><li><b>维护可信商品事实</b><span>${state.products.length} 个商品 · ${state.facts.filter((f) => f.status === 'approved').length} 条已审核事实</span>${btn('去事实库', 'goto-knowledge')}</li><li><b>批准采购问题</b><span>${state.prompts.filter((p) => p.status === 'approved').length} 条已批准 · 按市场和语言锁定版本</span>${btn('去问题集', 'goto-prompts')}</li><li><b>配置联网监测</b><span>${providers.filter((p) => p.configured).length} 个 API 已配置 · ${state.plans.length} 个计划</span>${btn('去监测计划', 'goto-plans')}</li><li><b>审核内容并复测</b><span>${state.revisions.filter((r) => r.status === 'approved').length} 份已批准修改 · ${state.experiments.length} 个复测实验</span>${btn('去内容工作台', 'goto-content')}</li></ol>`)}</div>` +
      panel(
        '采样与预算',
        `<div class="inline-stats"><span>已规划样本 <b>${m.planned}</b></span><span>请求尝试 <b>${m.attempts}</b></span><span>调用失败 <b>${m.failed}</b></span><span>待配置 / 预算阻止 <b>${m.blocked}</b></span><span>预算预留 <b>$${m.reservedUSD.toFixed(3)}</b></span></div><p class="caption">预算预留是本机预算控制依据；实际费用以 API 供应商账单为准。</p>`,
      )
    );
  }
  function knowledge() {
    const p = currentProduct(),
      facts = state.facts.filter((f) => f.productId === p?.id);
    return (
      intro(
        '把商品资料变成可信事实',
        '每条参数绑定 SKU、来源与审核状态。冲突资料需要人工裁定。',
        btn('导入商品资料', 'import-open', '', 'primary'),
      ) +
      `<div class="grid knowledge-grid">${panel('商品目录', `<div class="product-list">${state.products.map((x) => `<button class="product ${p?.id === x.id ? 'selected' : ''}" data-action="select-product" data-id="${esc(x.id)}"><strong>${esc(x.sku)}</strong><span>${esc(x.name)}</span>${badge(x.origin)}<small>${usableFacts(state, x.id).length} 条可用事实 · ${esc(x.series)}</small></button>`).join('')}</div>`)}
  <div>${panel(
    esc(p?.name || '商品事实'),
    facts.length
      ? table(
          ['属性 / 来源定位', '值', '状态', '审核'],
          facts.map(
            (f) =>
              `<tr><td><b>${esc(f.attribute)}</b><small>${esc(state.sources.find((s) => s.id === f.sourceId)?.name)} · ${esc(f.locator)}</small></td><td>${esc(f.value)} ${esc(f.unit)}<small>${esc(f.conditions)}</small></td><td>${chip(f.status, f.status === 'conflict' ? 'amber' : '')}</td><td>${['pending', 'conflict'].includes(f.status) ? btn('采用', 'fact-approve', f.id) + btn('拒绝', 'fact-reject', f.id) : ''}</td></tr>`,
          ),
        )
      : empty('还没有事实', '导入商品表，或手工补充可核验的参数。'),
  )}
  ${panel('商品内检索', `<form id="retrieve-form" class="row"><input name="query" placeholder="例如 power / material / pressure" required>${btn('检索', 'submit-retrieve', '', 'primary')}</form><p class="caption">当前：SKU 精确范围 + 关键词排序。向量语义检索尚未接入。</p>${retrievalResult ? `<pre>${pretty(retrievalResult)}</pre>` : ''}`)}
  ${panel('资料版本与撤回', state.sources.map((s) => `<div class="source-row"><div><b>${esc(s.name)}</b> ${badge(s.origin)}<small>${esc(s.status)} · v${s.version} · SHA ${esc(s.checksum.slice(0, 12))}</small></div>${s.status === 'active' ? btn('撤回资料', 'withdraw', s.id) : chip('已撤回')}</div>`).join(''))}</div></div>`
    );
  }
  function prompts() {
    const p = currentProduct(),
      rows = state.prompts.filter((q) => q.productId === p.id);
    return (
      intro(
        '从采购意图组织问题集',
        '候选问题来自商品类目模板，优先级是采购规则评分；编辑并批准后才进入监测。',
      ) +
      panel(
        '生成候选问题',
        `<form id="prompt-form" class="form-grid">${field('商品', `<select name="productId">${selectProducts(p.id)}</select>`)}${field('市场', `<select name="country"><option>US</option><option>DE</option><option>GB</option><option>CN</option></select>`)}${field('回答语言', `<select name="language"><option value="en">English</option><option value="de">Deutsch</option><option value="zh">中文</option></select>`)}<button class="primary">生成问题候选</button></form>`,
      ) +
      panel(
        '问题审核',
        rows.length
          ? rows
              .map(
                (q) =>
                  `<form class="prompt-editor" data-prompt="${esc(q.id)}"><div class="row"><b>${esc(q.intent)}</b>${chip(q.country + ' / ' + q.language)}${chip('v' + q.version)}${chip(q.status)}<span class="muted">优先级 ${q.priority} · ${esc(q.priorityBasis)}</span></div><textarea name="question" rows="2">${esc(q.question)}</textarea><div class="row"><small>来源：${esc(q.source)} · 关联 ${q.factIds.length} 条事实</small><button class="primary">保存并批准</button></div></form>`,
              )
              .join('')
          : empty('还没有采购问题', '选择商品和目标市场，生成后逐条检查。'),
      )
    );
  }
  function plans() {
    const p = currentProduct();
    return (
      intro(
        '在一致条件下持续采样',
        '计划保存完整问题版本和品牌配置。运行时不会把私有商品事实加入监测提示词。',
        btn('配置 API', 'settings-open'),
      ) +
      `<div class="grid two">${panel('新建监测计划', `<form id="plan-form" class="form-grid">${field('计划名称', input('name', '工业商品采购监测', 'text', 'required'))}${field('商品范围', `<select name="productIds" multiple size="3">${selectProducts(p.id)}</select>`)}${field('API 通道', `<select name="provider"><option value="gemini">Gemini · Google Search</option><option value="openai">OpenAI · Web search</option></select>`)}${field('模型 ID', input('model', providers.find((x) => x.provider === 'gemini')?.model || '', 'text', 'placeholder="填入账户可用的模型 ID" required'))}${field('市场', `<select name="country"><option>US</option><option>DE</option><option>GB</option><option>CN</option></select>`)}${field('语言', `<select name="language"><option value="en">English</option><option value="de">Deutsch</option><option value="zh">中文</option></select>`)}${field('采样频率', `<select name="cadenceHours"><option value="24">每 24 小时</option><option value="4">每 4 小时</option><option value="1">每 1 小时</option></select>`)}${field('每日请求上限（包含重试）', input('dailyCallCap', 20, 'number', 'min="1" max="1000" required'))}${field('每日预算预留上限 USD', input('dailyBudgetUSD', 2, 'number', 'min="0.001" step="0.001" required'))}${field('每次请求预留 USD（人工设定）', input('reservePerCallUSD', 0.1, 'number', 'min="0.001" step="0.001" required'))}<button class="primary">创建并冻结配置</button></form>`)}
  ${panel(
    '通道状态与采样边界',
    `<div class="provider-list">${['gemini', 'openai']
      .map((id) => {
        const cap = providers.find((p) => p.provider === id);
        return `<div><b>${id === 'gemini' ? 'Gemini' : 'OpenAI'}</b>${chip(cap?.configured ? '已配置' : '待配置', cap?.configured ? 'green' : 'amber')}<small>${esc(cap?.model || '模型 ID 由本机配置或计划指定')}</small></div>`;
      })
      .join(
        '',
      )}</div><p>调度器只在本地后端运行时工作，每 15 秒检查到期计划。单队列执行，最多重试 2 次；重试也占用预算。</p><p>Gemini 的国家参数是提示词语境，无法保证请求来自该国家。API 采样结果与消费者端搜索体验分别解释。</p><div class="notice">${backend ? '本地后端已连接' : '离线模式：可配置计划，联网执行需要启动本地服务。'}</div>`,
  )}</div>` +
      panel(
        '计划列表',
        state.plans.length
          ? state.plans
              .map(
                (plan) =>
                  `<article class="plan-card"><div class="row"><h3>${esc(plan.name)}</h3>${chip(plan.status)}${chip(plan.config.provider)}<small>v${plan.version} · ${esc(plan.configHash.slice(0, 12))}</small></div><p>${plan.config.productIds.map(name).map(esc).join(', ')} · ${plan.config.prompts.length} 个问题 · ${esc(plan.config.model)} · ${esc(plan.config.country)} / ${esc(plan.config.language)} · 每 ${plan.config.cadenceHours} 小时</p><p class="caption">下次到期 ${esc(plan.nextDueAt)} ${plan.lastError ? '· ' + esc(plan.lastError) : ''}</p><div class="row">${btn('运行本轮', 'execute', plan.id, 'primary')}${btn(plan.status === 'active' ? '暂停' : '恢复定时', plan.status === 'active' ? 'plan-pause' : 'plan-resume', plan.id)}${btn('克隆为新计划', 'plan-clone', plan.id)}<details><summary>冻结配置</summary><pre>${pretty(plan.config)}</pre></details></div></article>`,
              )
              .join('')
          : empty('没有监测计划', '先批准对应市场的问题，再创建监测计划。'),
      )
    );
  }
  function dataCenter() {
    const filter = { ...scope(), ...dataFilters };
    const m = metrics(state, filter);
    let rows = state.runs.filter(
      (r) => r.origin === origin && (!productId || r.productIds.includes(productId)),
    );
    rows = rows.filter(
      (r) =>
        (!filter.provider || r.provider === filter.provider) &&
        (!filter.country || r.country === filter.country) &&
        (!filter.language || r.language === filter.language) &&
        (!filter.intent || r.prompt.intent === filter.intent) &&
        (!filter.from || r.at >= filter.from) &&
        (!filter.to || r.at <= filter.to),
    );
    if (metricFilter === 'N') rows = effectiveRuns(state, filter);
    else if (metricFilter)
      rows = rows.filter(
        (r) =>
          r.annotation?.[
            { B: 'brand', R: 'recommended', C: 'ownCitation', P: 'product' }[metricFilter]
          ],
      );
    return (
      intro(
        '回到每一次原始回答',
        '查看搜索是否实际发生、引用出处、识别片段、重试与预算记录。',
        btn('刷新记录', 'refresh'),
      ) +
      panel(
        '筛选监测样本',
        `<form id="data-filter-form" class="form-grid">${[
          ['provider', 'API 通道', ['gemini', 'openai', 'fixture']],
          ['country', '国家', ['US', 'DE', 'GB', 'CN']],
          ['language', '语言', ['en', 'de', 'zh']],
          ['intent', '采购意图', ['supplier', 'selection', 'specification', 'commercial']],
        ]
          .map(([key, label, values]) =>
            field(
              label,
              `<select name="${key}"><option value="">全部</option>${values.map((value) => `<option value="${value}" ${dataFilters[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select>`,
            ),
          )
          .join(
            '',
          )}${field('开始日期', input('from', dataFilters.from?.slice(0, 10) || '', 'date'))}${field('结束日期', input('to', dataFilters.to?.slice(0, 10) || '', 'date'))}<button class="primary">应用筛选</button>${btn('重置筛选', 'reset-filters')}</form>`,
      ) +
      `<div class="mini-stats">${[
        ['N', m.N],
        ['B', m.B],
        ['R', m.R],
        ['P', m.P],
        ['C', m.C],
      ]
        .map(([key, n]) => btn(`${key} · ${n}`, 'metric', key))
        .join('')} ${btn('全部记录', 'metric')}</div>` +
      panel(
        '采样记录',
        rows.length
          ? table(
              ['问题 / 时间', 'API / 模型', '结果', '提及 / 推荐 / 引用', '证据'],
              rows.slice(0, rowsShown).map(
                (r) =>
                  `<tr><td><b>${esc(r.prompt.question)}</b><small>${esc(r.at)} · ${esc(r.prompt.intent)}</small></td><td>${esc(r.provider)}<small>${esc(r.model)}</small></td><td>${chip(r.status, r.status === 'failed' ? 'amber' : '')}<small>${r.origin === 'synthetic' ? '案例搜索标志' : r.searchPerformed ? '已执行搜索' : '未确认搜索'} · ${r.attempts.length} 次尝试</small></td><td>${
                    r.annotation
                      ? [
                          r.annotation.brand ? '品牌' : '',
                          r.annotation.recommended ? '推荐' : '',
                          r.annotation.product ? '商品' : '',
                          r.annotation.ownCitation ? '引用' : '',
                        ]
                          .filter(Boolean)
                          .map((x) => chip(x))
                          .join('') || '—'
                      : '—'
                  }</td><td>${btn('原始证据', 'evidence', r.id)}</td></tr>`,
              ),
            ) + (rows.length > rowsShown ? btn(`查看更多（${rows.length} 条）`, 'more') : '')
          : empty('没有这个范围的监测记录', '配置 API 后运行计划，或加载独立案例查看完整流程。'),
      ) +
      panel(
        '按日采样与竞品提及',
        (() => {
          const days = [
            ...new Set(effectiveRuns(state, filter).map((r) => r.at.slice(0, 10))),
          ].sort();
          return (
            (days.length
              ? table(
                  ['日期', 'N', '品牌 B', '推荐 R', '引用 C'],
                  days.map((day) => {
                    const v = metrics(state, {
                      ...filter,
                      from: day + 'T00:00:00.000Z',
                      to: day + 'T23:59:59.999Z',
                    });
                    return `<tr><td>${day}</td><td>${v.N}</td><td>${v.B}</td><td>${v.R}</td><td>${v.C}</td></tr>`;
                  }),
                )
              : '<p>这个范围没有有效样本。</p>') +
            `<p class="caption">竞品提及次数（同一回答可提及多个竞品）：${
              Object.entries(m.competitors)
                .map(([brand, n]) => esc(brand) + ': ' + n)
                .join(' · ') || '尚未配置竞品'
            }</p>`
          );
        })(),
      ) +
      panel(
        '指标口径',
        `<p>N = 成功、非空、实际执行搜索的唯一回答。B / N = 品牌提及率；R / B = 已提及后的推荐率；R / N = 总推荐率；C / N = 我方域名引用率。</p><p>品牌识别、推荐与引用使用可审查规则，结果待人工复核。无搜索、失败和被预算阻止的记录不进入 N。不同来源数据互不混算。</p>`,
      )
    );
  }
  function diagnosis() {
    const rows = state.diagnoses.filter(
      (d) => d.origin === origin && (!productId || d.productId === productId),
    );
    return (
      intro(
        '把观察转成可审核的行动',
        '诊断绑定原始回答与可信事实。内容缺口是否导致曝光不足，需要复测检验。',
      ) +
      panel(
        '诊断队列',
        rows.length
          ? rows
              .map(
                (d) =>
                  `<article class="plan-card"><div class="row">${badge(d.origin)}${chip('待验证假设', 'amber')}<b>优先级 ${d.priority.toFixed(2)}</b><span>${esc(name(d.productId))}</span></div><h3>${esc(d.issue)}</h3><p>${esc(d.explanation)}</p><p class="caption">优先级 = 影响 × 意图权重 × 置信度 /（工作量 + 风险）。分项：${esc(JSON.stringify(d.components))}</p><div class="row">${btn('查看样本', 'evidence', d.runId)}${btn('生成事实约束修改', 'create-content', d.id, 'primary')}</div></article>`,
              )
              .join('')
          : empty(
              '还没有诊断',
              '从数据中心打开一条有效样本，选择“创建诊断”。',
              btn('去数据中心', 'goto-data', '', 'primary'),
            ),
      )
    );
  }
  function content() {
    const rows = state.revisions.filter(
      (r) => r.origin === origin && (!productId || r.productId === productId),
    );
    const r = rows.find((x) => x.id === selectedRevision) || rows.at(-1);
    selectedRevision = r?.id || '';
    return (
      intro(
        '修改现有内容，保留审核版本',
        '逐段比较修改前后。导出的产物与人工批准的完整快照一致。',
      ) +
      `<div class="grid content-grid">${panel(
        '内容版本',
        rows.length
          ? rows
              .slice()
              .reverse()
              .map(
                (x) =>
                  `<button class="product ${r?.id === x.id ? 'selected' : ''}" data-action="select-revision" data-id="${esc(x.id)}"><strong>${esc(name(x.productId))} · v${x.version}</strong>${chip(x.status)}<small>${esc(x.generator)}</small></button>`,
              )
              .join('')
          : empty('没有草稿', '先从样本创建诊断。'),
      )}<div>${
        r
          ? panel(
              '片段修改与审核',
              `<div class="row">${badge(r.origin)}${chip(r.status)}${chip('版本 ' + r.version)}<small>${esc(r.id)}</small></div>${r.segments
                .map(
                  (seg) =>
                    `<form class="segment" data-revision="${esc(r.id)}" data-segment="${esc(seg.id)}"><div class="row"><h3>${esc(seg.label)}</h3>${chip(seg.decision)}</div><div class="diff"><div><small>修改前</small><pre>${esc(seg.before || '（尚无内容）')}</pre></div><div><small>修改后 · 可人工编辑</small><textarea name="after" rows="7" ${r.status === 'approved' ? 'readonly' : ''}>${esc(seg.after)}</textarea></div></div><p class="caption">证据事实：${seg.factIds
                      .map((id) => {
                        const f = state.facts.find((x) => x.id === id);
                        return esc(f ? f.attribute + ': ' + f.value : id);
                      })
                      .join(
                        ' · ',
                      )}</p>${r.status === 'draft' ? `<div class="row"><button name="decision" value="accept" class="primary">保存并接受片段</button><button name="decision" value="reject">拒绝片段</button></div>` : ''}</form>`,
                )
                .join(
                  '',
                )}<div class="notice">待补材料：${r.missingTasks.map(esc).join('、')}。人工修改的事实声明需人工核验，系统没有自动证明其真实性。</div>${r.status === 'draft' ? `<details open><summary>完整待批准产物（批准后原样导出）</summary><pre>${pretty(previewRevision(state, r.id))}</pre></details><form id="approve-form"><label class="checkbox"><input type="checkbox" name="confirmClaims" required>我已核验保留片段中的事实声明，并看过完整导出内容。</label><button class="primary">批准完整快照</button></form>` : `<div class="row">${btn('导出批准产物 JSON', 'export', r.id, 'primary')}${btn('以此版本创建回退草稿', 'rollback', r.id)}</div><p class="caption">审批哈希 ${esc(r.approved.hash)}</p><details><summary>完整批准快照（导出相同对象）</summary><pre>${pretty(r.approved.artifact)}</pre></details>`}`,
            )
          : empty(
              '从诊断开始修改',
              '先选择监测样本，再建立有证据的优化任务。',
              btn('去诊断队列', 'goto-diagnosis', '', 'primary'),
            )
      }</div></div>`
    );
  }
  function experiments() {
    const real = effectiveRuns(state, { origin: 'real' });
    return (
      intro(
        '复测内容修改后的表现',
        '锁定问题、商品、国家、语言、API 与模型；报告观察差异和不可比较的原因。',
      ) +
      panel(
        '建立复测',
        real.length
          ? `<form id="experiment-form" class="form-grid">${field('监测计划', `<select name="planId">${state.plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`)}${field(
              '已批准内容版本',
              `<select name="revisionId">${state.revisions
                .filter((r) => r.status === 'approved')
                .map(
                  (r) =>
                    `<option value="${esc(r.id)}">${esc(name(r.productId))} v${r.version}</option>`,
                )
                .join('')}</select>`,
            )}${field('已在站点上线的时间', input('changeAt', '', 'datetime-local', 'required'))}<p class="caption">自动选取该计划中早于上线时间的真实有效样本为基线。导出不等于已发布。</p><button class="primary">冻结基线并创建实验</button></form>`
          : empty(
              '还没有真实基线',
              '配置 API 并积累有效样本后，才能建立真实复测。案例数据不能作为真实提升的证据。',
            ),
      ) +
      panel(
        '复测结果',
        state.experiments.length
          ? state.experiments
              .map(
                (e) =>
                  `<article class="plan-card"><h3>${esc(state.plans.find((p) => p.id === e.planId)?.name)}</h3><pre>${pretty(evaluateExperiment(state, e.id))}</pre></article>`,
              )
              .join('')
          : empty('尚无实验', '建议每阶段至少 30 条有效回答，并检查问题和采样配置是否一致。'),
      )
    );
  }
  function render() {
    const title = nav.find((n) => n[0] === page)?.[2];
    document.getElementById('app').innerHTML =
      `<aside class="sidebar"><a class="logo" href="#"><span>G</span><div>GEO SIGNAL<small>智能监测与优化平台</small></div></a><div class="workspace"><div class="avatar">${esc(state.workspace.brand[0])}</div><div><b>${esc(state.workspace.brand)}</b><small>${esc(state.workspace.domain)}</small></div></div><div class="nav-label">工作空间</div><nav>${nav.map(([id, icon, label]) => `<button class="nav ${id === page ? 'active' : ''}" data-action="nav" data-id="${id}"><i>${icon}</i>${label}</button>`).join('')}</nav><div class="sidebar-bottom">${btn('⚙ 工作空间与 API', 'settings-open')}${btn('↗ 来源与技术文档', 'sources-open')}<p>LOCAL WORKSPACE · V3.0<br>${backend ? '后端已连接' : '浏览器离线模式'}</p></div></aside><main class="main"><header class="topbar"><span>工作空间 <b>/ ${title}</b></span><div class="row"><span class="connection">● ${backend ? '本地服务在线' : '离线工作台'}</span>${btn('加载独立案例', 'load-example')}</div></header><div class="scopebar"><label>商品范围 <select id="global-product"><option value="">全部商品</option>${selectProducts(productId)}</select></label><label>监测数据 <select id="global-origin"><option value="real" ${origin === 'real' ? 'selected' : ''}>真实 API 记录</option><option value="synthetic" ${origin === 'synthetic' ? 'selected' : ''}>独立案例数据</option></select></label>${origin === 'synthetic' ? chip('案例 · 不代表真实曝光', 'amber') : chip('真实数据 · 未发生搜索的记录不计入指标', 'blue')}</div><div class="page">${{ overview, knowledge, prompts, plans, data: dataCenter, diagnosis, content, experiments }[page]()}</div><footer>商品级 GEO 运营闭环 · 数据与批准版本可追溯</footer></main>${renderDrawer()}`;
    bind();
    window.__geoReady = true;
  }
  function renderDrawer() {
    let body = '',
      title = '';
    if (drawer === 'settings') {
      title = '工作空间与 API';
      body = `<form id="workspace-form" class="stack">${field('品牌', input('brand', state.workspace.brand, 'text', 'required'))}${field('品牌别名（逗号分隔）', input('aliases', state.workspace.aliases.join(',')))}${field('我方域名', input('domain', state.workspace.domain, 'text', 'required'))}${field('竞品名称（逗号分隔）', input('competitors', state.workspace.competitors.join(',')))}${field('企业资料属性', `<select name="provenance"><option value="user-declared">我的实际企业（用户声明，未验证域名归属）</option><option value="synthetic" ${state.workspace.provenance === 'synthetic' ? 'selected' : ''}>虚构案例</option></select>`)}<button class="primary">保存工作空间</button></form><h3>在本机后端配置 API</h3><p>密钥不填写在网页中。设置环境变量后重新启动服务：</p><pre>GEMINI_API_KEY=你的本机密钥\nGEMINI_MODEL=账户可用的模型 ID\n\nOPENAI_API_KEY=你的本机密钥\nOPENAI_MODEL=账户可用的模型 ID</pre><p>只配置需要的通道。已配置不表示已验证联网；成功调用后才能查看真实记录。</p><p class="caption">当前是单用户本地工作空间。多租户隔离、正式登录权限与云端常驻调度尚未实现。</p>${btn('下载工作空间备份', 'backup')}`;
    }
    if (drawer === 'sources') {
      title = '来源与技术文档';
      const base = backend ? '/deliverables/' : window.GEO_ASSETS?.docsBase || '';
      body = `<h3>官方技术与公开商品来源</h3>${technicalSources.map((s) => `<div class="source-row"><div><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a><p>${esc(s.note)}</p></div></div>`).join('')}<h3>项目文档</h3>${[
        ['产品需求与实现范围', 'docs/PRD.md'],
        ['架构与数据流', 'docs/ARCHITECTURE.md'],
        ['技术来源核实', 'docs/RESEARCH.md'],
        ['操作演示', 'docs/DEMO-SCRIPT.md'],
        ['实际测试报告', 'evidence/TEST-REPORT.md'],
      ]
        .map(([label, url]) => `<p><a href="${esc(base + url)}" target="_blank">${label} ↗</a></p>`)
        .join('')}<p class="caption">仅收录产品技术和商品事实来源。</p>`;
    }
    if (drawer === 'import') {
      title = '导入商品资料';
      body = `<p>CSV / JSON 支持直接导入。XLSX、DOCX、PDF 通过本地后端解析；文档原文需要人工映射为商品参数后导入。</p><input id="import-file" type="file" accept=".csv,.json,.xlsx,.docx,.pdf"><form id="import-form" class="stack">${field('资料名称', input('name', '我的商品资料', 'text', 'required'))}${field('来源属性', `<select name="origin"><option value="authorized">我有权使用的企业资料</option><option value="public">公开资料</option><option value="synthetic">案例资料</option></select>`)}${field('出处 URL（仅保存来源，不自动抓取）', input('url', '', 'url'))}${field('商品行 JSON 或 CSV', `<textarea id="import-rows" name="payload" rows="9" required>${esc('sku,name,category,material,power\nP-300,Sample Pump,centrifugal pump,Stainless steel 304,5 kW')}</textarea>`)}${field('文档原文与定位（可人工补充）', `<textarea id="import-context" name="context" rows="6" placeholder="上传文档后在此显示页码、段落或表格原文"></textarea>`)}<p class="caption">JSON 为对象数组；必填 sku/name/category，其余字段作为待审事实。不同值冲突时保留原记录。PDF 扫描图片的 OCR 尚未支持。</p><button class="primary">导入并进入事实审核</button></form>`;
    }
    if (drawer === 'evidence') {
      const r = state.runs.find((r) => r.id === selectedRun);
      title = '原始证据';
      if (r)
        body = `<div class="row">${badge(r.origin)}${chip(r.status)}${chip(r.origin === 'synthetic' ? '案例搜索标志' : r.searchPerformed ? '已搜索' : '未确认搜索')}</div><h3>${esc(r.prompt.question)}</h3><pre class="answer">${esc(r.answer || r.error || '没有回答')}</pre><h3>来源引用</h3>${
          r.citations
            .map((c) => {
              let valid = false;
              try {
                valid = ['http:', 'https:'].includes(new URL(c.url).protocol);
              } catch {}
              return `<p>${valid ? `<a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.title || c.url)} ↗</a>` : esc(c.url)}<small>原始区间 ${esc(c.start ?? '—')}–${esc(c.end ?? '—')}</small></p>`;
            })
            .join('') || '<p>没有引用标注</p>'
        }<h3>识别证据与审核状态</h3><pre>${pretty(r.annotation)}</pre><p class="caption">规则识别供人工核对，尚未实现批量标注纠错。多语言推荐识别仍可能漏判。</p>${r.status === 'succeeded' && r.searchPerformed ? btn('基于这条样本创建诊断', 'diagnose', r.id, 'primary') : ''}<details><summary>请求摘要 / 重试 / 预算</summary><pre>${pretty({ request: r.requestSummary || null, attempts: r.attempts, reservedUSD: r.reservedUSD, actualBilledUSD: r.actualBilledUSD ?? null })}</pre></details><details><summary>供应商原始 JSON / 案例标识</summary><pre>${pretty(r.raw || null)}</pre></details>`;
    }
    return drawer
      ? `<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="${title}"><div class="drawer-head"><h2>${title}</h2>${btn('关闭 ×', 'close')}</div>${body}</aside></div>`
      : '';
  }
  function download(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function bind() {
    document.querySelectorAll('[data-action]').forEach(
      (button) =>
        (button.onclick = async (e) => {
          const action = button.dataset.action,
            id = button.dataset.id;
          if (action.startsWith('goto-')) {
            page = action.slice(5);
            drawer = '';
            render();
            return;
          }
          if (action === 'nav') {
            page = id;
            drawer = '';
            metricFilter = '';
            render();
            return;
          }
          if (action === 'close') {
            drawer = '';
            render();
            return;
          }
          if (action.endsWith('-open')) {
            drawer = action.slice(0, -5);
            render();
            return;
          }
          if (action === 'select-product') {
            productId = id;
            retrievalResult = null;
            render();
            return;
          }
          if (action === 'select-revision') {
            selectedRevision = id;
            render();
            return;
          }
          if (action === 'metric') {
            metricFilter = id;
            page = 'data';
            rowsShown = 12;
            render();
            return;
          }
          if (action === 'reset-filters') {
            dataFilters = {};
            metricFilter = '';
            render();
            return;
          }
          if (action === 'more') {
            rowsShown += 30;
            render();
            return;
          }
          if (action === 'evidence') {
            selectedRun = id;
            drawer = 'evidence';
            render();
            return;
          }
          if (action === 'backup') {
            download(state, 'geo-workspace.json');
            return;
          }
          if (action === 'export') {
            try {
              download(exportRevision(state, id), 'approved-content-' + id + '.json');
              toast('已导出相同批准快照');
            } catch (error) {
              toast(error.message);
            }
            return;
          }
          if (action === 'refresh') {
            await refresh();
            render();
            return;
          }
          if (action === 'load-example') {
            await act('example');
            origin = 'synthetic';
            productId = '';
            page = 'overview';
            render();
            return;
          }
          if (action === 'withdraw') {
            await act('withdraw', { id });
            return;
          }
          if (action.startsWith('fact-')) {
            await act('fact', { id, decision: action === 'fact-approve' ? 'approve' : 'reject' });
            return;
          }
          if (action.startsWith('plan-')) {
            await act('plan-action', { id, action: action.slice(5) });
            return;
          }
          if (action === 'execute') {
            button.disabled = true;
            button.textContent = '正在请求 API…';
            await act('execute', { id });
            await refresh();
            render();
            return;
          }
          if (action === 'diagnose') {
            const run = state.runs.find((r) => r.id === id);
            const result = await act('diagnose', { runId: id, productId: run.productIds[0] });
            if (result) {
              drawer = '';
              page = 'diagnosis';
              render();
            }
            return;
          }
          if (action === 'create-content') {
            const result = await act('content', { diagnosisId: id });
            if (result) {
              selectedRevision = result.id;
              page = 'content';
              render();
            }
            return;
          }
          if (action === 'rollback') {
            const result = await act('rollback', { id });
            if (result) selectedRevision = result.id;
            render();
          }
        }),
    );
    document.getElementById('global-product').onchange = (e) => {
      productId = e.target.value;
      retrievalResult = null;
      render();
    };
    document.getElementById('global-origin').onchange = (e) => {
      origin = e.target.value;
      render();
    };
    const form = (id, callback) => {
      const f = document.getElementById(id);
      if (f)
        f.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await callback(Object.fromEntries(new FormData(f)), f, e);
          } catch (error) {
            toast(error.message);
          }
        };
    };
    form('data-filter-form', (data) => {
      dataFilters = Object.fromEntries(Object.entries(data).filter(([, v]) => v));
      if (dataFilters.from) dataFilters.from += 'T00:00:00.000Z';
      if (dataFilters.to) dataFilters.to += 'T23:59:59.999Z';
      metricFilter = '';
      render();
    });
    form('workspace-form', async (data) => {
      await act('workspace', data);
      toast('品牌配置已保存；旧计划继续使用原冻结配置');
    });
    form('import-form', async (data) => {
      let payload = data.payload.trim(),
        rows;
      try {
        rows = payload.startsWith('[') ? JSON.parse(payload) : null;
      } catch {
        throw new Error('商品 JSON 格式无效');
      }
      const result = await act('import', {
        name: data.name,
        origin: data.origin,
        url: data.url,
        context: data.context,
        ...(rows ? { rows } : { csv: payload }),
      });
      if (result) {
        drawer = '';
        page = 'knowledge';
        render();
      }
    });
    form('retrieve-form', (data) => {
      retrievalResult = retrieve(state, currentProduct().id, data.query);
      render();
    });
    form('prompt-form', async (data) => {
      await act('prompts', data);
      productId = data.productId;
      render();
    });
    document.querySelectorAll('[data-prompt]').forEach(
      (f) =>
        (f.onsubmit = async (e) => {
          e.preventDefault();
          await act('prompt', {
            id: f.dataset.prompt,
            question: new FormData(f).get('question'),
            approve: true,
          });
        }),
    );
    form('plan-form', async (data, f) => {
      data.productIds = [...f.elements.productIds.selectedOptions].map((x) => x.value);
      await act('plan', data);
    });
    document.querySelectorAll('.segment').forEach(
      (f) =>
        (f.onsubmit = async (e) => {
          e.preventDefault();
          const r = state.revisions.find((r) => r.id === f.dataset.revision);
          await act('edit-content', {
            id: r.id,
            segmentId: f.dataset.segment,
            after: new FormData(f).get('after'),
            decision: e.submitter.value,
            expectedRevision: r.revision,
          });
        }),
    );
    form('approve-form', async (data) => {
      const r = state.revisions.find((r) => r.id === selectedRevision);
      await act('approve-content', {
        id: r.id,
        expectedRevision: r.revision,
        confirmClaims: data.confirmClaims === 'on',
      });
    });
    form('experiment-form', async (data) => {
      const changeAt = new Date(data.changeAt).toISOString();
      await act('experiment', {
        ...data,
        changeAt,
        baselineIds: effectiveRuns(state, { origin: 'real', planId: data.planId })
          .filter((r) => r.at < changeAt)
          .map((r) => r.id),
      });
    });
    const file = document.getElementById('import-file');
    if (file)
      file.onchange = async () => {
        const f = file.files[0];
        if (!f) return;
        try {
          if (f.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
          if (/\.(csv|json)$/i.test(f.name)) {
            document.getElementById('import-rows').value = await f.text();
            return;
          }
          if (!backend) throw new Error('文档解析需要本地后端；离线可使用 CSV/JSON');
          const bytes = new Uint8Array(await f.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: f.name, base64: btoa(binary) }),
          });
          const extracted = await response.json();
          if (!response.ok) throw new Error(extracted.error);
          document.getElementById('import-context').value =
            extracted.text + '\nfile-sha256:' + extracted.fileChecksum;
          if (extracted.rows)
            document.getElementById('import-rows').value = JSON.stringify(extracted.rows, null, 2);
          else {
            document.getElementById('import-rows').value = '';
            toast('已抽取原文；请按 SKU 人工填写商品 JSON 或 CSV，再导入。');
          }
        } catch (error) {
          toast(error.message);
        }
      };
  }
  render();
})();
