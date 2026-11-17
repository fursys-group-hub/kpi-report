// AS 제품 조치비용 분석 — 실패비용 표 '제품' 클릭 시 표 아래로 펼침 (시디즈 포털 as-cost.js 이식)
// 데이터: cost-detail.json — 회사 PC 자동 업데이트(run-update.ps1)가 매일 사내 DB에서 뽑아 올림 (export-cost-detail.js)
// 고객명·건명은 포함하지 않음
(function () {
  // cost-detail.json 한 번만 받아 두고 제품·자재·클레임 보상 분석이 함께 사용
  let _detailP = null;
  window.loadCostDetail = () => (_detailP = _detailP || fetch('cost-detail.json?t=' + Date.now(), { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('상세 데이터 파일을 불러오지 못했습니다 (' + r.status + ')'); return r.json(); })
    .catch(e => { _detailP = null; throw e; }));
  const C_ACT = '#2a78d6', C_REF = '#eb6834', C_CNT = '#eb6834';

  // 단품코드 앞자리 → 모델·대분류 (AS조치비용_분석_2026년1-9월 기준, 품질포털 제품명 확정 규칙)
  const RULES = [
    [/^SERVICE/, '반품재작업', '반품재작업'],
    [/^T9/, 'T90', '오피스'],
    [/^T80/, 'T80', '오피스'],
    [/^T62/, 'T60 AIR', '오피스'],
    [/^(T61|PACPCHACC)/, 'T60', '오피스'],
    [/^(T52|T53|TXA520|VTXA520|VTXB520|PCOTX520)/, 'T50 AIR', '오피스'],
    [/^VPCOTNB50L/, 'T50 LIGHT', '오피스'],
    [/^(T50|T51|T55|T509|T529|TNE500|VTNE500|VTNF500|VOALTNF500|PWT500)/, 'T50', '오피스'],
    [/^(TXNA250|T250)/, 'T25 리니에', '오피스'],
    [/^(T402|TNB402)/, 'T40', '오피스'],
    [/^(T20|T21|VG212A|VGDG|VOPCW|VTNB200)/, 'T20', '오피스'],
    [/^G10/, 'GC PRO', '게이밍'],
    [/^(G20|RG20)/, 'GX', '게이밍'],
    [/^(S50|S51|VS509|VSNB509|VPCOSNA500)/, '링고', '키즈'],
    [/^S40/, '트레보', '키즈'],
    [/^(S60|RS60)/, '아이블', '키즈'],
    [/^K30/, '아띠', '키즈'],
    [/^K50/, '몰티', '키즈'],
    [/^SB01/, '스테포(발받침)', '키즈'],
    [/^(TN60|M20SFU)/, '에가', '라이프스타일'],
    [/^(M80|MN80)/, '버튼', '라이프스타일'],
    [/^(M130|MN130)/, '펑거스', '라이프스타일'],
    [/^M17/, '위(OUI)', '라이프스타일'],
    [/^(M090|PCOM090)/, '필로', '라이프스타일'],
    [/^L10/, '뮤브', '라이프스타일'],
    [/^(M071|MN021)/, '시디즈체어(M071/M02)', '라이프스타일'],
    [/^(S00|T00|VG113|VG211)/, '공용부품(캐스터·베이스·실린더)', '공용부품'],
  ];
  function classify(code) {
    const c = String(code || '').trim().toUpperCase();
    for (const [re, m, g] of RULES) if (re.test(c)) return [m, g];
    return ['미분류(' + (c || '-') + ')', '기타'];
  }

  const man = v => Math.round(v / 1e4).toLocaleString('ko-KR');
  const mil = v => (v / 1e6).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
  let _rows = [], _year = '', _charts = [], _lvl = 'model';

  function injectCss() {
    if (document.getElementById('asCostCss')) return;
    const s = document.createElement('style'); s.id = 'asCostCss';
    s.textContent = `
.asc-ov{position:fixed;inset:0;background:rgba(10,12,30,.45);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:28px 16px}
.asc-box{background:#fff;border-radius:14px;width:min(1180px,100%);box-shadow:0 18px 50px rgba(0,0,0,.25);padding:22px 26px 26px;color:#1a1a2e}
.asc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px}
.asc-head h3{margin:0;font-size:19px}
.asc-head p{margin:4px 0 0;font-size:12px;color:#6a6a7a}
.asc-close{border:1px solid #d8d8e0;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px}
.asc-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 4px}
.asc-kpi{border:1px solid #e6e6ee;border-radius:10px;padding:12px 14px}
.asc-kpi .l{font-size:11.5px;color:#6a6a7a}.asc-kpi .v{font-size:22px;font-weight:700;margin-top:2px}.asc-kpi .d{font-size:11px;color:#8a8a98}
.asc-card{border:1px solid #e6e6ee;border-radius:12px;padding:16px 18px;margin-top:14px}
.asc-card h4{margin:0 0 2px;font-size:15px}.asc-card .sub{margin:0 0 10px;font-size:12px;color:#6a6a7a}
.asc-tw{overflow-x:auto}
.asc-t{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.asc-t th,.asc-t td{padding:6px 7px;border-bottom:1px solid #eeeef3;text-align:right;white-space:nowrap}
.asc-t th{color:#4a4a5a;font-weight:600;background:#f7f7fa}
.asc-t td:first-child,.asc-t th:first-child{text-align:left}
.asc-t tr.tot td{font-weight:700;border-top:2px solid #d8d8e0}
.asc-hm td{text-align:center}.asc-hm td:first-child{text-align:left;font-weight:600}
.asc-tg{display:inline-flex;border:1px solid #d8d8e0;border-radius:8px;overflow:hidden;margin-bottom:8px}
.asc-tg button{border:0;background:#fff;color:#4a4a5a;padding:5px 12px;font-size:12px;cursor:pointer}
.asc-tg button.on{background:#002BD2;color:#fff}
.asc-note{font-size:11.5px;color:#6a6a7a;line-height:1.7;margin-top:14px}
.asc-empty{padding:40px;text-align:center;color:#6a6a7a}
@media (max-width:760px){.asc-kpis{grid-template-columns:1fr 1fr}.asc-box{padding:16px}}
.cost-prod-row{cursor:pointer}
.cost-prod-row td#costHazaHead{cursor:default}
.data-table tr.cost-prod-row:hover td:not(#costHazaHead){background:rgba(0,43,210,.07)}
.data-table tr.cost-prod-row.open td:not(#costHazaHead){background:rgba(0,43,210,.09);font-weight:700}
#ascExpRow td.asc-exp-td,#fcdExpRow td.asc-exp-td{padding:0!important;text-align:left!important;white-space:normal!important;font-family:'Noto Sans KR',sans-serif!important;font-size:13px!important;background:#f3f5fb!important;border-bottom:2px solid #002BD2!important;cursor:default}
#ascExpRow .asc-inline,#fcdExpRow .asc-inline{width:auto;max-width:none;box-shadow:none;border-radius:0;background:transparent;padding:18px 22px 22px}
#ascExpRow .asc-card,#ascExpRow .asc-kpi,#fcdExpRow .asc-card,#fcdExpRow .asc-kpi{background:#fff}
#ascExpRow table.asc-t th,#ascExpRow table.asc-t td,#fcdExpRow table.asc-t th,#fcdExpRow table.asc-t td{padding:6px 7px!important;font-size:12px!important;font-family:'Noto Sans KR',sans-serif!important;text-align:right;white-space:nowrap;border-bottom:1px solid #eeeef3;font-weight:inherit}
#ascExpRow table.asc-t th,#fcdExpRow table.asc-t th{font-weight:600;color:#4a4a5a;background:#f7f7fa}
#ascExpRow table.asc-t td:first-child,#ascExpRow table.asc-t th:first-child,#fcdExpRow table.asc-t td:first-child,#fcdExpRow table.asc-t th:first-child{text-align:left}
#ascExpRow table.asc-hm td,#fcdExpRow table.asc-hm td{text-align:center}#ascExpRow table.asc-hm td:first-child,#fcdExpRow table.asc-hm td:first-child{text-align:left;font-weight:600}
#ascExpRow table.asc-t tr.tot td,#fcdExpRow table.asc-t tr.tot td{font-weight:700}`;
    document.head.appendChild(s);
  }

  // 사유 = 클레임 판정 + 판정내용(없으면 불량부위) — 건명 접수번호로 고객클레임과 연결
  // 판정(claims) → 판정 전 접수(claims_receipt) 불량유형 → 둘 다 없으면 기록 없음
  function reasonOf(r) {
    if (r.link === 'claim' || r.link === 'claim_rno') {
      const t = String(r.inspection_result || '').trim() || String(r.defective_part || '').trim() || r.defect_type || '-';
      return `[${r.category}] ${t.replace(/\s+/g, ' ')}`;
    }
    if (r.link === 'receipt') return `[판정 전·접수 불량유형] ${r.receipt_defect || '미기재'}`;
    return `[판정·접수 기록 없음] ${r.action_type || '조치'}`;
  }

  async function fetchRows(year) {
    const d = await window.loadCostDetail();
    const all = String(d.year) === String(year) ? (d.product || []) : [];
    return all.map(r => {
      const [model, group] = classify(r.item_code);
      return { m: +String(r.year_month).slice(5, 7), q: Number(r.qty) || 0, amt: Number(r.supply_amt) || 0,
        type: r.action_type || '조치', model, group, link: r.link || 'none',
        cat: r.category || (r.link === 'receipt' ? '판정 전' : '기록 없음'), reason: reasonOf(r) };
    });
  }

  function close() {
    _charts.forEach(c => c.destroy()); _charts = [];
    const tr = document.getElementById('ascExpRow');
    if (tr) {
      const head = tr.dataset.head && document.getElementById(tr.dataset.head);
      if (head) { head.rowSpan -= 1; head.style.verticalAlign = ''; head.style.whiteSpace = ''; }
      tr.remove();
    }
    document.querySelectorAll('.cost-prod-row.open').forEach(r => r.classList.remove('open'));
  }

  // 실패비용 표 '제품' 행 클릭 → 바로 아래 행으로 펼침 (다시 누르면 접힘)
  async function open(year, row) {
    injectCss();
    if (window.FcDetail) window.FcDetail.close();   // 자재·클레임 보상 분석이 열려 있으면 닫음
    if (document.getElementById('ascExpRow')) { close(); return; }
    _year = String(year || document.getElementById('costYearSelect')?.value || new Date().getFullYear());
    if (!row || !row.parentNode) return;
    const head = document.getElementById('costHazaHead');
    const inGroup = head && row.contains(head);
    const tr = document.createElement('tr'); tr.id = 'ascExpRow'; tr.dataset.head = inGroup ? 'costHazaHead' : '';
    const td = document.createElement('td'); td.className = 'asc-exp-td';
    td.colSpan = row.cells.length - (inGroup ? 1 : 0);
    tr.appendChild(td); row.after(tr);
    if (inGroup) { head.rowSpan += 1; head.style.verticalAlign = 'top'; head.style.whiteSpace = 'nowrap'; }
    row.classList.add('open');
    td.innerHTML = `<div class="asc-box asc-inline"><div class="asc-head"><div><h3>${_year}년 AS 제품 조치비용 분석</h3><p id="ascPeriod">불러오는 중...</p></div><button class="asc-close" type="button">▲ 접기</button></div><div id="ascBody"><div class="asc-empty">⏳ 데이터 불러오는 중...</div></div></div>`;
    td.querySelector('.asc-close').onclick = close;
    // 펼친 영역 폭을 표 바깥 상자 폭에 맞춤 (월 칸이 많은 표에서 오른쪽이 잘리지 않게, 넓은 표는 안에서 가로 스크롤)
    const _wrap = row.closest('.data-table-wrapper'), _box = td.firstElementChild;
    if (_wrap && _box) { _box.style.boxSizing = 'border-box'; _box.style.width = Math.max(320, _wrap.getBoundingClientRect().right - td.getBoundingClientRect().left - 4) + 'px'; }
    try {
      _rows = await fetchRows(_year);
    } catch (e) {
      document.getElementById('ascBody').innerHTML = `<div class="asc-empty">⚠️ ${e.message}</div>`; return;
    }
    if (!_rows.length) {
      document.getElementById('ascPeriod').textContent = '';
      document.getElementById('ascBody').innerHTML = `<div class="asc-empty">${_year}년 AS 조치 데이터가 없습니다.<br><span style="font-size:12px">매출량 업로드(거래명세서 발행내역)에서 파일을 올리면 함께 저장됩니다.</span></div>`;
      return;
    }
    render();
  }

  function render() {
    const R = _rows;
    const months = [...new Set(R.map(r => r.m))].sort((a, b) => a - b);
    const M = months.length, last = months[M - 1];
    const sum = (arr, f = r => r.amt) => arr.reduce((s, r) => s + f(r), 0);
    const T = { n: R.length, q: sum(R, r => r.q), amt: sum(R) };
    const byM = m => R.filter(r => r.m === m);
    const mAmt = months.map(m => sum(byM(m)));
    const peakI = mAmt.indexOf(Math.max(...mAmt));
    const ref = R.filter(r => r.type === '환불');
    document.getElementById('ascPeriod').textContent =
      `${_year}년 ${months[0]}~${last}월 · 거래명세서 발행내역 · 브랜드 시디즈 · 하자조치내수 · 매출형태 A/S용 · 공급가액(부가세 별도)`;

    const kpis = [
      ['총 조치비용', man(T.amt) + '만원', `${months[0]}~${last}월 공급가액`],
      ['조치 건수', T.n.toLocaleString() + '건', `수량 ${T.q.toLocaleString()}개`],
      ['월평균 비용', man(T.amt / M) + '만원', `최고 ${months[peakI]}월 ${man(mAmt[peakI])}만원`],
      ['환불 비중 (비용)', pct(sum(ref), T.amt), `${ref.length}건 · ${man(sum(ref))}만원`],
    ].map(k => `<div class="asc-kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('');

    document.getElementById('ascBody').innerHTML = `
<div class="asc-kpis">${kpis}</div>
<div class="asc-card"><h4>① 월별 조치비용</h4><p class="sub">처리유형별 누적 · 막대 위 숫자는 월 합계(백만원) · 점선은 월평균</p>
  <div style="height:300px"><canvas id="ascMonth"></canvas></div>
  <div class="asc-tw" style="margin-top:10px"><table class="asc-t" id="ascMonthT"></table></div></div>
<div class="asc-card"><h4>③ 제품군별 비교 — 비용 비중과 건수 비중</h4><p class="sub">같은 제품군에서 비용 비중(파랑)과 건수 비중(주황)이 크게 다르면 건당 비용이 비싸거나 싼 제품군입니다</p>
  <div class="asc-tg" id="ascLvl"><button data-v="model">모델별 (상위 15)</button><button data-v="group">대분류별</button></div>
  <div id="ascCmpWrap"><canvas id="ascCmp"></canvas></div>
  <div class="asc-tw" style="margin-top:10px;max-height:320px;overflow-y:auto"><table class="asc-t" id="ascCmpT"></table></div></div>
<div class="asc-card"><h4>④ 모델 × 월 조치비용 히트맵 (비용 상위 10개 모델)</h4><p class="sub">단위: 만원 · 색이 진할수록 비용이 큽니다 · <b>칸을 누르면 그 달의 전월 대비 증감 사유</b>, 모델명을 누르면 마지막 월 기준 사유가 아래에 나옵니다</p>
  <div class="asc-tw"><table class="asc-t asc-hm" id="ascHeat"></table></div>
  <div id="ascWhy" style="margin-top:14px"></div></div>
<div class="asc-note">· 원본: 매월 업로드하는 거래명세서 발행내역 중 브랜드구분 '시디즈' · 일반사업소 '하자조치내수' · 매출형태 'A/S용' · 매출수량 마이너스(-) 제외. 월은 매출일자 기준, 비용은 공급가액(부가세 별도).<br>
· 처리유형: 건명에 '환불'이 있으면 환불, 나머지는 조치. 건수 = 품목 라인 수. 모델·대분류는 단품코드 앞자리로 분류(품질포털 제품명 확정 규칙).<br>
· 증감 사유: 건명의 접수번호(P+12자리-순번)로 고객클레임(판정)과 연결해 [판정] 판정내용으로 묶었습니다. 순번이 달라도 같은 접수번호면 연결합니다. 아직 판정 전(부품만 전달·회수 전 등)이면 접수 데이터의 불량유형을, 판정·접수 기록이 모두 없으면(주로 2월 중순 이전 접수) '기록 없음'으로 표시합니다.<br>
· 실패비용 표의 '제품'(분개장 하자보수비)과는 집계 기준이 달라 금액이 일치하지 않을 수 있습니다.<br>
· 상세 데이터는 매일 1회(오전) 사내 DB에서 갱신됩니다.</div>`;

    drawMonth(months, byM, sum, T, M);
    document.querySelectorAll('#ascLvl button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === _lvl);
      b.onclick = () => { _lvl = b.dataset.v; document.querySelectorAll('#ascLvl button').forEach(x => x.classList.toggle('on', x === b)); drawCmp(T); };
    });
    drawCmp(T);
    drawHeat(months);
    showTop3(months);
  }

  // ── 증감 사유 ──
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + man(Math.abs(v));
  function cmp(model, m) {
    const months = [...new Set(_rows.map(r => r.m))].sort((a, b) => a - b);
    const p = months.includes(m - 1) ? m - 1 : null;
    const X = _rows.filter(r => r.model === model && r.m === m);
    const P = p ? _rows.filter(r => r.model === model && r.m === p) : [];
    const g = {};
    // 띄어쓰기·'건'만 다른 같은 문구는 하나로 묶음 (예: 단순변심 / 단순 변심 / 단순변심 환불건)
    const key = s => s.replace(/\s|,/g, '').replace(/(환불)?건$/, '');
    const add = (r, k) => { const id = key(r.reason); const o = (g[id] = g[id] || { k: r.reason, x: 0, xn: 0, p: 0, pn: 0 }); o[k] += r.amt; o[k + 'n'] += 1; };
    X.forEach(r => add(r, 'x')); P.forEach(r => add(r, 'p'));
    const list = Object.values(g).map(o => ({ ...o, d: o.x - o.p })).filter(o => o.d !== 0 || o.x > 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const sx = X.reduce((s, r) => s + r.amt, 0), sp = P.reduce((s, r) => s + r.amt, 0);
    return { model, m, p, X, P, sx, sp, d: sx - sp, list, bulk: X.filter(r => r.q >= 5).sort((a, b) => b.amt - a.amt) };
  }
  function whyHtml(c, limit) {
    const head = c.p
      ? `<b>${esc(c.model)}</b> ${c.m}월 ${man(c.sx)}만원(${c.X.length}건) ← ${c.p}월 ${man(c.sp)}만원(${c.P.length}건) · <b style="color:${c.d >= 0 ? '#d4380d' : '#2a78d6'}">${sgn(c.d)}만원</b>`
      : `<b>${esc(c.model)}</b> ${c.m}월 ${man(c.sx)}만원(${c.X.length}건) · 비교할 전월 없음`;
    const amtOf = f => c.X.filter(f).reduce((s, r) => s + r.amt, 0);
    const lk = { j: amtOf(r => r.link === 'claim' || r.link === 'claim_rno'), r: amtOf(r => r.link === 'receipt'), n: amtOf(r => r.link === 'none') };
    const cg = {};
    c.X.forEach(r => { cg[r.cat] = (cg[r.cat] || 0) + r.amt; });
    c.P.forEach(r => { cg[r.cat] = (cg[r.cat] || 0) - r.amt; });
    const catLine = Object.entries(cg).filter(([, v]) => Math.round(v / 1e4)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5)
      .map(([k, v]) => `${esc(k)} <b style="color:${v >= 0 ? '#d4380d' : '#2a78d6'}">${sgn(v)}</b>`).join(' · ');
    const bulk = c.bulk.length ? `<div style="margin:6px 0;font-size:12px;color:#ad4e00">⚠ 대량 단건: ${c.bulk.map(r => `${r.type} 1건 ${r.q}개 ${man(r.amt)}만원 — ${esc(r.reason)}`).join(' / ')}</div>` : '';
    const rows = c.list.slice(0, limit).map(o => `<tr><td style="white-space:normal;min-width:260px">${esc(o.k)}</td>${c.p ? `<td>${o.p ? man(o.p) + ` (${o.pn})` : '-'}</td>` : ''}<td>${o.x ? man(o.x) + ` (${o.xn})` : '-'}</td>${c.p ? `<td style="font-weight:700;color:${o.d >= 0 ? '#d4380d' : '#2a78d6'}">${sgn(o.d)}</td>` : ''}</tr>`).join('');
    return `<div style="border:1px solid #e6e6ee;border-radius:10px;padding:12px 14px;margin-top:10px">
      <div style="font-size:13.5px">${head}</div>
      ${c.p && catLine ? `<div style="font-size:12.5px;margin-top:4px">판정별 증감(만원): ${catLine}</div>` : ''}
      <div style="font-size:11.5px;color:#6a6a7a;margin-top:2px">${c.m}월 금액 중 판정 연결 ${pct(lk.j, c.sx)}${lk.r ? ` · 판정 전(접수 불량유형) ${pct(lk.r, c.sx)}` : ''}${lk.n ? ` · 기록 없음 ${pct(lk.n, c.sx)}` : ''}</div>${bulk}
      <table class="asc-t" style="margin-top:6px"><tr><th>사유 ([판정] 판정내용)</th>${c.p ? `<th>${c.p}월 (건)</th>` : ''}<th>${c.m}월 (건)</th>${c.p ? '<th>증감 (만원)</th>' : ''}</tr>${rows}</table></div>`;
  }
  function showTop3(months) {
    const box = document.getElementById('ascWhy'); if (!box) return;
    const last = months[months.length - 1];
    if (!months.includes(last - 1)) { box.innerHTML = ''; return; }
    const models = [...new Set(_rows.map(r => r.model))];
    const top = models.map(mo => cmp(mo, last)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
    box.innerHTML = `<h4 style="margin:0;font-size:14.5px">⑤ 전월 대비 증감 상위 3품목 (${last}월 vs ${last - 1}월)</h4>
      <p class="sub" style="margin:2px 0 0">금액 증감이 큰 순 · 사유는 증감이 큰 순으로 5개까지</p>` + top.map(c => whyHtml(c, 5)).join('');
  }
  function showCell(model, m) {
    const box = document.getElementById('ascWhy'); if (!box) return;
    const months = [...new Set(_rows.map(r => r.m))].sort((a, b) => a - b);
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h4 style="margin:0;font-size:14.5px">선택: ${esc(model)} ${m}월 증감 사유</h4>
      <button type="button" class="asc-close" id="ascBack">↩ 증감 상위 3품목 보기</button></div>` + whyHtml(cmp(model, m), 12);
    document.getElementById('ascBack').onclick = () => showTop3(months);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function agg(rows, key) {
    const o = {};
    rows.forEach(r => { const k = key(r); (o[k] = o[k] || { k, n: 0, q: 0, amt: 0, g: r.group }); o[k].n++; o[k].q += r.q; o[k].amt += r.amt; });
    return Object.values(o).sort((a, b) => b.amt - a.amt);
  }

  function drawMonth(months, byM, sum, T, M) {
    const types = [['조치', C_ACT], ['환불', C_REF], ['반품재작업', '#1baf7a']].filter(([t]) => _rows.some(r => r.type === t));
    const tot = months.map(m => sum(byM(m)));
    const avg = T.amt / M;
    const ds = types.map(([t, c], i) => ({
      type: 'bar', label: t, backgroundColor: c, stack: 's', borderRadius: i === types.length - 1 ? 4 : 0,
      data: months.map(m => sum(byM(m).filter(r => r.type === t)) / 1e6),
      datalabels: i === types.length - 1 ? { anchor: 'end', align: 'end', offset: 2, color: '#1a1a2e', font: { weight: 'bold', size: 11 }, formatter: (v, ctx) => mil(tot[ctx.dataIndex]) } : { display: false },
    }));
    ds.push({ type: 'line', label: '월평균', data: months.map(() => avg / 1e6), borderColor: '#8a8a98', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, datalabels: { display: false } });
    const ctx = document.getElementById('ascMonth');
    _charts.push(new Chart(ctx, {
      data: { labels: months.map(m => m + '월'), datasets: ds },
      plugins: window.ChartDataLabels ? [ChartDataLabels] : [],
      options: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Math.round(c.raw * 100).toLocaleString()}만원`,
            footer: items => { const m = months[items[0].dataIndex]; return `합계 ${man(tot[items[0].dataIndex])}만원 · ${byM(m).length}건`; } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '백만원' }, suggestedMax: Math.max(...tot) / 1e6 * 1.15 } },
      },
    }));
    const row = (name, arr, cls = '') => `<tr class="${cls}"><td>${name}</td>${arr.map(v => `<td>${man(v)}</td>`).join('')}<td>${man(arr.reduce((a, b) => a + b, 0))}</td></tr>`;
    let h = '<tr><th>구분 (만원)</th>' + months.map(m => `<th>${m}월</th>`).join('') + '<th>합계</th></tr>';
    types.forEach(([t]) => { h += row(t, months.map(m => sum(byM(m).filter(r => r.type === t)))); });
    h += row('합계', tot, 'tot');
    h += `<tr><td>건수</td>${months.map(m => `<td>${byM(m).length}</td>`).join('')}<td>${T.n.toLocaleString()}</td></tr>`;
    h += `<tr><td>건당 평균</td>${months.map((m, i) => `<td>${(tot[i] / Math.max(1, byM(m).length) / 1e4).toFixed(1)}</td>`).join('')}<td>${(T.amt / T.n / 1e4).toFixed(1)}</td></tr>`;
    document.getElementById('ascMonthT').innerHTML = h;
  }

  function drawCmp(T) {
    const old = _charts.find(c => c.canvas && c.canvas.id === 'ascCmp');
    if (old) { old.destroy(); _charts = _charts.filter(c => c !== old); }
    const all = _lvl === 'model' ? agg(_rows, r => r.model) : agg(_rows, r => r.group);
    const rows = _lvl === 'model' ? all.slice(0, 15) : all;
    document.getElementById('ascCmpWrap').style.height = (rows.length * 34 + 50) + 'px';
    const ctx = document.getElementById('ascCmp');
    const dl = { anchor: 'end', align: 'end', offset: 2, color: '#4a4a5a', font: { size: 10.5 }, formatter: v => v.toFixed(1) + '%' };
    _charts.push(new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.k), datasets: [
        { label: '비용 비중', backgroundColor: C_ACT, borderRadius: 3, data: rows.map(r => r.amt / T.amt * 100), datalabels: dl },
        { label: '건수 비중', backgroundColor: C_CNT, borderRadius: 3, data: rows.map(r => r.n / T.n * 100), datalabels: dl },
      ] },
      plugins: window.ChartDataLabels ? [ChartDataLabels] : [],
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40 } },
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { afterBody: items => { const r = rows[items[0].dataIndex]; return `비용 ${man(r.amt)}만원 · ${r.n}건 · 건당 ${(r.amt / r.n / 1e4).toFixed(1)}만원`; } } } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 11.5 } } } },
      },
    }));
    const isM = _lvl === 'model';
    let h = `<tr><th>${isM ? '모델' : '대분류'}</th>${isM ? '<th>대분류</th>' : ''}<th>비용(만원)</th><th>비용 비중</th><th>건수</th><th>건수 비중</th><th>수량</th><th>건당(만원)</th></tr>`;
    h += all.map(r => `<tr><td>${r.k}</td>${isM ? `<td>${r.g}</td>` : ''}<td>${man(r.amt)}</td><td>${pct(r.amt, T.amt)}</td><td>${r.n}</td><td>${pct(r.n, T.n)}</td><td>${r.q}</td><td>${(r.amt / r.n / 1e4).toFixed(1)}</td></tr>`).join('');
    h += `<tr class="tot"><td>합계</td>${isM ? '<td></td>' : ''}<td>${man(T.amt)}</td><td>100%</td><td>${T.n}</td><td>100%</td><td>${T.q}</td><td>${(T.amt / T.n / 1e4).toFixed(1)}</td></tr>`;
    document.getElementById('ascCmpT').innerHTML = h;
  }

  function drawHeat(months) {
    const top = agg(_rows, r => r.model).slice(0, 10);
    const cell = {}; let max = 0;
    _rows.forEach(r => { const k = r.model + '|' + r.m; (cell[k] = cell[k] || { amt: 0, n: 0 }); cell[k].amt += r.amt; cell[k].n++; });
    top.forEach(t => months.forEach(m => { const c = cell[t.k + '|' + m]; if (c && c.amt > max) max = c.amt; }));
    const col = t => { const a = [234, 242, 252], b = [42, 120, 214]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; };
    let h = '<tr><th>모델</th>' + months.map(m => `<th style="text-align:center">${m}월</th>`).join('') + '<th>합계</th></tr>';
    const last = months[months.length - 1];
    top.forEach(t => {
      h += `<tr><td data-mo="${esc(t.k)}" data-m="${last}" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${t.k}</td>` + months.map(m => {
        const c = cell[t.k + '|' + m] || { amt: 0, n: 0 }; const s = max ? Math.sqrt(c.amt / max) : 0;
        return `<td data-mo="${esc(t.k)}" data-m="${m}" title="${t.k} · ${m}월\n${man(c.amt)}만원 · ${c.n}건\n클릭: 전월 대비 증감 사유" style="cursor:pointer;background:${col(s)};color:${s > 0.55 ? '#fff' : '#1a1a2e'}">${c.amt ? man(c.amt) : '-'}</td>`;
      }).join('') + `<td style="font-weight:700">${man(t.amt)}</td></tr>`;
    });
    const tbl = document.getElementById('ascHeat');
    tbl.innerHTML = h;
    tbl.querySelectorAll('td[data-mo]').forEach(td => {
      td.onclick = () => {
        tbl.querySelectorAll('td[data-mo]').forEach(x => x.style.outline = '');
        td.style.outline = '2px solid #d4380d'; td.style.outlineOffset = '-2px';
        showCell(td.dataset.mo, +td.dataset.m);
      };
    });
  }

  injectCss();
  window.AsCost = { open, close, classify, injectCss };
})();
