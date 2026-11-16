// savings.js — 실패비용 탭 하단: 실패비용 저감 활동(접수 단계 비용 방지) 시각화
// 매월 하자보수비 마감 후 SAVINGS 데이터만 갱신하면 된다. (근거: 품질관리팀 EP 정기 보고)
const SAVINGS = {
  period: '2026년 9~10월',
  periodShort: '9~10월',
  months: 2,               // 집계 개월 수 (월평균·연간 환산에 사용)
  reviewed: 41,            // 접수 검토 건수
  accepted: 21,            // 비용 방지 인정 (전환 후 재발·집행까지 추적)
  total: 3367968,          // 비용 방지액 (회사 부담 공급가, 원)
  types: [
    { name: '제품 교체 → 부품 조치', count: 7,  amount: 2138960, color: '#002BD2', desc: '제품 교체 요구를 부품 조치로 전환' },
    { name: '접수 취소·차단',        count: 10, amount: 1048580, color: '#3C7DFF', desc: '정상 제품·중복 접수 확인으로 접수 차단' },
    { name: '무상 → 유상 전환',      count: 4,  amount: 180428,  color: '#54DBC2', desc: '보증·귀책 확인으로 고객 부담 전환' },
  ],
  cases: [   // 대표 사례 (유형별 1건): 당초 회사 부담 예정 vs 실제 회사 부담 — 막대는 사례별 당초 금액 = 100%, photo 있으면 카드 클릭 시 펼침
    { type: '부품 전환', color: '#002BD2', product: 'T90 리라이프', no: 'P202610010039-02',
      what: '3개월 사용 후 등판 고정 불가(뒤로 넘어감)로 제품 교체 요구 → 중심봉·틸트 부품 교체로 대응',
      before: 975000, after: 233900, saved: 742700 },
    { type: '접수 차단', color: '#3C7DFF', product: 'GC PRO 전시품', no: 'P202609080071-01/02',
      what: 'LED 등판 작동 불가로 좌판·LED 등판 접수 → 부품 불량이 아닌 선 빠짐 확인, 선 연결 단순조치로 완료(접수 취소)',
      before: 418100, after: 0, saved: 418100, photo: 'img/case-gcpro.jpg', photoCap: 'LED 등판 연결선 분리 상태 — 선 연결로 조치' },
    { type: '무상→유상', color: '#2BB5A0', product: 'T50AIR', no: 'P202609050032-01',
      what: '좌판 메쉬 뜯어짐(4년 이상 사용) — 컨택센터 무상 접수 → 좌판은 소모품(품질보증 1년)으로 확인, 유상 교체 안내(고객 77,100원 결제)',
      before: 70164, after: 0, saved: 70164, photo: 'img/case-t50air.jpg', photoCap: '좌판 메쉬 뜯어짐 — 4년 이상 사용, 보증기간(1년) 경과' },
  ],
  plan: [
    { step: '지속 공유',       desc: '접수 담당자·담당 매니저에게 잘못 접수된 사례·접수 기준 공유', when: '진행 중',      state: 'now' },
    { step: '상담원 교육 시험 운영', desc: '컨택센터·사업부와 협의해 올바른 접수 기준 교육', when: '12월',         state: 'next' },
    { step: '교육 정례화',     desc: '시험 운영 결과로 교육 주기 확정 후 정기 운영',     when: '주기 확정 후', state: 'later' },
  ],
  monthlyReport: '매월 하자보수비 마감 후 전월분 비용 방지 실적 정기 보고',
  note: '11월분 하자보수비 마감(12월 초) 후 일부 금액 확정',
  source: '품질관리팀 EP 보고 시디즈-보고26-11-00131',
};

