/**
 * KPI 리포트 자동 업데이트 스크립트
 * - 이전 달 데이터를 DB에서 읽어 index.html의 KPI_DATA를 업데이트
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
  // 이전 달 계산 (스크립트 실행 시점 기준)
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year  = prevMonth.getFullYear();
  const month = prevMonth.getMonth() + 1; // 1~12
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const idx   = month - 1; // 배열 인덱스 (0~11)

  console.log(`대상: ${ym} (index=${idx})`);

  const client = await pool.connect();
  try {
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
    console.log(`매출 — 국내: ${salesKr}, 베트남: ${salesVn}`);

    // ── 클레임 건수 (판정유형별) ───────────────────────────
    const claimRes = await client.query(`
      SELECT country, category, COUNT(*)::int AS cnt
      FROM app_260724_z9e5.claims
      WHERE claim_date >= $1 AND claim_date < $2
        AND brand = '시디즈'
        AND category IN ('제조','설계','서비스','고객불만','사양재검토')
      GROUP BY country, category
    `, [
      `${year}-${String(month).padStart(2,'0')}-01`,
      month === 12
        ? `${year+1}-01-01`
        : `${year}-${String(month+1).padStart(2,'0')}-01`
    ]);

    const kr = { '제조':0, '설계':0, '서비스':0, '고객불만':0, '사양재검토':0 };
    const vn = { '제조':0, '설계':0, '서비스':0, '고객불만':0, '사양재검토':0 };
    for (const r of claimRes.rows) {
      if (r.country === '국내')   kr[r.category] = r.cnt;
      if (r.country === '베트남') vn[r.category] = r.cnt;
    }

    const totalKr = Object.values(kr).reduce((a,b)=>a+b, 0);
    const totalVn = Object.values(vn).reduce((a,b)=>a+b, 0);
    console.log(`클레임 국내합계: ${totalKr}, 베트남합계: ${totalVn}`);
    console.log('국내 상세:', kr);
    console.log('베트남 상세:', vn);

    if (totalKr === 0 && totalVn === 0) {
      console.log('⚠️ 클레임 데이터 없음 — 업데이트 건너뜀');
      return;
    }

    // ── index.html 수정 ────────────────────────────────────
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // 배열의 특정 인덱스 값을 교체하는 헬퍼
    function replaceIdx(src, pattern, newVal) {
      // pattern 예: "kr:  [392, 335, ..."
      // 인덱스 idx 위치의 값을 newVal로 교체
      return src.replace(pattern, (match) => {
        const items = match.split('[')[1].split(']')[0].split(',').map(s => s.trim());
        items[idx] = String(newVal);
        return match.split('[')[0] + '[' + items.join(', ') + ']';
      });
    }

    // 정규식으로 KPI_DATA 2026 블록 내 각 배열의 idx번째 값 교체
    function patchArray(src, label, krVal, vnVal) {
      // label: "kr:" 또는 "vn:" 등
      // 배열 패턴: label  [v0, v1, ..., vN, 0, 0, ...]
      const re = new RegExp(`(${label}\\s+\\[)([^\\]]+)(\\])`, 'g');
      return src.replace(re, (match, open, body, close) => {
        const items = body.split(',').map(s => s.trim());
        const val = label.startsWith('kr') ? krVal : vnVal;
        items[idx] = String(val);
        // 뒤 0들 유지
        return open + items.join(', ') + close;
      });
    }

    // 각 배열 패치 함수 (정규식보다 안정적인 줄 단위 치환)
    function patchLine(src, arrayName, arrIdx, newVal) {
      const lines = src.split('\n');
      let inBlock2026 = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("'2026':")) inBlock2026 = true;
        if (!inBlock2026) continue;
        if (inBlock2026 && lines[i].includes("'2025':")) break;

        const trimmed = lines[i].trimStart();
        if (trimmed.startsWith(arrayName + ':')) {
          const match = lines[i].match(/\[([^\]]+)\]/);
          if (match) {
            const items = match[1].split(',').map(s => s.trim());
            items[arrIdx] = String(newVal);
            lines[i] = lines[i].replace(/\[[^\]]+\]/, '[' + items.join(', ') + ']');
          }
        }
      }
      return lines.join('\n');
    }

    // sales
    html = patchLine(html, 'kr',  idx, salesKr);
    html = patchLine(html, 'vn',  idx, salesVn);

    // judgement / claims (같은 값)
    // judgement.kr, judgement.vn, claims.kr, claims.vn
    // patchLine은 첫 번째 kr/vn 매칭 → sales가 먼저 나오므로 sales 다음 것들도 처리해야 함
    // 안전하게: 블록 내 모든 kr/vn 행을 순서대로 처리
    html = patchAllArrays(html, idx, {
      salesKr, salesVn, totalKr, totalVn, kr, vn
    });

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ index.html 업데이트 완료 — ${ym}`);

  } finally {
    client.release();
    await pool.end();
  }
}

function patchAllArrays(html, idx, data) {
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
    if (l.includes("'2026':")) { in2026 = true; continue; }
    if (!in2026) continue;
    if (l.includes("'2025':") || l.includes("prevYearAvg")) break;

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
