// shared-notes.js — 발표용 특이사항을 저장소의 notes.json 에 저장해 모든 사람에게 공유
// 보기: 누구나 (notes.json 을 읽음) / 저장: GitHub 토큰(Contents 쓰기)을 입력한 작성자만
(function () {
  const OWNER = 'fursys-group-hub', REPO = 'kpi-report', PATH = 'notes.json', BRANCH = 'main';
  const LS_TOKEN = 'kpiReportGhToken', LS_DIRTY = 'kpiReportNotesDirty';
  const EDITORS = { kpiSpecialNote: '_kpiNoteEditor', costSpecialNote: '_costNoteEditor' };
  let remote = null;          // 마지막으로 불러온 notes.json
  let dirty = false;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ─── 상태 표시 바 ───
  const bar = document.createElement('div');
  bar.id = 'sharedNotesBar';
  bar.innerHTML = `
    <span class="sn-title">📝 발표 메모</span>
    <span id="snStatus" class="sn-status">불러오는 중…</span>
    <button id="snSave" class="sn-btn sn-primary" type="button">💾 저장(공유)</button>
    <button id="snCfg" class="sn-btn" type="button" title="저장용 GitHub 토큰 설정">⚙</button>
    <div id="snPanel" class="sn-panel" hidden>
      <div class="sn-ptitle">저장용 GitHub 토큰</div>
      <div class="sn-pdesc">보는 사람은 필요 없습니다. 작성자만 한 번 입력하면 이 브라우저에 기억됩니다.<br>
        GitHub → Settings → Developer settings → Fine-grained token → 저장소 <b>${OWNER}/${REPO}</b>, 권한 <b>Contents: Read and write</b></div>
      <input id="snToken" type="password" placeholder="github_pat_… 또는 ghp_…" autocomplete="off">
      <div class="sn-prow"><button id="snTokenSave" class="sn-btn sn-primary" type="button">토큰 저장</button>
        <button id="snTokenDel" class="sn-btn" type="button">토큰 삭제</button></div>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
    #sharedNotesBar{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;align-items:center;gap:8px;
      background:#fff;border:1px solid #d9dce3;border-radius:10px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.12);font-size:12px;font-family:'Noto Sans KR',sans-serif;color:#222}
    #sharedNotesBar .sn-title{font-weight:700}
    #sharedNotesBar .sn-status{color:#6b7080;max-width:320px}
    #sharedNotesBar .sn-status.warn{color:#d9480f;font-weight:600} #sharedNotesBar .sn-status.ok{color:#0a8a5f;font-weight:600} #sharedNotesBar .sn-status.err{color:#e03131;font-weight:600}
    #sharedNotesBar .sn-btn{padding:5px 10px;border-radius:6px;border:1px solid #d9dce3;background:#fff;color:#222;font-size:12px;font-weight:600;cursor:pointer}
    #sharedNotesBar .sn-btn:disabled{opacity:.5;cursor:not-allowed}
    #sharedNotesBar .sn-primary{background:#002BD2;border-color:#002BD2;color:#fff}
    #sharedNotesBar .sn-panel{position:absolute;right:0;bottom:calc(100% + 8px);width:340px;background:#fff;border:1px solid #d9dce3;border-radius:10px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:grid;gap:8px}
    #sharedNotesBar .sn-panel[hidden]{display:none}
    #sharedNotesBar .sn-ptitle{font-weight:700} #sharedNotesBar .sn-pdesc{font-size:11px;color:#6b7080;line-height:1.6}
    #sharedNotesBar input{padding:7px 9px;border:1px solid #d9dce3;border-radius:6px;font-size:12px}
    #sharedNotesBar .sn-prow{display:flex;gap:6px}
    @media (max-width:560px){#sharedNotesBar{left:16px;flex-wrap:wrap}#sharedNotesBar .sn-panel{width:auto;left:0}}
    @media print{#sharedNotesBar{display:none}}`;
  document.head.appendChild(css);

  function status(text, cls) { const s = document.getElementById('snStatus'); if (s) { s.textContent = text; s.className = 'sn-status ' + (cls || ''); } }
  function fmtTime(iso) { try { return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }

  // ─── 현재 화면 → 데이터 ───
  function collect() {
    const out = { memo: { claim: [...(window._kpiNoteEntries?.claim || [])], cost: [...(window._kpiNoteEntries?.cost || [])] } };
    for (const [key, id] of Object.entries(EDITORS)) {
      const el = document.getElementById(id);
      out[key] = el ? el.innerHTML : (ls.get(key) || '');
    }
    return out;
  }
  // ─── 데이터 → 화면 (localStorage 는 화면 재생성용 사본) ───
  function apply(n) {
    for (const [key, id] of Object.entries(EDITORS)) {
      const v = n[key] || '';
      ls.set(key, v);
      const el = document.getElementById(id);
      if (el && el.innerHTML !== v) el.innerHTML = v;
    }
    if (window._kpiNoteEntries) {
      window._kpiNoteEntries.claim = [...(n.memo?.claim || [])];
      window._kpiNoteEntries.cost = [...(n.memo?.cost || [])];
      if (typeof _renderKpiNoteList === 'function') { _renderKpiNoteList('claim'); _renderKpiNoteList('cost'); }
    }
  }
  function markDirty() {
    dirty = true; ls.set(LS_DIRTY, '1');
    status('저장 안 된 변경 있음 — 💾 저장(공유)을 눌러야 다른 사람에게 보입니다', 'warn');
  }
  function clearDirty() { dirty = false; ls.del(LS_DIRTY); }

  // ─── 불러오기 (같은 사이트의 notes.json, 캐시 우회) ───
  async function load() {
    try {
      const res = await fetch(`${PATH}?t=${Date.now()}`, { cache: 'no-store' });
      remote = res.ok ? await res.json() : {};
    } catch (e) { remote = {}; }
    const localDirty = ls.get(LS_DIRTY) === '1';
    const hasLocal = Object.keys(EDITORS).some(k => (ls.get(k) || '').replace(/<br>|&nbsp;|\s/g, '') !== '');
    const hasRemote = remote && (remote.updatedAt || Object.keys(EDITORS).some(k => remote[k]));
    if (localDirty || (!hasRemote && hasLocal)) {
      // 이 브라우저에 저장 안 된 작성분이 있으면 그대로 두고 저장을 안내
      markDirty();
      if (!hasRemote && hasLocal) status('이 브라우저에만 있는 메모가 있습니다 — 💾 저장(공유)을 누르면 모두에게 공개됩니다', 'warn');
    } else {
      apply(remote || {});
      clearDirty();
      status(remote?.updatedAt ? `공유본 · ${fmtTime(remote.updatedAt)} 저장` : '아직 저장된 공유 메모가 없습니다', '');
    }
  }

  // ─── 저장 (GitHub Contents API) ───
  function b64(str) { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); }
  async function save() {
    const token = ls.get(LS_TOKEN);
    if (!token) { document.getElementById('snPanel').hidden = false; status('저장하려면 먼저 GitHub 토큰을 입력해 주세요', 'warn'); return; }
    const btn = document.getElementById('snSave'); btn.disabled = true; status('저장 중…', '');
    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    try {
      let sha;
      const cur = await fetch(`${api}?ref=${BRANCH}&t=${Date.now()}`, { headers, cache: 'no-store' });
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) throw new Error(cur.status === 401 ? '토큰이 올바르지 않거나 만료되었습니다' : cur.status === 403 ? '이 토큰에 저장 권한이 없습니다' : `GitHub 응답 ${cur.status}`);
      const data = { ...collect(), updatedAt: new Date().toISOString() };
      const put = await fetch(api, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'notes: 발표 특이사항 업데이트', content: b64(JSON.stringify(data, null, 2)), branch: BRANCH, ...(sha ? { sha } : {}) })
      });
      if (!put.ok) {
        const j = await put.json().catch(() => ({}));
        throw new Error(put.status === 409 ? '다른 곳에서 먼저 저장되었습니다. 새로고침 후 다시 저장해 주세요' : put.status === 403 || put.status === 404 ? '이 토큰에 저장 권한이 없습니다 (Contents: Read and write 필요)' : (j.message || `GitHub 응답 ${put.status}`));
      }
      remote = data; clearDirty();
      status(`저장 완료 · 1~2분 후 다른 사람 화면에 반영됩니다`, 'ok');
    } catch (e) {
      status('저장 실패: ' + e.message, 'err');
    } finally { btn.disabled = false; }
  }

  // ─── 변경 감지 ───
  document.addEventListener('input', e => { if (Object.values(EDITORS).includes(e.target?.id)) markDirty(); });
  document.addEventListener('mouseup', e => { if (e.target?.closest?.('button[onmousedown*="execCommand"]')) setTimeout(markDirty, 0); });
  ['addKpiNoteEntry', 'removeKpiNoteEntry', 'deleteSelectedKpiNotes'].forEach(fn => {
    const orig = window[fn]; if (typeof orig !== 'function') return;
    window[fn] = function (...a) { const r = orig.apply(this, a); markDirty(); return r; };
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  function mount() {
    document.body.appendChild(bar);
    document.getElementById('snSave').onclick = save;
    document.getElementById('snCfg').onclick = () => { const p = document.getElementById('snPanel'); p.hidden = !p.hidden; };
    document.getElementById('snTokenSave').onclick = () => {
      const v = document.getElementById('snToken').value.trim(); if (!v) return;
      ls.set(LS_TOKEN, v); document.getElementById('snToken').value = ''; document.getElementById('snPanel').hidden = true;
      status(dirty ? '토큰 저장됨 — 💾 저장(공유)을 눌러 주세요' : '토큰 저장됨', dirty ? 'warn' : 'ok');
    };
    document.getElementById('snTokenDel').onclick = () => { ls.del(LS_TOKEN); status('토큰을 삭제했습니다', ''); };
    // 기존 초기화(분석 자동 실행 등)가 편집기를 그린 뒤에 공유본을 적용
    setTimeout(load, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.SharedNotes = { load, save };
})();
