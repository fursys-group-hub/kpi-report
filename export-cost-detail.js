/**
 * 실패비용 '제품·자재·클레임 보상' 펼침 분석용 데이터 내보내기 → cost-detail.json
 * - 회사 PC 자동 업데이트(run-update.ps1)에서 update-kpi.js 와 함께 매일 실행 (사내 DB는 회사 네트워크에서만 접속)
 * - 시디즈 포털 /api/as-action-costs/claims · /api/failure-cost/details 와 같은 기준
 * - 공개 페이지용: 고객명·건명·적요·손익센터는 넣지 않고, 클레임 보상은 유형별 월 합계만
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const S = 'app_260724_z9e5';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const now = new Date();
  const year = new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear();   // 지난달이 속한 연도
  const c = await pool.connect();
  try {
    // ── 제품: AS 조치비용 + 클레임 판정 연결 (포털 as-action-costs/claims 와 동일 연결 규칙) ──
    const product = (await c.query(`
      WITH c AS (
        SELECT split_part(claim_id, '-', 1) rno,
               nullif(regexp_replace(split_part(claim_id, '-', 2), '[^0-9]', '', 'g'), '')::int sq,
               claim_date, category, defective_part, defect_type, inspection_result
        FROM ${S}.claims WHERE claim_id >= $3),
      k AS (SELECT DISTINCT ON (rno, sq) * FROM c ORDER BY rno, sq, claim_date DESC NULLS LAST),
      k2 AS (SELECT DISTINCT ON (rno) * FROM c ORDER BY rno, sq, claim_date DESC NULLS LAST),
      r AS (SELECT DISTINCT ON (receipt_id, seq_no) receipt_id, seq_no, defect_category, defect_type
            FROM ${S}.claims_receipt WHERE receipt_id >= $3 ORDER BY receipt_id, seq_no, id DESC),
      a AS (SELECT *, substring(title from 'P[0-9]{12}') rno, (substring(title from 'P[0-9]{12}-([0-9]{1,2})'))::int sq
            FROM ${S}.as_action_costs WHERE year_month >= $1 AND year_month <= $2)
      SELECT a.year_month, a.item_code, a.qty::float AS qty, a.supply_amt::float AS supply_amt,
             CASE WHEN a.title LIKE '%재작업%' THEN '반품재작업' WHEN a.title LIKE '%환불%' THEN '환불' ELSE '조치' END AS action_type,
             CASE WHEN k.rno IS NOT NULL THEN 'claim' WHEN k2.rno IS NOT NULL THEN 'claim_rno'
                  WHEN rr.receipt_id IS NOT NULL THEN 'receipt' END AS link,
             coalesce(k.category, k2.category) category, coalesce(k.defective_part, k2.defective_part) defective_part,
             coalesce(k.defect_type, k2.defect_type) defect_type, coalesce(k.inspection_result, k2.inspection_result) inspection_result,
             rr.defect_category receipt_defect
      FROM a
      LEFT JOIN k ON k.rno = a.rno AND k.sq = a.sq
      LEFT JOIN k2 ON k.rno IS NULL AND k2.rno = a.rno
      LEFT JOIN LATERAL (SELECT receipt_id, defect_category FROM r WHERE r.receipt_id = a.rno
                         ORDER BY (r.seq_no = a.sq) DESC LIMIT 1) rr ON k.rno IS NULL AND k2.rno IS NULL
      ORDER BY a.id`, [`${year}-01`, `${year}-12`, `P${year - 1}`])).rows;

    // ── 자재: 월별(AS 출고 / 레터스 무상매입) + AS 출고 품목별 ──
    const months = (await c.query(`
      SELECT year_month, src, round(sum(amount))::float AS amt, count(*)::int AS n
      FROM ${S}.failure_cost_details WHERE kind = 'material' AND year_month LIKE $1 GROUP BY 1, 2 ORDER BY 1, 2`, [year + '-%'])).rows;
    const items = (await c.query(`
      SELECT year_month, coalesce(name, '-') AS name, coalesce(cat2, '-') AS cat2, round(sum(amount))::float AS amt, sum(qty)::float AS qty, count(*)::int AS n
      FROM ${S}.failure_cost_details WHERE kind = 'material' AND src = 'as_issue' AND year_month LIKE $1
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [year + '-%'])).rows;

    // ── 클레임 보상: 유형별 월 합계만 (건별 적요·손익센터 제외) ──
    const claim = (await c.query(`
      SELECT year_month, cat1 AS type, round(sum(amount))::float AS amount, count(*)::int AS n
      FROM ${S}.failure_cost_details WHERE kind = 'claim' AND year_month LIKE $1 GROUP BY 1, 2 ORDER BY 1, 2`, [year + '-%'])).rows;

    // 판정내용에 사람 이름(○○○님)이 섞인 경우 가림 — '고객님' 등 호칭은 그대로
    const KEEP = new Set(['고객', '담당', '기사', '매니저', '상담']);
    const mask = s => s == null ? s : String(s).replace(/([가-힣])([가-힣]{1,2})(\s?님)/g, (m, a, b, c) => KEEP.has(a + b) ? m : a + '*'.repeat(b.length) + c);
    product.forEach(r => { r.inspection_result = mask(r.inspection_result); r.defective_part = mask(r.defective_part); });
    // ERP 분류가 비어 'nan'·'-' 로 들어온 자재는 '(분류 없음)'으로 표시
    items.forEach(r => { if (!r.cat2 || /^(nan|-)$/i.test(String(r.cat2).trim())) r.cat2 = '(분류 없음)'; });

    const out = { year, product, material: { months, items }, claim };
    fs.writeFileSync(path.join(__dirname, 'cost-detail.json'), JSON.stringify(out));
    console.log(`cost-detail.json — ${year}년 · 제품 ${product.length}행 · 자재 월 ${months.length}·품목 ${items.length} · 클레임 보상 ${claim.length}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
