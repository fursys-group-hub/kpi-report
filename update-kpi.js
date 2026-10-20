/**
 * KPI 리포트 자동 업데이트 스크립트
 * - 매일 실행: 올해 1월 ~ 지난달 데이터를 DB에서 다시 읽어 index.html의 KPI_DATA를 최신값으로 맞춤 (이번 달은 비워 둠)
 * - GitHub Actions에서 실행 (DATABASE_URL 환경변수 필요)
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // 대상: 지난달이 속한 연도의 1월 ~ 지난달 (이번 달은 비워 둠)
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year  = prevMonth.getFullYear();
  const lastM = prevMonth.getMonth() + 1; // 1~12
  console.log(`대상: ${year}-01 ~ ${year}-${String(lastM).padStart(2, '0')}`);

  const htmlPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const client = await pool.connect();
  try {
    for (let month = 1; month <= lastM; month++) {
      const ym   = `${year}-${String(month).padStart(2, '0')}`;
      const idx  = month - 1;
      const from = `${ym}-01`;
      const to   = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      // ── 매출건수 ───────────────────────────────────────────
      const salesRes = await client.query(`
        SELECT country, SUM(sales_count)::int AS total
        FROM app_260724_z9e5.product_sales_monthly
        WHERE year_month = $1 AND brand = '시디즈'
        GROUP BY country
      `, [ym]);
      let salesKr = 0, salesVn = 0;
      for (const r of salesRes.rows) {
        if (r.country === '국내')   salesKr = r.total;
        if (r.country === '베트남') salesVn = r.total;
      }

      // ── 클레임 건수 (판정유형별) ───────────────────────────
      const claimRes = await client.query(`
        SELECT country, category, COUNT(*)::int AS cnt
        FROM app_260724_z9e5.claims
        WHERE claim_date >= $1 AND claim_date < $2
          AND brand = '시디즈'
          AND category IN ('제조','설계','서비스','고객불만','사양재검토')
        GROUP BY country, category
      `, [from, to]);
      const kr = { '제조':0, '설계':0, '서비스':0, '고객불만':0, '사양재검토':0 };
      const vn = { '제조':0, '설계':0, '서비스':0, '고객불만':0, '사양재검토':0 };
      for (const r of claimRes.rows) {
        if (r.country === '국내')   kr[r.category] = r.cnt;
        if (r.country === '베트남') vn[r.category] = r.cnt;
      }
      const totalKr = Object.values(kr).reduce((a,b)=>a+b, 0);
      const totalVn = Object.values(vn).reduce((a,b)=>a+b, 0);

      if (totalKr === 0 && totalVn === 0) {
        console.log(`${ym} ⚠️ 클레임 데이터 없음 — 건너뜀`);
        continue;
      }
      html = patchAllArrays(html, year, idx, { salesKr, salesVn, totalKr, totalVn, kr, vn });

      // ── 제품별 클레임 건수 (전월대비 제품별 증감용) ─────────
      const prodRes = await client.query(`
        SELECT COALESCE(NULLIF(TRIM(item), ''), '(미분류)') AS item, COUNT(*)::int AS cnt
        FROM app_260724_z9e5.claims
        WHERE claim_date >= $1 AND claim_date < $2
          AND brand = '시디즈'
          AND category IN ('제조','설계','서비스','고객불만','사양재검토')
        GROUP BY 1 ORDER BY 2 DESC, 1
      `, [from, to]);
      const prod = {};
      for (const r of prodRes.rows) prod[r.item] = r.cnt;
      html = patchProductMonthly(html, ym, prod);

      console.log(`${ym} 매출 ${salesKr}/${salesVn} · 클레임 ${totalKr}/${totalVn} · 제품 ${prodRes.rows.length}개`);
    }
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('✅ index.html 업데이트 완료');
  } finally {
    client.release();
    await pool.end();
  }
}

// PRODUCT_MONTHLY 블록(@@PRODUCT_MONTHLY_START ~ END) 안의 해당 월 한 줄을 교체/추가
function patchProductMonthly(html, ym, prod) {
  const start = html.indexOf('// @@PRODUCT_MONTHLY_START'), end = html.indexOf('// @@PRODUCT_MONTHLY_END');
  if (start < 0 || end < 0) { console.log('⚠️ PRODUCT_MONTHLY 블록 없음 — 제품별 갱신 건너뜀'); return html; }
  const block = html.slice(start, end);
  const lines = block.split('\n').filter(l => !l.trimStart().startsWith(`'${ym}':`));
  const entries = lines.filter(l => /^\s+'\d{4}-\d{2}':/.test(l));
  entries.push(`  '${ym}': ${JSON.stringify(prod)},`);
  entries.sort();
  const head = lines.slice(0, 2).join('\n');   // 주석 + "const PRODUCT_MONTHLY = {"
  const nb = `${head}\n${entries.join('\n')}\n};\n`;
  return html.slice(0, start) + nb + html.slice(end);
}

function patchAllArrays(html, year, idx, data) {
  const { salesKr, salesVn, totalKr, totalVn, kr, vn } = data;

  const lines = html.split('\n');
  let in2026 = false;
  let salesKrDone = false, salesVnDone = false;
  let judgKrDone = false, judgVnDone = false;
  let clmKrDone  = false, clmVnDone  = false;
  let dkrMap = { '제조':false,'설계':false,'서비스':false,'고객불만':false,'사양재검토':false };
  let dvnMap = { '제조':false,'설계':false,'서비스':false,'고객불만':false,'사양재검토':false };
  let dcombMap = { '제조':false,'설계':false,'서비스':false,'사양재검토':false,'고객불만':false };
  let section = ''; // 'sales','judgement','claims','detail_kr','detail_vn','detail_combined'

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!in2026 && l.includes(`'${year}':`)) { in2026 = true; continue; }
    if (!in2026) continue;
    if (l.includes("prevYearAvg")) break;

    const t = l.trimStart();

    // 섹션 감지
    if (t.startsWith('sales:'))         section = 'sales';
    else if (t.startsWith('judgement:')) section = 'judgement';
    else if (t.startsWith('claims:'))   section = 'claims';
    else if (t.startsWith('detail_kr:'))       section = 'detail_kr';
    else if (t.startsWith('detail_vn:'))       section = 'detail_vn';
    else if (t.startsWith('detail_combined:')) section = 'detail_combined';

    const setIdx = (line, val) => {
      return line.replace(/\[([^\]]+)\]/, (_, body) => {
        const items = body.split(',').map(s => s.trim());
        items[idx] = String(val);
        return '[' + items.join(', ') + ']';
      });
    };

    if (section === 'sales') {
      if (t.startsWith('kr:')  && !salesKrDone) { lines[i] = setIdx(l, salesKr); salesKrDone = true; }
      if (t.startsWith('vn:')  && !salesVnDone) { lines[i] = setIdx(l, salesVn); salesVnDone = true; }
    } else if (section === 'judgement') {
      if (t.startsWith('kr:')  && !judgKrDone) { lines[i] = setIdx(l, totalKr); judgKrDone = true; }
      if (t.startsWith('vn:')  && !judgVnDone) { lines[i] = setIdx(l, totalVn); judgVnDone = true; }
    } else if (section === 'claims') {
      if (t.startsWith('kr:')  && !clmKrDone)  { lines[i] = setIdx(l, totalKr); clmKrDone = true; }
      if (t.startsWith('vn:')  && !clmVnDone)  { lines[i] = setIdx(l, totalVn); clmVnDone = true; }
    } else if (section === 'detail_kr') {
      for (const cat of Object.keys(dkrMap)) {
        const q = `'${cat}':`;
        if (t.startsWith(q) && !dkrMap[cat]) { lines[i] = setIdx(l, kr[cat]); dkrMap[cat] = true; }
      }
    } else if (section === 'detail_vn') {
      for (const cat of Object.keys(dvnMap)) {
        const q = `'${cat}':`;
        if (t.startsWith(q) && !dvnMap[cat]) { lines[i] = setIdx(l, vn[cat]); dvnMap[cat] = true; }
      }
    } else if (section === 'detail_combined') {
      for (const cat of Object.keys(dcombMap)) {
        const q = `'${cat}':`;
        if (t.startsWith(q) && !dcombMap[cat]) {
          lines[i] = setIdx(l, (kr[cat]||0) + (vn[cat]||0));
          dcombMap[cat] = true;
        }
      }
    }
  }
  return lines.join('\n');
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
