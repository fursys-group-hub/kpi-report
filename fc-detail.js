// fc-detail.js — 실패비용 표 (판)하자보수비 '자재'·'클레임 보상' 행 클릭 시 표 아래로 펼치는 분석 (시디즈 포털 fc-detail.js 이식)
// 데이터: cost-detail.json (회사 PC 자동 업데이트가 매일 사내 DB failure_cost_details 에서 뽑아 올림)
// 공개 페이지이므로 클레임 보상은 유형별 월 합계만 — 분개장 건별 내역(적요·손익센터)은 포털(사내 로그인)에서만 제공
//  자재 = AS 출고 시디즈분(ERP 출고처별출고조회(AS), 적요 [시디즈]) + 레터스 AS 자재/재공 무상매입(분개장 1줄)
//  클레임 보상 = 분개장 클레임 보상·클레임 상품권·반품재작업 (관계사 브랜드 제외)
(function () {
  const C_AS = '#2a78d6', C_FREE = '#eb6834', C_TYPES = { '클레임 보상': '#2a78d6', '상품권': '#eb6834', '반품재작업': '#1baf7a' };
  const man = v => Math.round(v / 1e4).toLocaleString('ko-KR');
    const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + man(Math.abs(v));
  const col = v => (v > 0 ? '#d4380d' : v < 0 ? '#2a78d6' : '#6a6a7a');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mOf = ym => +String(ym).slice(5, 7);
  let _year, _kind, _d, _charts = [], _sel = null;

  function close() {
    _charts.forEach(c => c.destroy()); _charts = [];
    const tr = document.getElementById('fcdExpRow');
    if (tr) {
      const head = tr.dataset.head && document.getElementById(tr.dataset.head);
      if (head) { head.rowSpan -= 1; head.style.verticalAlign = ''; head.style.whiteSpace = ''; }
      tr.remove();
    }
    document.querySelectorAll('.cost-prod-row.fcd-open').forEach(r => r.classList.remove('fcd-open', 'open'));
  }

  // '자재'·'클레임 보상' 행 클릭 → 바로 아래로 펼침 (같은 행을 다시 누르면 접힘, 제품 분석이 열려 있으면 닫음)
  async function open(kind, year, row) {
    const wasSame = document.getElementById('fcdExpRow') && _kind === kind;
    close();
    if (window.AsCost) window.AsCost.close();
    if (wasSame || !row || !row.parentNode) return;
    if (window.AsCost && window.AsCost.injectCss) window.AsCost.injectCss();
    _kind = kind; _year = String(year || document.getElementById('costYearSelect')?.value || new Date().getFullYear()); _sel = null;
    const head = document.getElementById('costHazaHead');
    const inGroup = head && row.contains(head);
    const tr = document.createElement('tr'); tr.id = 'fcdExpRow'; tr.dataset.head = inGroup ? 'costHazaHead' : '';
    const td = document.createElement('td'); td.className = 'asc-exp-td';
    td.colSpan = row.cells.length - (inGroup ? 1 : 0);
    tr.appendChild(td); row.after(tr);
    if (!inGroup && head) { head.rowSpan += 1; head.style.verticalAlign = 'top'; head.style.whiteSpace = 'nowrap'; tr.dataset.head = 'costHazaHead'; }
    if (inGroup) { head.rowSpan += 1; head.style.verticalAlign = 'top'; head.style.whiteSpace = 'nowrap'; }
    row.classList.add('open', 'fcd-open');
    const title = kind === 'material' ? '하자보수비 자재 분석' : '하자보수비 클레임 보상 분석';
    td.innerHTML = `<div class="asc-box asc-inline"><div class="asc-head"><div><h3>${_year}년 ${title}</h3><p id="fcdPeriod">불러오는 중...</p></div><button class="asc-close" type="button">▲ 접기</button></div><div id="fcdBody"><div class="asc-empty">⏳ 데이터 불러오는 중...</div></div></div>`;
    td.querySelector('.asc-close').onclick = close;
    // 펼친 영역 폭을 표 바깥 상자 폭에 맞춤 (월 칸이 많은 표에서 오른쪽이 잘리지 않게, 넓은 표는 안에서 가로 스크롤)
    const _wrap = row.closest('.data-table-wrapper'), _box = td.firstElementChild;
    if (_wrap && _box) { _box.style.boxSizing = 'border-box'; _box.style.width = Math.max(320, _wrap.getBoundingClientRect().right - td.getBoundingClientRect().left - 4) + 'px'; }
    try {
      const all = await window.loadCostDetail();
      const same = String(all.year) === String(_year);
      _d = kind === 'material' ? (same ? all.material : { months: [], items: [] }) : { rows: same ? (all.claim || []) : [] };
    } catch (e) { document.getElementById('fcdBody').innerHTML = `<div class="asc-empty">⚠️ ${esc(e.message)}</div>`; return; }
    const empty = kind === 'material' ? !(_d.months || []).length : !(_d.rows || []).length;
    if (empty) {
      document.getElementById('fcdPeriod').textContent = '';
      document.getElementById('fcdBody').innerHTML = `<div class="asc-empty">${_year}년 상세 데이터가 없습니다.<br><span style="font-size:12px">실패비용 가공(품질비용 자동 가공)에서 월 업로드 시 함께 저장됩니다.</span></div>`;
      return;
    }
    kind === 'material' ? renderMaterial() : renderClaim();
  }

  function stackBar(canvasId, months, series, totals) {
    const ds = series.map(([label, color, data], i) => ({
      type: 'bar', label, backgroundColor: color, stack: 's', borderRadius: i === series.length - 1 ? 4 : 0, data: data.map(v => v / 1e6),
      datalabels: i === series.length - 1 ? { anchor: 'end', align: 'end', offset: 2, color: '#1a1a2e', font: { weight: 'bold', size: 11 }, formatter: (v, c) => (totals[c.dataIndex] / 1e6).toFixed(1) } : { display: false },
    }));
    const avg = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    ds.push({ type: 'line', label: '월평균', data: months.map(() => avg / 1e6), borderColor: '#8a8a98', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, datalabels: { display: false } });
    _charts.push(new Chart(document.getElementById(canvasId), {
      data: { labels: months.map(m => m + '월'), datasets: ds },
      plugins: window.ChartDataLabels ? [ChartDataLabels] : [],
      options: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } },
        onClick: (e, els) => { if (els.length && _kind === 'material') { _sel = months[els[0].index]; showWhy(_sel); } },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Math.round(c.raw * 100).toLocaleString()}만원`, footer: it => `합계 ${man(totals[it[0].dataIndex])}만원${_kind === 'material' ? ' · 막대를 누르면 아래에 상세' : ''}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '백만원' }, suggestedMax: Math.max(...totals) / 1e6 * 1.15 } },
      },
    }));
  }

  // ── 자재 ─────────────────────────────────────────────────────────────────
  function renderMaterial() {
    const ms = [...new Set(_d.months.map(r => mOf(r.year_month)))].sort((a, b) => a - b);
    const asA = ms.map(m => _d.months.filter(r => mOf(r.year_month) === m && r.src === 'as_issue').reduce((s, r) => s + Number(r.amt), 0));
    const frA = ms.map(m => _d.months.filter(r => mOf(r.year_month) === m && r.src === 'free_purchase').reduce((s, r) => s + Number(r.amt), 0));
    const tot = ms.map((m, i) => asA[i] + frA[i]);
    const T = tot.reduce((a, b) => a + b, 0), TA = asA.reduce((a, b) => a + b, 0), TF = frA.reduce((a, b) => a + b, 0);
    const pk = tot.indexOf(Math.max(...tot)), last = ms[ms.length - 1];
    document.getElementById('fcdPeriod').textContent = `${_year}년 ${ms[0]}~${last}월 · 자재 = AS 출고 시디즈분(ERP 출고처별출고조회(AS), 적요 [시디즈]) + 레터스 AS 자재/재공 무상매입(분개장)`;
    const kpis = [
      ['자재비 누적', man(T) + '만원', `${ms[0]}~${last}월 · 월평균 ${man(T / ms.length)}만원`],
      ['AS 출고 (시디즈)', man(TA) + '만원', `비중 ${pct(TA, T)}`],
      ['레터스 무상매입', man(TF) + '만원', `비중 ${pct(TF, T)}`],
      ['최고 월', ms[pk] + '월', `${man(tot[pk])}만원`],
    ].map(k => `<div class="asc-kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('');
    document.getElementById('fcdBody').innerHTML = `
<div class="asc-kpis">${kpis}</div>
<div class="asc-card"><h4>① 월별 자재비 — AS 출고 vs 레터스 무상매입</h4><p class="sub">막대 위 숫자는 월 합계(백만원) · 점선은 월평균 · <b>막대를 누르면 그 달의 전월 대비 증감 품목</b>이 아래에 나옵니다</p>
  <div style="height:280px"><canvas id="fcdMonth"></canvas></div>
  <div class="asc-tw" style="margin-top:10px"><table class="asc-t" id="fcdMonthT"></table></div></div>
<div class="asc-card"><h4>② 분류 × 월 AS 출고 히트맵 (출고금액 상위 10개 분류)</h4><p class="sub">단위: 만원 · ERP 카테고리(중) 기준 · <b>칸을 누르면 그 분류의 전월 대비 증감 품목</b></p>
  <div class="asc-tw"><table class="asc-t asc-hm" id="fcdHeat"></table></div></div>
<div class="asc-card"><h4>③ 전월 대비 증감 품목 (AS 출고)</h4><p class="sub" id="fcdWhySub"></p><div id="fcdWhy"></div></div>
<div class="asc-note">· AS 출고: ERP '출고처별출고조회(AS)'에서 적요에 [시디즈]가 있는 건, 출고일 월 기준 출고금액(출고일이 빈 행은 위 행 날짜). 분개장의 '자재 AS 출고' 행은 관계사가 섞여 있어 이 파일로 대체합니다.<br>
· 레터스 무상매입: 분개장 '레터스(구 바로스) AS 자재/재공 무상매입 청구건' 한 줄이라 품목 내역이 없습니다. 품목별로 보려면 레터스 청구 내역이 필요합니다.<br>
· 월 합계는 실패비용 표의 '자재'와 같습니다.</div>`;
    stackBar('fcdMonth', ms, [['AS 출고 (시디즈)', C_AS, asA], ['레터스 무상매입', C_FREE, frA]], tot);
    const row = (name, arr, cls = '') => `<tr class="${cls}"><td>${name}</td>${arr.map(v => `<td>${man(v)}</td>`).join('')}<td>${man(arr.reduce((a, b) => a + b, 0))}</td></tr>`;
    let h = '<tr><th>구분 (만원)</th>' + ms.map(m => `<th>${m}월</th>`).join('') + '<th>합계</th></tr>';
    h += row('AS 출고 (시디즈)', asA) + row('레터스 무상매입', frA) + row('합계', tot, 'tot');
    h += `<tr><td>전월 대비</td>${tot.map((v, i) => `<td style="color:${i ? col(v - tot[i - 1]) : '#6a6a7a'}">${i ? sgn(v - tot[i - 1]) : '-'}</td>`).join('')}<td></td></tr>`;
    h += `<tr><td>AS 출고 건수</td>${ms.map(m => `<td>${_d.months.filter(r => mOf(r.year_month) === m && r.src === 'as_issue').reduce((s, r) => s + r.n, 0)}</td>`).join('')}<td></td></tr>`;
    document.getElementById('fcdMonthT').innerHTML = h;
    drawHeat(ms);
    showWhy(last);
  }
  function itemsOf(m, cat) { return _d.items.filter(r => mOf(r.year_month) === m && (!cat || r.cat2 === cat)); }
  function drawHeat(ms) {
    const cats = {}; _d.items.forEach(r => { cats[r.cat2] = (cats[r.cat2] || 0) + Number(r.amt); });
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const cell = (c, m) => itemsOf(m, c).reduce((s, r) => s + Number(r.amt), 0);
    const mx = Math.max(1, ...top.flatMap(c => ms.map(m => cell(c, m))));
    let h = '<tr><th>분류</th>' + ms.map(m => `<th>${m}월</th>`).join('') + '<th>합계</th></tr>';
    top.forEach(c => {
      h += `<tr><td>${esc(c)}</td>` + ms.map(m => { const v = cell(c, m), a = v / mx; return `<td data-c="${esc(c)}" data-m="${m}" style="cursor:pointer;background:rgba(42,120,214,${(a * 0.75).toFixed(2)});color:${a > 0.55 ? '#fff' : '#1a1a2e'}">${v ? man(v) : '-'}</td>`; }).join('') + `<td>${man(cats[c])}</td></tr>`;
    });
    const t = document.getElementById('fcdHeat'); t.innerHTML = h;
    t.querySelectorAll('td[data-m]').forEach(td => { td.onclick = () => showWhy(+td.dataset.m, td.dataset.c); });
  }
  function showWhy(m, cat) {
    const ms = [...new Set(_d.months.map(r => mOf(r.year_month)))].sort((a, b) => a - b);
    const p = ms.includes(m - 1) ? m - 1 : null;
    const g = {};
    const add = (r, k) => { const id = r.name; const o = (g[id] = g[id] || { name: r.name, cat: r.cat2, x: 0, xq: 0, p: 0, pq: 0 }); o[k] += Number(r.amt); o[k + 'q'] += Number(r.qty) || 0; };
    itemsOf(m, cat).forEach(r => add(r, 'x')); if (p) itemsOf(p, cat).forEach(r => add(r, 'p'));
    const list = Object.values(g).map(o => ({ ...o, d: o.x - o.p })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 15);
    const sx = itemsOf(m, cat).reduce((s, r) => s + Number(r.amt), 0), sp = p ? itemsOf(p, cat).reduce((s, r) => s + Number(r.amt), 0) : 0;
    const fr = k => _d.months.filter(r => mOf(r.year_month) === k && r.src === 'free_purchase').reduce((s, r) => s + Number(r.amt), 0);
    document.getElementById('fcdWhySub').innerHTML = `${cat ? `<b>${esc(cat)}</b> · ` : ''}${m}월${p ? ` vs ${p}월` : ''} · 금액 단위 만원(수량) · 증감이 큰 순 15개${cat ? ' · <a href="#" id="fcdAll">전체 분류 보기</a>' : ''}`;
    const fl = !cat && p ? `<div style="font-size:12.5px;margin-bottom:6px">레터스 무상매입 ${p}월 ${man(fr(p))}만원 → ${m}월 ${man(fr(m))}만원 · <b style="color:${col(fr(m) - fr(p))}">${sgn(fr(m) - fr(p))}만원</b> <span style="color:#8a8a98">(품목 내역 없음)</span></div>` : '';
    document.getElementById('fcdWhy').innerHTML = `${fl}<div style="font-size:13px;margin-bottom:6px">AS 출고${cat ? ` · ${esc(cat)}` : ''} ${p ? `${p}월 ${man(sp)}만원 → ` : ''}${m}월 ${man(sx)}만원${p ? ` · <b style="color:${col(sx - sp)}">${sgn(sx - sp)}만원</b>` : ''}</div>
      <div class="asc-tw"><table class="asc-t"><tr><th>품목 (자재명)</th>${cat ? '' : '<th>분류</th>'}${p ? `<th>${p}월</th>` : ''}<th>${m}월</th>${p ? '<th>증감</th>' : ''}</tr>
      ${list.map(o => `<tr><td style="white-space:normal;min-width:220px">${esc(o.name)}</td>${cat ? '' : `<td>${esc(o.cat)}</td>`}${p ? `<td>${o.p ? man(o.p) + ` (${o.pq})` : '-'}</td>` : ''}<td>${o.x ? man(o.x) + ` (${o.xq})` : '-'}</td>${p ? `<td style="font-weight:700;color:${col(o.d)}">${sgn(o.d)}</td>` : ''}</tr>`).join('')}</table></div>`;
    const a = document.getElementById('fcdAll'); if (a) a.onclick = e => { e.preventDefault(); showWhy(m); };
  }

  // ── 클레임 보상 (유형별 월 합계) ─────────────────────────────────────────
  function renderClaim() {
    const R = _d.rows.map(r => ({ m: mOf(r.year_month), type: r.type, amount: Number(r.amount), n: Number(r.n) || 0 }));
    const ms = [...new Set(R.map(r => r.m))].sort((a, b) => a - b), last = ms[ms.length - 1];
    const types = Object.keys(C_TYPES).filter(t => R.some(r => r.type === t));
    const amtOf = f => R.filter(f).reduce((s, r) => s + r.amount, 0), cntOf = f => R.filter(f).reduce((s, r) => s + r.n, 0);
    const tot = ms.map(m => amtOf(r => r.m === m));
    const T = tot.reduce((a, b) => a + b, 0), N = cntOf(() => true), pk = tot.indexOf(Math.max(...tot));
    document.getElementById('fcdPeriod').textContent = `${_year}년 ${ms[0]}~${last}월 · 분개장 (판)하자보수비 중 클레임 보상·클레임 상품권·반품재작업 (일룸·퍼시스·데스커·알로소 브랜드 건 제외)`;
    const kpis = [
      ['클레임 보상 누적', man(T) + '만원', `${N}건 · 월평균 ${man(T / ms.length)}만원`],
      ...types.slice(0, 2).map(t => [t, man(amtOf(r => r.type === t)) + '만원', `비중 ${pct(amtOf(r => r.type === t), T)} · ${cntOf(r => r.type === t)}건`]),
      ['최고 월', ms[pk] + '월', `${man(tot[pk])}만원`],
    ].map(k => `<div class="asc-kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('');
    document.getElementById('fcdBody').innerHTML = `
<div class="asc-kpis">${kpis}</div>
<div class="asc-card"><h4>① 월별 클레임 보상 — 유형별</h4><p class="sub">막대 위 숫자는 월 합계(백만원) · 점선은 월평균</p>
  <div style="height:260px"><canvas id="fcdMonth"></canvas></div>
  <div class="asc-tw" style="margin-top:10px"><table class="asc-t" id="fcdMonthT"></table></div></div>
<div class="asc-note">· 원본: 매월 실패비용 가공에 올리는 (판)하자보수비 분개장. 소파사업부·적요 '하자보수비' 행 제외, 일룸·퍼시스·데스커·알로소 '브랜드' 클레임 건 제외 (실패비용 표와 같은 기준). 금액 = 차변 − 대변.<br>· 월 합계는 실패비용 표의 '클레임 보상'과 같습니다.<br>· 분개장 건별 내역은 시디즈 품질 포털(사내 로그인)에서 볼 수 있습니다.</div>`;
    stackBar('fcdMonth', ms, types.map(t => [t, C_TYPES[t], ms.map(m => amtOf(r => r.m === m && r.type === t))]), tot);
    const row = (name, arr, cls = '') => `<tr class="${cls}"><td>${name}</td>${arr.map(v => `<td>${man(v)}</td>`).join('')}<td>${man(arr.reduce((a, b) => a + b, 0))}</td></tr>`;
    let h = '<tr><th>구분 (만원)</th>' + ms.map(m => `<th>${m}월</th>`).join('') + '<th>합계</th></tr>';
    types.forEach(t => { h += row(t, ms.map(m => amtOf(r => r.m === m && r.type === t))); });
    h += row('합계', tot, 'tot');
    h += `<tr><td>전월 대비</td>${tot.map((v, i) => `<td style="color:${i ? col(v - tot[i - 1]) : '#6a6a7a'}">${i ? sgn(v - tot[i - 1]) : '-'}</td>`).join('')}<td></td></tr>`;
    h += `<tr><td>건수</td>${ms.map(m => `<td>${cntOf(r => r.m === m)}</td>`).join('')}<td>${N}</td></tr>`;
    document.getElementById('fcdMonthT').innerHTML = h;
  }

  window.FcDetail = { open, close };
})();