(function () {
  const css = `
  #savingsSection{margin-top:28px}
  #savingsSection .sv-card{background:var(--sidiz-card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-sm);overflow:hidden}
  #savingsSection .sv-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid var(--border);background:var(--sidiz-blue-pale)}
  #savingsSection .sv-title{font-size:15px;font-weight:800;color:var(--sidiz-navy)}
  #savingsSection .sv-chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:#fff;border:1px solid var(--border);color:var(--text-secondary)}
  #savingsSection .sv-chip.warn{background:#FFF4E5;border-color:#FFD8A8;color:#B8590E}
  #savingsSection .sv-body{padding:20px 22px;display:grid;gap:22px}
  #savingsSection .sv-label{font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px}
  /* 흐름 */
  #savingsSection .sv-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1.3fr;align-items:stretch;gap:10px}
  #savingsSection .sv-step{border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--sidiz-dark)}
  #savingsSection .sv-step .k{font-size:11px;color:var(--text-muted);font-weight:600}
  #savingsSection .sv-step .v{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:800;color:var(--text-primary);line-height:1.2;margin-top:4px}
  #savingsSection .sv-step .v small{font-size:13px;font-weight:600;color:var(--text-muted);margin-left:2px}
  #savingsSection .sv-step .s{font-size:11px;color:var(--text-muted);margin-top:4px}
  #savingsSection .sv-step.hero{background:var(--gradient-brand);border:none;color:#fff}
  #savingsSection .sv-step.hero .k,#savingsSection .sv-step.hero .s{color:rgba(255,255,255,.8)}
  #savingsSection .sv-step.hero .v{color:#fff}
  #savingsSection .sv-pm{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--sidiz-dark2);color:var(--text-secondary);margin-left:4px;vertical-align:1px}
  #savingsSection .sv-step.hero .sv-pm{background:rgba(255,255,255,.2);color:#fff}
  #savingsSection .sv-annual{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.25);font-size:12px;color:rgba(255,255,255,.9)}
  #savingsSection .sv-annual b{font-family:'JetBrains Mono',monospace;font-size:14px;color:#fff}
  #savingsSection .sv-arrow{display:flex;align-items:center;color:var(--border-light);font-size:22px;font-weight:700}
  /* 2열 */
  #savingsSection .sv-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:22px}
  #savingsSection .sv-panel{border:1px solid var(--border);border-radius:12px;padding:16px 18px;min-width:0}
  #savingsSection .sv-stack{display:flex;height:22px;border-radius:6px;overflow:hidden;margin-bottom:14px}
  #savingsSection .sv-stack span{display:block;height:100%}
  #savingsSection .sv-type{display:grid;grid-template-columns:12px 1fr auto auto;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px}
  #savingsSection .sv-type:last-child{border-bottom:none}
  #savingsSection .sv-type i{width:12px;height:12px;border-radius:3px;display:block}
  #savingsSection .sv-type .d{display:block;font-size:11px;color:var(--text-muted)}
  #savingsSection .sv-type .n{font-family:'JetBrains Mono',monospace;color:var(--text-muted);font-size:12px}
  #savingsSection .sv-type .a{font-family:'JetBrains Mono',monospace;font-weight:700;text-align:right;min-width:92px}
  #savingsSection .sv-case{padding:8px 0;border-bottom:1px solid var(--border)}
  #savingsSection .sv-case:last-child{border-bottom:none}
  #savingsSection .sv-case .t{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin-bottom:6px}
  #savingsSection .sv-case .t b{color:var(--text-primary)}
  #savingsSection .sv-case .t em{font-style:normal;font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--accent-emerald);white-space:nowrap}
  #savingsSection .sv-bars{display:grid;grid-template-columns:34px 1fr;gap:4px 8px;align-items:center;font-size:10.5px;color:var(--text-muted)}
  #savingsSection .sv-bar{height:12px;border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#fff;min-width:44px;box-sizing:border-box}
  #savingsSection .sv-bar.b{background:#B9BDC9}
  #savingsSection .sv-bar.a{background:var(--sidiz-blue)}
  #savingsSection details.sv-case>summary{list-style:none;cursor:pointer;border-radius:8px;margin:-4px -6px;padding:4px 6px}
  #savingsSection details.sv-case>summary::-webkit-details-marker{display:none}
  #savingsSection details.sv-case>summary:hover{background:var(--sidiz-card-hover)}
  #savingsSection details.sv-case>summary:focus-visible{outline:2px solid var(--sidiz-blue);outline-offset:1px}
  #savingsSection .sv-meta{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px;color:var(--text-muted);font-family:'JetBrains Mono',monospace}
  #savingsSection .sv-photo-hint{font-family:inherit;font-weight:700;color:var(--sidiz-blue)}
  #savingsSection details[open] .sv-photo-hint::after{content:' ▲'}
  #savingsSection details:not([open]) .sv-photo-hint::after{content:' ▼'}
  #savingsSection .sv-photo{margin:10px 0 4px;text-align:center}
  #savingsSection .sv-photo img{max-width:100%;max-height:420px;border-radius:8px;border:1px solid var(--border)}
  #savingsSection .sv-photo figcaption{font-size:11px;color:var(--text-muted);margin-top:4px}
  #savingsSection .sv-zero{font-size:11px;font-weight:700;color:var(--accent-emerald)}
  #savingsSection .sv-tag{display:inline-block;font-size:10.5px;font-weight:700;color:#fff;padding:1px 7px;border-radius:9px;margin-right:6px;vertical-align:1px}
  /* 계획 */
  #savingsSection .sv-plan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;position:relative}
  #savingsSection .sv-plan::before{content:'';position:absolute;left:8%;right:8%;top:15px;height:3px;background:var(--border)}
  #savingsSection .sv-pstep{position:relative;text-align:center;padding:0 10px}
  #savingsSection .sv-dot{width:32px;height:32px;border-radius:50%;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;position:relative;z-index:1;border:3px solid var(--border);background:#fff;color:var(--text-muted)}
  #savingsSection .sv-pstep.now .sv-dot{background:var(--accent-emerald);border-color:var(--accent-emerald);color:#fff}
  #savingsSection .sv-pstep.next .sv-dot{background:var(--sidiz-blue);border-color:var(--sidiz-blue);color:#fff}
  #savingsSection .sv-when{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;margin-bottom:4px;background:var(--sidiz-dark2);color:var(--text-secondary)}
  #savingsSection .now .sv-when{background:#E3FCEF;color:#006644}
  #savingsSection .next .sv-when{background:var(--sidiz-blue-pale);color:var(--sidiz-blue)}
  #savingsSection .sv-pstep .h{font-size:13px;font-weight:800}
  #savingsSection .sv-pstep .d{font-size:11.5px;color:var(--text-muted);margin-top:2px;line-height:1.5}
  #savingsSection .sv-monthly{margin-top:14px;text-align:center;font-size:12px;color:var(--text-secondary)}
  #savingsSection .sv-foot{font-size:11px;color:var(--text-muted);padding:10px 22px 14px;border-top:1px solid var(--border)}
  @media (max-width:900px){
    #savingsSection .sv-flow{grid-template-columns:1fr}
    #savingsSection .sv-arrow{justify-content:center;transform:rotate(90deg)}
    #savingsSection .sv-grid{grid-template-columns:1fr}
    #savingsSection .sv-plan{grid-template-columns:1fr;gap:14px}
    #savingsSection .sv-plan::before{display:none}
  }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const won = n => Number(n).toLocaleString('ko-KR');
  const man = n => (n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만';

  function render() {
    const el = document.getElementById('savingsSection'); if (!el) return;
    const S = SAVINGS, sum = S.types.reduce((a, t) => a + t.amount, 0) || 1;
    el.innerHTML = `
    <div class="sv-card">
      <div class="sv-head">
        <span class="sv-title">실패비용 저감 활동 · 접수 단계 비용 방지</span>
        <span class="sv-chip">${S.period} · ${S.months}개월 누계</span>
        <span class="sv-chip warn">실패비용 미포함 · 발생을 막은 비용</span>
      </div>
      <div class="sv-body">
        <div>
          <div class="sv-label">① 매일 접수 건별 검토 → 품질관리팀 확인 → 전환</div>
          <div class="sv-flow">
            <div class="sv-step"><div class="k">접수 검토 <span class="sv-pm">${S.periodShort} 누계</span></div><div class="v">${S.reviewed}<small>건</small></div><div class="s">제품 교체·무상 처리 예정 건</div></div>
            <div class="sv-arrow">›</div>
            <div class="sv-step"><div class="k">전환 성공 <span class="sv-pm">${S.periodShort} 누계</span></div><div class="v">${S.accepted}<small>건</small></div><div class="s">집행까지 추적 · 전환 실패·재발 ${S.reviewed - S.accepted}건 제외</div></div>
            <div class="sv-arrow">›</div>
            <div class="sv-step hero"><div class="k">비용 방지액 <span class="sv-pm">${S.periodShort} 누계</span></div><div class="v">${won(S.total)}<small style="color:rgba(255,255,255,.8)">원</small></div>
              <div class="sv-annual"><span>월평균 <b>${man(S.total / S.months)}원</b></span><span>연간 환산 <b>약 ${Math.round(S.total / S.months * 12 / 10000).toLocaleString('ko-KR')}만원</b></span></div>
              <div class="s">회사 부담 공급가 기준 · 연간 환산은 월평균 × 12개월 단순 추정</div></div>
          </div>
        </div>

        <div class="sv-grid">
          <div class="sv-panel">
            <div class="sv-label">② 유형별 비용 방지액 <span class="sv-pm">${S.periodShort} 누계</span></div>
            <div class="sv-stack">${S.types.map(t => `<span style="width:${t.amount / sum * 100}%;background:${t.color}" title="${t.name}"></span>`).join('')}</div>
            ${S.types.map(t => `<div class="sv-type"><i style="background:${t.color}"></i><div>${t.name}<span class="d">${t.desc}</span></div><span class="n">${t.count}건</span><span class="a">${man(t.amount)}원</span></div>`).join('')}
          </div>
          <div class="sv-panel">
            <div class="sv-label">대표 사례 — 회사 부담 당초 예정 vs 실제</div>
            ${S.cases.map(c => {
              const inner = `
              <div class="t"><span><span class="sv-tag" style="background:${c.color}">${c.type}</span><b>${c.product}</b> · ${c.what}</span><em>−${won(c.saved)}원</em></div>
              <div class="sv-bars">
                <span>당초</span><div class="sv-bar b" style="width:100%">${won(c.before)}</div>
                <span>실제</span>${c.after > 0 ? `<div class="sv-bar a" style="width:${Math.max(c.after / c.before * 100, 8)}%">${won(c.after)}</div>` : `<div class="sv-zero">0원 (회사 부담 없음)</div>`}
              </div>
              <div class="sv-meta">${c.no}${c.photo ? '<span class="sv-photo-hint">📷 사진 보기</span>' : ''}</div>`;
              return c.photo
                ? `<details class="sv-case sv-has-photo"><summary>${inner}</summary><figure class="sv-photo"><img src="${c.photo}" alt="${c.product} 사진" loading="lazy"><figcaption>${c.photoCap || ''}</figcaption></figure></details>`
                : `<div class="sv-case">${inner}</div>`;
            }).join('')}
          </div>
        </div>

        <div>
          <div class="sv-label">③ 품질관리팀 향후 계획</div>
          <div class="sv-plan">${S.plan.map((p, i) => `<div class="sv-pstep ${p.state}"><div class="sv-dot">${i + 1}</div><span class="sv-when">${p.when}</span><div class="h">${p.step}</div><div class="d">${p.desc}</div></div>`).join('')}</div>
          <div class="sv-monthly">＋ ${S.monthlyReport}</div>
        </div>
      </div>
      <div class="sv-foot">※ ${S.note} · 근거: ${S.source}</div>
    </div>`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
