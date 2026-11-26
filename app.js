/* まなびノート — 勉強ノート & 問題集 PWA
 * データはこの端末（localStorage）に保存し、設定すれば GitHub リポジトリと同期します。
 * GitHub 上のファイル構成:
 *   data/notes/<id>.json     ノート
 *   data/quizzes/<id>.json   問題集（AI が追加・編集しやすいよう 1 ファイル 1 問題集）
 *   data/progress/<id>.json  問題集ごとの解答記録
 */
'use strict';

/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (['value', 'checked', 'disabled', 'selected', 'placeholder', 'rows', 'title', 'type', 'href', 'spellcheck', 'autocomplete'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s　、。,.・]/g, '');
const parseNum = (s) => { const t = String(s ?? '').normalize('NFKC').replace(/[,円\s¥￥]/g, ''); return t === '' ? NaN : Number(t); };
const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('ja-JP') : n);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ja-JP', { year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'numeric', day: 'numeric' });
}
function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
let toastT;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } }); document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function renderMarked(text, hide) {
  let s = esc(text);
  s = s.replace(/\[\[([\s\S]+?)\]\]/g, (m, w) => hide ? `<span class="mask" role="button" tabindex="0">${w}</span>` : `<mark class="key">${w}</mark>`);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return s;
}
function bindMasks(root) {
  root.addEventListener('click', (e) => { const m = e.target.closest('.mask, .mask-block'); if (m) m.classList.toggle('shown'); });
}

/* ================= constants ================= */
const NOTE_TYPES = {
  lined: { name: '罫線ノート', icon: '📓', desc: 'ふつうの罫線ノート' },
  grid: { name: '方眼ノート', icon: '📐', desc: '図や計算に' },
  blank: { name: '無地', icon: '📄', desc: '自由に書く' },
  bullet: { name: '箇条書き', icon: '📝', desc: 'インデント・チェック付き' },
  cornell: { name: 'コーネル式', icon: '🗂️', desc: 'キーワード／ノート／まとめ' },
  cards: { name: '暗記カード', icon: '🃏', desc: '表と裏・赤シート・カード' },
};
const TEXT_TYPES = ['lined', 'grid', 'blank'];
const Q_TYPES = {
  choice: '選択', multi: '複数選択', text: '記述', number: '数値', journal: '仕訳', self: '自己採点',
};
const DEFAULT_ACCOUNTS = ['現金', '小口現金', '当座預金', '普通預金', '定期預金', '受取手形', '売掛金', 'クレジット売掛金', '電子記録債権', '前払金', '未収入金', '仮払金', '立替金', '従業員立替金', '貸付金', '手形貸付金', '繰越商品', '貯蔵品', '前払費用', '未収収益', '建物', '備品', '車両運搬具', '土地', '支払手形', '買掛金', '電子記録債務', '前受金', '未払金', '仮受金', '預り金', '所得税預り金', '社会保険料預り金', '借入金', '手形借入金', '未払費用', '前受収益', '未払法人税等', '未払消費税', '仮払消費税', '仮受消費税', '仮払法人税等', '貸倒引当金', '減価償却累計額', '資本金', '利益準備金', '繰越利益剰余金', '売上', '受取利息', '受取手数料', '受取家賃', '受取地代', '償却債権取立益', '固定資産売却益', '雑益', '仕入', '発送費', '給料', '法定福利費', '広告宣伝費', '支払手数料', '支払家賃', '支払地代', '支払利息', '旅費交通費', '通信費', '水道光熱費', '消耗品費', '租税公課', '保険料', '修繕費', '雑費', '貸倒損失', '貸倒引当金繰入', '減価償却費', '固定資産売却損', '雑損', '現金過不足', '法人税等', '損益'];

/* ================= storage ================= */
const LS_FILES = 'manabi.files.v1', LS_CFG = 'manabi.github.v1', LS_PREFS = 'manabi.prefs.v1';
const P = { note: (id) => `data/notes/${id}.json`, quiz: (id) => `data/quizzes/${id}.json`, prog: (id) => `data/progress/${id}.json` };
const idOf = (path) => path.split('/').pop().replace(/\.json$/, '');

const Store = {
  files: {}, // path -> { data, sha, dirty, deleted, v }
  load() { this.files = lsGet(LS_FILES, {}); },
  persistNow() { if (!lsSet(LS_FILES, this.files)) toast('端末への保存に失敗しました（容量不足かもしれません）', 4000); },
  get(path) { const f = this.files[path]; return f && !f.deleted ? f.data : null; },
  put(path, data) {
    const f = this.files[path] || { sha: null };
    f.data = data; f.dirty = true; f.deleted = false; f.v = (f.v || 0) + 1;
    this.files[path] = f; persistSoon(); scheduleSync(); refreshSide();
  },
  remove(path) {
    const f = this.files[path]; if (!f) return;
    if (!f.sha) delete this.files[path]; else { f.deleted = true; f.dirty = false; f.v = (f.v || 0) + 1; }
    this.persistNow(); scheduleSync(); refreshSide();
  },
  list(prefix) {
    return Object.entries(this.files)
      .filter(([p, f]) => p.startsWith(prefix) && p.endsWith('.json') && !f.deleted && f.data && typeof f.data === 'object')
      .map(([p, f]) => ({ path: p, id: idOf(p), data: f.data }));
  },
  pendingCount() { return Object.values(this.files).filter((f) => f.dirty || f.deleted).length; },
};
const persistSoon = debounce(() => Store.persistNow(), 300);
const prefs = Object.assign({ theme: 'auto', fontSize: 17, tab: 'notes' }, lsGet(LS_PREFS, {}));
const savePrefs = () => lsSet(LS_PREFS, prefs);
function applyPrefs() {
  if (prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', prefs.theme);
  document.documentElement.style.setProperty('--note-font', prefs.fontSize + 'px');
}

/* ================= GitHub sync ================= */
let ghCfg = lsGet(LS_CFG, null); // { owner, repo, branch, token }
const sync = { state: 'local', msg: '', running: false, again: false, last: 0 };

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${ghCfg.owner}/${ghCfg.repo}/${path}`, {
    method: opts.method || 'GET', cache: 'no-store',
    headers: {
      Authorization: `Bearer ${ghCfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let m = ''; try { m = (await res.json()).message; } catch {}
    const e = new Error(`GitHub ${res.status}: ${m}`); e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const utf8ToB64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };

function setSync(state, msg = '') { sync.state = state; sync.msg = msg; const el = $('#syncpill'); if (el) paintSyncPill(el); }
function paintSyncPill(el) {
  const labels = { local: 'この端末のみ', synced: '同期済み', pending: '未同期', syncing: '同期中…', error: '同期エラー' };
  let st = sync.state;
  if (st === 'synced' && Store.pendingCount()) st = 'pending';
  el.className = 'sync-pill ' + st; el.title = sync.msg || labels[st];
  el.replaceChildren(h('span', { class: 'dot' }), labels[st]);
}
const scheduleSync = debounce(() => runSync(), 8000);

async function ensureRef() {
  try { return await gh(`git/ref/heads/${encodeURIComponent(ghCfg.branch)}`); }
  catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    // 空のリポジトリ → 最初のファイルを作成して初期化
    await gh(`contents/README.md`, { method: 'PUT', body: { message: 'まなびノート: 初期化', content: utf8ToB64('# まなびノートのデータ\n\nこのリポジトリは「まなびノート」アプリのデータ保存用です。\n'), branch: ghCfg.branch } });
    return gh(`git/ref/heads/${encodeURIComponent(ghCfg.branch)}`);
  }
}

function mergeProgress(a, b) {
  const out = { q: {} };
  for (const src of [a, b]) for (const [k, v] of Object.entries(src?.q || {})) if (!out.q[k] || (v.at || 0) > (out.q[k].at || 0)) out.q[k] = v;
  return out;
}

async function runSync({ manual = false } = {}) {
  if (!ghCfg?.token) { setSync('local'); return; }
  if (sync.running) { sync.again = true; return; }
  if (!navigator.onLine) { setSync('error', 'オフラインです'); return; }
  sync.running = true; setSync('syncing');
  const changedOpen = [];
  try {
    const ref = await ensureRef();
    const headSha = ref.object.sha;
    const commit = await gh(`git/commits/${headSha}`);
    const tree = await gh(`git/trees/${commit.tree.sha}?recursive=1`);
    const remote = {};
    let hasClaudeMd = false;
    for (const t of tree.tree) {
      if (t.type !== 'blob') continue;
      if (t.path === 'CLAUDE.md') hasClaudeMd = true;
      if (t.path.startsWith('data/') && t.path.endsWith('.json')) remote[t.path] = t.sha;
    }
    const fetchJson = async (sha) => JSON.parse(b64ToUtf8((await gh(`git/blobs/${sha}`)).content));
    const F = Store.files;

    // ---- pull ----
    for (const [path, sha] of Object.entries(remote)) {
      const local = F[path];
      if (local && local.sha === sha) continue;
      let data;
      try { data = await fetchJson(sha); } catch (e) { console.warn('JSON を読めませんでした', path, e); if (!local) continue; else continue; }
      if (!local || (!local.dirty && !local.deleted)) {
        F[path] = { data, sha, dirty: false, deleted: false, v: (local?.v || 0) + 1 };
        changedOpen.push(path);
      } else if (local.deleted) {
        F[path] = { data, sha, dirty: false, deleted: false, v: (local.v || 0) + 1 }; // 他端末で更新されたので削除を取り消す
        changedOpen.push(path);
      } else if (path.startsWith('data/progress/')) {
        F[path] = { data: mergeProgress(local.data, data), sha, dirty: true, deleted: false, v: (local.v || 0) + 1 };
        changedOpen.push(path);
      } else {
        // 両方で編集 → 手元の内容を「競合コピー」として残し、リモートを採用
        const dir = path.slice(0, path.lastIndexOf('/') + 1);
        const copy = { ...local.data, title: (local.data.title || '無題') + '（競合コピー）', updatedAt: Date.now() };
        F[dir + uid('c') + '.json'] = { data: copy, sha: null, dirty: true, deleted: false, v: 1 };
        F[path] = { data, sha, dirty: false, deleted: false, v: (local.v || 0) + 1 };
        changedOpen.push(path);
      }
    }
    for (const [path, f] of Object.entries(F)) {
      if (!path.startsWith('data/') || remote[path]) continue;
      if (f.sha) { // 以前は同期済み → 他の端末で削除された
        if (f.dirty && !f.deleted) f.sha = null; else { delete F[path]; changedOpen.push(path); }
      } else if (f.deleted) delete F[path];
    }

    // ---- push ----
    const changes = Object.entries(F).filter(([p, f]) => p.startsWith('data/') && (f.dirty || (f.deleted && remote[p])));
    if (changes.length || !hasClaudeMd) {
      const snap = Object.fromEntries(changes.map(([p, f]) => [p, f.v]));
      const entries = changes.map(([p, f]) => f.deleted
        ? { path: p, mode: '100644', type: 'blob', sha: null }
        : { path: p, mode: '100644', type: 'blob', content: JSON.stringify(f.data, null, 2) + '\n' });
      if (!hasClaudeMd) entries.push({ path: 'CLAUDE.md', mode: '100644', type: 'blob', content: DATA_GUIDE });
      const newTree = await gh('git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
      const host = /iPhone|iPad|Android/.test(navigator.userAgent) ? 'スマホ' : 'PC';
      const newCommit = await gh('git/commits', { method: 'POST', body: { message: `まなびノート: ${changes.length}件を更新（${host}）`, tree: newTree.sha, parents: [headSha] } });
      try {
        await gh(`git/refs/heads/${encodeURIComponent(ghCfg.branch)}`, { method: 'PATCH', body: { sha: newCommit.sha } });
      } catch (e) {
        if (e.status === 422 || e.status === 409) { sync.again = true; throw Object.assign(new Error('retry'), { retry: true }); }
        throw e;
      }
      const after = await gh(`git/trees/${newTree.sha}?recursive=1`);
      const shaMap = Object.fromEntries(after.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
      for (const [p] of changes) {
        const f = F[p]; if (!f) continue;
        if (f.deleted) { if (f.v === snap[p]) delete F[p]; else f.sha = null; continue; }
        f.sha = shaMap[p] || f.sha;
        if (f.v === snap[p]) f.dirty = false;
      }
    }
    Store.persistNow();
    sync.last = Date.now();
    setSync('synced', '最終同期 ' + new Date().toLocaleTimeString('ja-JP'));
    if (manual) toast('同期しました');
  } catch (e) {
    Store.persistNow();
    if (!e.retry) {
      console.error(e);
      const msg = e.status === 401 ? 'トークンが無効です' : e.status === 404 ? 'リポジトリが見つかりません（名前・権限を確認）' : e.status === 403 ? '権限が足りません（Contents の読み書き権限が必要）' : e.message;
      setSync('error', msg);
      if (manual) toast('同期エラー: ' + msg, 4000);
    }
  } finally {
    sync.running = false;
    if (changedOpen.length) { refreshSide(); onRemoteChange(changedOpen); }
    if (sync.again) { sync.again = false; setTimeout(() => runSync(), 500); }
  }
}

/* ================= model helpers ================= */
function normalizeNote(n) {
  n.type = NOTE_TYPES[n.type] ? n.type : 'lined';
  n.title ??= ''; n.folder ??= ''; n.content ??= {};
  const c = n.content;
  if (TEXT_TYPES.includes(n.type)) c.text ??= '';
  if (n.type === 'bullet') c.items = Array.isArray(c.items) ? c.items : [];
  if (n.type === 'cornell') { c.cues ??= ''; c.notes ??= ''; c.summary ??= ''; }
  if (n.type === 'cards') c.cards = Array.isArray(c.cards) ? c.cards : [];
  return n;
}
function noteText(n) {
  const c = n.content || {};
  switch (n.type) {
    case 'bullet': return (c.items || []).map((i) => '  '.repeat(i.level || 0) + (i.text || '')).join('\n');
    case 'cornell': return [c.cues, c.notes, c.summary].filter(Boolean).join('\n\n');
    case 'cards': return (c.cards || []).map((k) => `${k.front || ''} | ${k.back || ''}`).join('\n');
    default: return c.text || '';
  }
}
function convertNote(n, type) {
  const text = noteText(n);
  const lines = text.split('\n');
  let content;
  if (TEXT_TYPES.includes(type)) content = { text };
  else if (type === 'bullet') content = { items: lines.filter((l) => l.trim()).map((l) => ({ text: l.trim(), level: Math.min(5, Math.floor((l.match(/^ */)[0].length) / 2)) })) };
  else if (type === 'cornell') content = { cues: '', notes: text, summary: '' };
  else if (type === 'cards') content = { cards: parseCardLines(text) };
  return { ...n, type, content };
}
function parseCardLines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.split(/\t| \| |｜|：|: /);
    return { id: uid('k'), front: (m[0] || '').trim(), back: m.slice(1).join(' ').trim(), ok: false };
  });
}
function newNote(type, folder = '') {
  const id = uid('n');
  const n = normalizeNote({ title: '', type, folder, createdAt: Date.now(), updatedAt: Date.now(), content: {} });
  if (type === 'bullet') n.content.items = [{ text: '', level: 0 }];
  if (type === 'cards') n.content.cards = [{ id: uid('k'), front: '', back: '', ok: false }];
  Store.put(P.note(id), n);
  return id;
}

/* ---- quizzes ---- */
function guessType(q) {
  if (q.type && Q_TYPES[q.type]) return q.type;
  if (q.answer && typeof q.answer === 'object' && !Array.isArray(q.answer) && (q.answer.debit || q.answer.credit)) return 'journal';
  if (Array.isArray(q.choices) && q.choices.length) return Array.isArray(q.answer) ? 'multi' : 'choice';
  if (typeof q.answer === 'number') return 'number';
  if (q.answer == null || q.answer === '') return 'self';
  return 'text';
}
function normQ(q, i) {
  q = { ...q };
  q.type = guessType(q);
  q.id = String(q.id ?? `q${i + 1}`);
  q.question = q.question ?? q.q ?? '';
  if (q.type === 'choice' && typeof q.answer === 'string') { const k = q.choices.indexOf(q.answer); if (k >= 0) q.answer = k; else if (/^[A-Za-zア-エ①-⑩0-9]$/.test(q.answer)) q.answer = 'ABCDEFGHIJ'.indexOf(q.answer.toUpperCase()); }
  if (q.type === 'multi' && Array.isArray(q.answer)) q.answer = q.answer.map((a) => (typeof a === 'string' ? q.choices.indexOf(a) : a));
  if (q.type === 'number' && typeof q.answer === 'string') q.answer = parseNum(q.answer);
  if (q.type === 'journal') { q.answer.debit ??= []; q.answer.credit ??= []; }
  return q;
}
function normalizeQuiz(z) {
  z = z && typeof z === 'object' ? z : {};
  z.title ??= ''; z.description ??= ''; z.folder ??= '';
  z.questions = (Array.isArray(z.questions) ? z.questions : []).map(normQ);
  return z;
}
function getQuiz(id) { const z = Store.get(P.quiz(id)); return z ? normalizeQuiz(structuredClone(z)) : null; }
function getProg(id) { return Store.get(P.prog(id)) || { q: {} }; }
function record(quizId, qid, ok) {
  const p = structuredClone(getProg(quizId)); p.q ||= {};
  const r = p.q[qid] || { c: 0, w: 0 };
  if (ok) r.c++; else r.w++;
  r.last = ok ? 'c' : 'w'; r.at = Date.now(); p.q[qid] = r;
  Store.put(P.prog(quizId), p);
}
function quizStats(z, prog) {
  let c = 0, w = 0, n = 0;
  for (const q of z.questions) { const r = prog.q?.[q.id]; if (!r) n++; else if (r.last === 'c') c++; else w++; }
  return { total: z.questions.length, c, w, n };
}
function extractJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const s = Math.min(...['{', '['].map((ch) => { const i = t.indexOf(ch); return i < 0 ? Infinity : i; }));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (s === Infinity || e < s) throw new Error('JSON が見つかりません');
  return JSON.parse(t.slice(s, e + 1));
}
function questionsFrom(obj) {
  if (Array.isArray(obj)) return { questions: obj };
  if (obj && Array.isArray(obj.questions)) return obj;
  if (obj && obj.question) return { questions: [obj] };
  throw new Error('"questions" 配列が見つかりません');
}
function validateQuestions(qs) {
  const errs = [];
  qs.forEach((q, i) => {
    const n = normQ(q, i), lab = `${i + 1}問目`;
    if (!n.question) errs.push(`${lab}: question がありません`);
    if (n.type === 'choice' && !(Number.isInteger(n.answer) && n.answer >= 0 && n.answer < n.choices.length)) errs.push(`${lab}: answer は choices の番号(0始まり)にしてください`);
    if (n.type === 'multi' && !(Array.isArray(n.answer) && n.answer.every((a) => a >= 0 && a < n.choices.length))) errs.push(`${lab}: answer は番号の配列にしてください`);
    if (n.type === 'number' && Number.isNaN(n.answer)) errs.push(`${lab}: 数値の answer が読めません`);
  });
  return errs;
}
function mergeQuestions(z, newQs) {
  const used = new Set(z.questions.map((q) => q.id));
  let k = z.questions.length;
  for (const q of newQs) {
    let id = q.id != null ? String(q.id) : null;
    if (!id || used.has(id)) { do { id = `q${++k}`; } while (used.has(id)); }
    used.add(id);
    z.questions.push({ ...q, id });
  }
  return z;
}

/* ================= AI prompt ================= */
const QUIZ_SCHEMA = `各問題は次のどれかの形式のJSONオブジェクトです（"explanation"＝解説 はどの形式でも推奨）。
- 選択問題: {"id":"q1","type":"choice","question":"問題文","choices":["選択肢A","選択肢B","選択肢C","選択肢D"],"answer":0,"explanation":"解説"}   ※answer は正解の番号（0始まり）
- 複数選択: {"id":"q2","type":"multi","question":"…（すべて選べ）","choices":["…","…","…"],"answer":[0,2],"explanation":"…"}
- 記述(短答): {"id":"q3","type":"text","question":"…","answer":["正解","別解"],"explanation":"…"}   ※表記ゆれは配列で複数
- 数値: {"id":"q4","type":"number","question":"…","answer":12000,"unit":"円","explanation":"…"}
- 仕訳(簿記): {"id":"q5","type":"journal","question":"取引文","accounts":["現金","売掛金","売上","仕入","買掛金"],"answer":{"debit":[{"account":"売掛金","amount":50000}],"credit":[{"account":"売上","amount":50000}]},"explanation":"…"}   ※accounts は選択肢として出す勘定科目（正解を含め5〜8個程度）
- 自己採点(論述など): {"id":"q6","type":"self","question":"…","answer":"模範解答","explanation":"…"}
任意の項目: "tags":["分野名"], "table":[["見出し1","見出し2"],["値1","値2"]]（問題文に表を添える場合）`;

function aiPromptNew(request) {
  return `あなたは資格試験・学習用の問題集の作成者です。次の依頼に沿って問題集を作り、JSONだけを出力してください（前置き・説明・コードブロック記号は不要）。

# 依頼
${request || '（ここに作りたい問題集の内容を書く：例「簿記3級の仕訳問題を15問、本試験レベルで」）'}

# 出力形式
{"title":"問題集のタイトル","description":"説明","folder":"分類（例: 簿記3級）","questions":[ 問題, 問題, ... ]}

${QUIZ_SCHEMA}

# 注意
- id は "q1","q2"… のように重複しない文字列にする
- 正解と解説は正確に。計算問題は検算すること
- JSON として正しい形式（末尾カンマなし・ダブルクォート）にする`;
}
function aiPromptAdd(request, z) {
  const existing = z.questions.map((q) => `- ${q.id} [${Q_TYPES[q.type] || q.type}] ${String(q.question).replace(/\s+/g, ' ').slice(0, 60)}`).join('\n');
  return `あなたは資格試験・学習用の問題集の作成者です。既存の問題集「${z.title}」に問題を追加します。次の依頼に沿って新しい問題を作り、JSONだけを出力してください（前置き・説明・コードブロック記号は不要）。

# 依頼
${request || '（ここに追加したい内容を書く：例「間違えやすい論点を10問追加」）'}

# 出力形式
{"questions":[ 問題, 問題, ... ]}

${QUIZ_SCHEMA}

# 既存の問題（内容が重複しないように。id もこれらと重複しないように）
${existing || '（まだありません）'}

# 注意
- 正解と解説は正確に。計算問題は検算すること
- JSON として正しい形式（末尾カンマなし・ダブルクォート）にする`;
}

/* ================= UI: modal & menu ================= */
function modal(title, body, actions = []) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-h' }, h('div', { class: 'grow' }, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': '閉じる' }, '✕')),
      h('div', { class: 'modal-b' }, body),
      actions.length ? h('div', { class: 'modal-f' }, actions.map((a) => h('button', { class: 'btn ' + (a.cls || ''), onclick: async () => { if ((await a.run?.(close)) !== false) close(); } }, a.label))) : null));
  document.body.append(ov); document.addEventListener('keydown', onKey);
  setTimeout(() => ov.querySelector('input, textarea')?.focus(), 30);
  return close;
}
function menuButton(items) {
  const wrap = h('div', { class: 'menu' });
  const btn = h('button', { class: 'icon-btn', 'aria-label': 'メニュー', onclick: (e) => {
    e.stopPropagation();
    const existing = wrap.querySelector('.menu-pop'); if (existing) { existing.remove(); return; }
    const pop = h('div', { class: 'menu-pop' }, items.filter(Boolean).map((it) => h('button', { class: it.danger ? 'danger' : '', onclick: () => { pop.remove(); it.run(); } }, it.label)));
    wrap.append(pop);
    setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0);
  } }, '⋯');
  wrap.append(btn); return wrap;
}
function confirmDlg(msg, okLabel = 'OK', danger = false) {
  return new Promise((res) => {
    let done = false;
    const close = modal('確認', h('p', {}, msg), [
      { label: 'キャンセル', run: () => { done = true; res(false); } },
      { label: okLabel, cls: danger ? 'primary danger' : 'primary', run: () => { done = true; res(true); } },
    ]);
    const ov = document.querySelector('.overlay:last-of-type');
    new MutationObserver((_, obs) => { if (!ov.isConnected) { obs.disconnect(); if (!done) res(false); } }).observe(document.body, { childList: true });
    void close;
  });
}

/* ================= router ================= */
const ui = { search: '', folder: null, noteMode: {}, flash: {}, play: null, showAns: {} };
function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(qs || '') };
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => render());
function render() {
  const { parts } = route();
  document.body.classList.toggle('detail', parts.length > 0);
  renderSide();
  renderMain();
}
function renderMain() {
  const { parts, params } = route();
  const main = $('#main');
  main.replaceChildren();
  main.scrollTop = 0;
  const [a, b] = parts;
  if (a === 'note' && b) return renderNote(main, b);
  if (a === 'quiz' && b) return renderQuiz(main, b);
  if (a === 'play' && b) return renderPlay(main, b, params);
  if (a === 'settings') return renderSettings(main);
  main.append(h('div', { class: 'welcome' },
    h('div', { style: { fontSize: '48px' } }, '📚'),
    h('h2', {}, 'まなびノート'),
    h('p', {}, '左の一覧からノートや問題集を選ぶか、「＋ 新規」で作成してください。'),
    !ghCfg?.token ? h('p', { class: 'small' }, 'PCとスマホで同じ内容を見るには ', h('a', { href: '#/settings' }, '設定 → GitHub 同期'), ' を設定します。') : null));
}
function onRemoteChange(paths) {
  const { parts } = route();
  const cur = parts[0] === 'note' ? P.note(parts[1]) : parts[0] === 'quiz' ? P.quiz(parts[1]) : null;
  if (cur && paths.includes(cur) && !document.activeElement?.matches('textarea, input')) renderMain();
  else if (parts[0] === 'quiz' && paths.includes(P.prog(parts[1]))) renderMain();
}

/* ================= side list ================= */
const refreshSide = debounce(() => renderList(), 250);
function renderSide() {
  const side = $('#side');
  if (!side.firstChild) {
    side.append(
      h('div', { class: 'side-head' },
        h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), 'まなびノート'),
        h('button', { id: 'syncpill', class: 'sync-pill', onclick: () => (ghCfg?.token ? runSync({ manual: true }) : go('#/settings')) }),
        h('button', { class: 'icon-btn', title: '設定', 'aria-label': '設定', onclick: () => go('#/settings') }, '⚙️')),
      h('div', { class: 'tabs', id: 'tabs' }),
      h('div', { class: 'search' }, h('input', { type: 'search', placeholder: '検索', value: ui.search, oninput: (e) => { ui.search = e.target.value; renderList(); } })),
      h('div', { class: 'chips', id: 'chips' }),
      h('div', { class: 'list', id: 'list' }),
      h('button', { class: 'fab', onclick: () => (prefs.tab === 'quizzes' ? newQuizDialog() : newNoteDialog()) }, '＋ 新規'));
  }
  paintSyncPill($('#syncpill'));
  renderList();
}
function renderList() {
  const tabs = $('#tabs'); if (!tabs) return;
  tabs.replaceChildren(
    h('button', { class: prefs.tab === 'notes' ? 'on' : '', onclick: () => { prefs.tab = 'notes'; ui.folder = null; savePrefs(); renderList(); } }, '📒 ノート'),
    h('button', { class: prefs.tab === 'quizzes' ? 'on' : '', onclick: () => { prefs.tab = 'quizzes'; ui.folder = null; savePrefs(); renderList(); } }, '✏️ 問題集'));
  const isQuiz = prefs.tab === 'quizzes';
  let items = Store.list(isQuiz ? 'data/quizzes/' : 'data/notes/');
  const folders = [...new Set(items.map((i) => i.data.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  $('#chips').replaceChildren(...(folders.length ? [h('button', { class: 'chip' + (ui.folder == null ? ' on' : ''), onclick: () => { ui.folder = null; renderList(); } }, 'すべて'),
    ...folders.map((f) => h('button', { class: 'chip' + (ui.folder === f ? ' on' : ''), onclick: () => { ui.folder = f; renderList(); } }, f))] : []));
  if (ui.folder != null) items = items.filter((i) => i.data.folder === ui.folder);
  const q = norm(ui.search);
  if (q) items = items.filter((i) => norm(i.data.title + ' ' + (isQuiz ? (i.data.questions || []).map((x) => x.question).join(' ') : noteText(i.data))).includes(q));
  items.sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
  const { parts } = route();
  const list = $('#list');
  if (!items.length) { list.replaceChildren(h('div', { class: 'empty' }, q ? '見つかりませんでした' : isQuiz ? 'まだ問題集がありません。\n「＋ 新規」から作成・AIで生成できます。' : 'まだノートがありません。')); return; }
  list.replaceChildren(...items.map((i) => {
    const d = i.data;
    let ico, sub;
    if (isQuiz) {
      const st = quizStats(normalizeQuiz(structuredClone(d)), getProg(i.id));
      ico = '✏️'; sub = `${st.total}問 ・ 正解 ${st.c} ・ 不正解 ${st.w}`;
    } else {
      ico = NOTE_TYPES[d.type]?.icon || '📓';
      sub = noteText(d).replace(/\[\[|\]\]|\*\*/g, '').replace(/\s+/g, ' ').slice(0, 60) || NOTE_TYPES[d.type]?.name;
    }
    const href = `#/${isQuiz ? 'quiz' : 'note'}/${i.id}`;
    const on = parts[1] === i.id;
    return h('a', { class: 'item' + (on ? ' on' : ''), href },
      h('div', { class: 'ico' }, ico),
      h('div', { class: 'body' },
        h('div', { class: 't' }, d.title || '無題'),
        h('div', { class: 's' }, [d.folder ? `📁${d.folder} ・ ` : '', fmtDate(d.updatedAt), ' ', sub].join(''))));
  }));
}

/* ================= new dialogs ================= */
function newNoteDialog() {
  const grid = h('div', { class: 'type-grid' }, Object.entries(NOTE_TYPES).map(([k, t]) =>
    h('button', { class: 'type-opt', onclick: () => { close(); const id = newNote(k, ui.folder || ''); ui.noteMode[id] = 'edit'; go(`#/note/${id}`); setTimeout(() => $('.title-input')?.focus(), 50); } },
      h('div', { class: 'pv ' + k }), h('b', {}, t.icon + ' ' + t.name), h('span', {}, t.desc))));
  const close = modal('新しいノート', grid);
}
function newQuizDialog() {
  const req = h('textarea', { class: 'plain', rows: 3, placeholder: '例：簿記3級の仕訳問題を15問、本試験レベルで。解説も詳しく。' });
  const paste = h('textarea', { class: 'plain', rows: 6, placeholder: 'AIが出力したJSONをここに貼り付け' });
  const body = h('div', {},
    h('p', { class: 'small muted' }, 'AI（Claude や ChatGPT など）に問題集を作ってもらって取り込めます。'),
    h('label', {}, '① 作りたい問題集の内容'), req,
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn sm', onclick: async () => { (await copyText(aiPromptNew(req.value.trim()))) ? toast('AIへの依頼文をコピーしました。AIに貼り付けてください') : toast('コピーできませんでした'); } }, '📋 AIへの依頼文をコピー')),
    h('label', {}, '② AIの回答（JSON）を貼り付け'), paste,
    h('p', { class: 'hint' }, 'Claude Code でデータ用リポジトリを開いて「問題集を作って」と頼むと、直接追加されて同期されます（設定画面の説明参照）。'));
  modal('新しい問題集', body, [
    { label: '空の問題集を作る', run: () => { const id = uid('z'); Store.put(P.quiz(id), { title: '新しい問題集', description: '', folder: ui.folder || '', createdAt: Date.now(), updatedAt: Date.now(), questions: [] }); prefs.tab = 'quizzes'; go(`#/quiz/${id}`); } },
    { label: '取り込む', cls: 'primary', run: () => {
      try {
        const obj = questionsFrom(extractJson(paste.value));
        const errs = validateQuestions(obj.questions);
        if (errs.length) { toast(errs.slice(0, 3).join(' / '), 5000); return false; }
        const id = uid('z');
        const z = mergeQuestions({ title: obj.title || '新しい問題集', description: obj.description || '', folder: obj.folder || ui.folder || '', accounts: obj.accounts, createdAt: Date.now(), updatedAt: Date.now(), questions: [] }, obj.questions);
        Store.put(P.quiz(id), z); prefs.tab = 'quizzes'; savePrefs(); toast(`${z.questions.length}問を取り込みました`); go(`#/quiz/${id}`);
      } catch (e) { toast('読み込めません: ' + e.message, 4000); return false; }
    } },
  ]);
}

/* ================= note editor ================= */
function folderInput(value, onChange, prefix) {
  const listId = 'folders-' + prefix;
  const folders = [...new Set(Store.list(`data/${prefix}/`).map((i) => i.data.folder).filter(Boolean))];
  return [h('input', { type: 'text', value, placeholder: '📁 フォルダ', list: listId, style: { width: '140px' }, onchange: (e) => onChange(e.target.value.trim()) }),
    h('datalist', { id: listId }, folders.map((f) => h('option', { value: f })))];
}
function backBtn() { return h('button', { class: 'icon-btn mobile-only', 'aria-label': '戻る', onclick: () => go('#/') }, '‹'); }

function renderNote(main, id) {
  const path = P.note(id);
  const raw = Store.get(path);
  if (!raw) { main.append(h('div', { class: 'welcome' }, h('p', {}, 'ノートが見つかりません'), h('a', { href: '#/' }, '一覧へ'))); return; }
  const n = normalizeNote(structuredClone(raw));
  const save = () => { n.updatedAt = Date.now(); Store.put(path, structuredClone(n)); };
  const saveSoon = debounce(save, 400);
  const isText = TEXT_TYPES.includes(n.type);
  const modes = n.type === 'cards' ? [['edit', '編集'], ['sheet', '赤シート'], ['flash', 'カード']] : [['edit', '編集'], ['hide', '暗記']];
  const mode = ui.noteMode[id] || 'edit';

  main.append(h('div', { class: 'topbar' },
    backBtn(),
    h('input', { class: 'title-input', value: n.title, placeholder: '無題のノート', oninput: (e) => { n.title = e.target.value; saveSoon(); } }),
    menuButton([
      { label: '📄 複製', run: () => { const nid = uid('n'); Store.put(P.note(nid), { ...structuredClone(n), title: n.title + '（コピー）', createdAt: Date.now(), updatedAt: Date.now() }); go(`#/note/${nid}`); } },
      { label: '⬇️ JSONで書き出し', run: () => download(`${n.title || 'note'}.json`, JSON.stringify(n, null, 2)) },
      { label: '📋 テキストをコピー', run: async () => { await copyText(noteText(n)); toast('コピーしました'); } },
      { label: '🗑 削除', danger: true, run: async () => { if (await confirmDlg(`「${n.title || '無題'}」を削除しますか？`, '削除', true)) { Store.remove(path); go('#/'); } } },
    ])));

  main.append(h('div', { class: 'meta' },
    h('select', { 'aria-label': 'ノートの形式', onchange: async (e) => {
      const t = e.target.value;
      if (await confirmDlg(`形式を「${NOTE_TYPES[t].name}」に変更しますか？（内容はできるだけ引き継ぎます）`, '変更')) {
        Object.assign(n, normalizeNote(convertNote(n, t))); save(); renderMain();
      } else e.target.value = n.type;
    } }, Object.entries(NOTE_TYPES).map(([k, t]) => h('option', { value: k, selected: k === n.type }, t.icon + ' ' + t.name))),
    folderInput(n.folder, (v) => { n.folder = v; save(); }, 'notes'),
    h('div', { class: 'grow' }),
    h('div', { class: 'seg' }, modes.map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { ui.noteMode[id] = k; renderMain(); } }, l)))));

  const content = h('div', { class: 'content' });
  main.append(content);
  if (isText) textEditor(content, n, mode, saveSoon);
  else if (n.type === 'bullet') bulletEditor(content, n, mode, saveSoon, save);
  else if (n.type === 'cornell') cornellEditor(content, n, mode, saveSoon);
  else if (n.type === 'cards') cardsEditor(content, n, id, mode, saveSoon, save);
}

function wrapSelection(ta, before, after, onChange) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  if (s === e) { toast('先に文字を選択してください'); return; }
  ta.value = v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e);
  ta.setSelectionRange(s, e + before.length + after.length); ta.focus();
  ta.dispatchEvent(new Event('input')); onChange?.();
}
function markToolbar(getTa) {
  return h('div', { class: 'toolbar' },
    h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => { const ta = getTa(); ta && wrapSelection(ta, '[[', ']]'); } }, '🟥 隠す語にする'),
    h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => { const ta = getTa(); ta && wrapSelection(ta, '**', '**'); } }, '𝐁 太字'),
    h('span', { class: 'hint', style: { alignSelf: 'center' } }, '[[ ]] で囲んだ語は「暗記」で赤シートのように隠れます'));
}
function textEditor(root, n, mode, saveSoon) {
  if (mode === 'hide') {
    const v = h('div', { class: `paper ${n.type} view`, html: renderMarked(n.content.text, true) || '<span class="muted">（空のノート）</span>' });
    bindMasks(v);
    root.append(h('div', { class: 'toolbar' },
      h('button', { onclick: () => v.querySelectorAll('.mask').forEach((m) => m.classList.add('shown')) }, '👀 すべて表示'),
      h('button', { onclick: () => v.querySelectorAll('.mask').forEach((m) => m.classList.remove('shown')) }, '🟥 すべて隠す'),
      h('span', { class: 'hint', style: { alignSelf: 'center' } }, '赤い部分をタップすると答えが見えます')), v);
    return;
  }
  const ta = h('textarea', { class: `paper ${n.type}`, value: n.content.text, placeholder: 'ここに書く…', spellcheck: false,
    oninput: () => { n.content.text = ta.value; autosize(ta); saveSoon(); } });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('　', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  root.append(markToolbar(() => ta), ta);
  requestAnimationFrame(() => autosize(ta));
}

function bulletEditor(root, n, mode, saveSoon, save) {
  const items = n.content.items;
  if (!items.length) items.push({ text: '', level: 0 });
  const wrap = h('div', { class: 'paper bullets' });
  const glyph = ['•', '◦', '▪', '‣', '–', '·'];
  let cur = 0;
  if (mode === 'hide') {
    items.forEach((it) => wrap.append(h('div', { class: `b-row lv${it.level}` + (it.check === true ? ' done' : ''), style: { paddingLeft: it.level * 24 + 'px' } },
      h('span', { class: 'b-mark' }, it.check != null ? (it.check ? '☑' : '☐') : glyph[it.level % glyph.length]),
      h('div', { class: 'b-view', html: renderMarked(it.text, true) || '&nbsp;' }))));
    bindMasks(wrap);
    root.append(h('div', { class: 'toolbar' },
      h('button', { onclick: () => wrap.querySelectorAll('.mask').forEach((m) => m.classList.add('shown')) }, '👀 すべて表示'),
      h('button', { onclick: () => wrap.querySelectorAll('.mask').forEach((m) => m.classList.remove('shown')) }, '🟥 すべて隠す')), wrap);
    return;
  }
  const commit = () => { save(); };
  function draw(focus, caret) {
    wrap.replaceChildren(...items.map((it, i) => {
      const ta = h('textarea', { class: 'b-text', rows: 1, value: it.text, placeholder: i === 0 && items.length === 1 ? '箇条書きで書く…（Enterで次の項目、Tabで字下げ）' : '' });
      ta.addEventListener('focus', () => { cur = i; });
      ta.addEventListener('input', () => { it.text = ta.value.replace(/\n/g, ' '); if (ta.value.includes('\n')) ta.value = it.text; autosize(ta); saveSoon(); });
      ta.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        const s = ta.selectionStart, en = ta.selectionEnd;
        if (e.key === 'Enter') {
          e.preventDefault();
          const after = ta.value.slice(en); it.text = ta.value.slice(0, s);
          if (!it.text && !after && it.level > 0) { it.level--; commit(); draw(i, 0); return; }
          items.splice(i + 1, 0, { text: after, level: it.level, ...(it.check != null ? { check: false } : {}) });
          commit(); draw(i + 1, 0);
        } else if (e.key === 'Backspace' && s === 0 && en === 0) {
          if (it.level > 0) { e.preventDefault(); it.level--; commit(); draw(i, 0); }
          else if (i > 0) { e.preventDefault(); const prev = items[i - 1]; const pl = prev.text.length; prev.text += it.text; items.splice(i, 1); commit(); draw(i - 1, pl); }
        } else if (e.key === 'Tab') {
          e.preventDefault(); it.level = Math.max(0, Math.min(5, it.level + (e.shiftKey ? -1 : 1))); commit(); draw(i, s);
        } else if (e.key === 'ArrowUp' && s === 0 && i > 0) { e.preventDefault(); draw(i - 1, items[i - 1].text.length); }
        else if (e.key === 'ArrowDown' && en === ta.value.length && i < items.length - 1) { e.preventDefault(); draw(i + 1, 0); }
      });
      const mark = it.check != null
        ? h('input', { type: 'checkbox', checked: !!it.check, onchange: (e) => { it.check = e.target.checked; commit(); draw(); } })
        : glyph[it.level % glyph.length];
      return h('div', { class: `b-row lv${it.level}` + (it.check === true ? ' done' : ''), style: { paddingLeft: it.level * 24 + 'px' } }, h('span', { class: 'b-mark' }, mark), ta);
    }));
    wrap.querySelectorAll('textarea').forEach(autosize);
    if (focus != null) { const ta = wrap.querySelectorAll('textarea')[focus]; if (ta) { ta.focus(); const c = caret ?? ta.value.length; ta.setSelectionRange(c, c); cur = focus; } }
  }
  const act = (fn) => ({ onmousedown: (e) => e.preventDefault(), onclick: () => { fn(); commit(); draw(cur); } });
  root.append(h('div', { class: 'toolbar' },
    h('button', act(() => { items[cur].level = Math.min(5, items[cur].level + 1); }), '→ 字下げ'),
    h('button', act(() => { items[cur].level = Math.max(0, items[cur].level - 1); }), '← 戻す'),
    h('button', act(() => { const it = items[cur]; if (it.check == null) it.check = false; else delete it.check; }), '☑ チェック'),
    h('button', act(() => { if (cur > 0) { [items[cur - 1], items[cur]] = [items[cur], items[cur - 1]]; cur--; } }), '↑'),
    h('button', act(() => { if (cur < items.length - 1) { [items[cur + 1], items[cur]] = [items[cur], items[cur + 1]]; cur++; } }), '↓'),
    h('button', act(() => { items.splice(cur + 1, 0, { text: '', level: items[cur]?.level || 0 }); cur++; }), '＋ 項目'),
    h('button', act(() => { if (items.length > 1) { items.splice(cur, 1); cur = Math.max(0, cur - 1); } else items[0].text = ''; }), '✕ 削除'),
    h('button', { onmousedown: (e) => e.preventDefault(), onclick: () => { const ta = wrap.querySelectorAll('textarea')[cur]; ta && wrapSelection(ta, '[[', ']]'); } }, '🟥 隠す語')), wrap);
  draw();
}

function cornellEditor(root, n, mode, saveSoon) {
  const c = n.content;
  const hide = mode === 'hide';
  let last = null;
  const area = (key, ph) => {
    if (hide) return h('div', { class: 'cview', html: renderMarked(c[key], true) || '&nbsp;' });
    const ta = h('textarea', { value: c[key], placeholder: ph, oninput: () => { c[key] = ta.value; autosize(ta); saveSoon(); }, onfocus: () => { last = ta; } });
    requestAnimationFrame(() => autosize(ta)); return ta;
  };
  const noteBox = h('div', { class: 'note' }, h('div', { class: 'lbl' }, 'ノート'), area('notes', '授業・教科書の内容'));
  const box = h('div', { class: 'paper cornell' },
    h('div', { class: 'cue' }, h('div', { class: 'lbl' }, 'キーワード・問い'), area('cues', '重要語句や自分への問い')),
    noteBox,
    h('div', { class: 'sum' }, h('div', { class: 'lbl' }, 'まとめ'), area('summary', '数行で要約')));
  if (hide) {
    bindMasks(box);
    const cover = h('button', { onclick: () => { noteBox.querySelector('.cview').classList.toggle('mask-block'); } }, '🙈 ノート欄を隠す/表示');
    root.append(h('div', { class: 'toolbar' }, cover,
      h('button', { onclick: () => box.querySelectorAll('.mask').forEach((m) => m.classList.add('shown')) }, '👀 すべて表示'),
      h('button', { onclick: () => box.querySelectorAll('.mask').forEach((m) => m.classList.remove('shown')) }, '🟥 すべて隠す')), box);
    noteBox.querySelector('.cview').classList.add('mask-block');
    return;
  }
  root.append(markToolbar(() => last), box);
}

function cardsEditor(root, n, id, mode, saveSoon, save) {
  const cards = n.content.cards;
  if (mode === 'sheet') {
    const t = h('table', { class: 'sheet' }, cards.map((k) => h('tr', {}, h('td', {}, k.front), h('td', {}, h('span', { class: 'mask' }, k.back || '　')))));
    bindMasks(t);
    root.append(h('div', { class: 'toolbar' },
      h('button', { onclick: () => t.querySelectorAll('.mask').forEach((m) => m.classList.add('shown')) }, '👀 すべて表示'),
      h('button', { onclick: () => t.querySelectorAll('.mask').forEach((m) => m.classList.remove('shown')) }, '🟥 すべて隠す'),
      h('span', { class: 'hint', style: { alignSelf: 'center' } }, `${cards.length}枚 ・ 赤い部分をタップ`)), cards.length ? t : h('div', { class: 'empty' }, 'カードがありません'));
    return;
  }
  if (mode === 'flash') return flashCards(root, n, id, save);

  const list = h('div', { class: 'cards' });
  const draw = (focusLast) => {
    list.replaceChildren(...cards.map((k, i) => {
      const f = h('textarea', { rows: 1, value: k.front, placeholder: '表（問題・用語）', oninput: () => { k.front = f.value; autosize(f); saveSoon(); } });
      const b = h('textarea', { class: 'back', rows: 1, value: k.back, placeholder: '裏（答え・意味）', oninput: () => { k.back = b.value; autosize(b); saveSoon(); } });
      return h('div', { class: 'card-row' },
        h('div', { class: 'no' }, i + 1, h('br'), h('span', { class: 'ok-dot' + (k.ok ? ' ok' : ''), title: k.ok ? '覚えた' : 'まだ' })),
        f, b,
        h('button', { class: 'icon-btn del', 'aria-label': '削除', onclick: () => { cards.splice(i, 1); save(); draw(); } }, '✕'));
    }));
    list.querySelectorAll('textarea').forEach(autosize);
    if (focusLast) list.querySelectorAll('.card-row:last-child textarea')[0]?.focus();
  };
  root.append(h('div', { class: 'toolbar' },
    h('button', { onclick: () => { cards.push({ id: uid('k'), front: '', back: '', ok: false }); save(); draw(true); } }, '＋ カード追加'),
    h('button', { onclick: () => bulkCards(cards, () => { save(); draw(); }) }, '📥 まとめて入力'),
    h('button', { onclick: () => { cards.forEach((k) => (k.ok = false)); save(); draw(); toast('習得状況をリセットしました'); } }, '↺ 習得リセット'),
    h('span', { class: 'hint', style: { alignSelf: 'center' } }, `${cards.length}枚 ・ 覚えた ${cards.filter((k) => k.ok).length}`)), list,
    h('button', { class: 'btn', style: { marginTop: '10px', width: '100%' }, onclick: () => { cards.push({ id: uid('k'), front: '', back: '', ok: false }); save(); draw(true); } }, '＋ カード追加'));
  draw();
}
function bulkCards(cards, done) {
  const ta = h('textarea', { class: 'plain', rows: 10, placeholder: '1行に1枚。表と裏は「 | 」かタブで区切る\n例:\n資産 | 現金・預金・売掛金など\n負債 | 買掛金・借入金など' });
  modal('まとめて入力', h('div', {}, ta, h('p', { class: 'hint' }, 'Excel やスプレッドシートの2列をそのまま貼り付けてもOK。AIに「暗記カード用に『用語 | 意味』の形式で」と頼むのも便利です。')), [
    { label: 'キャンセル' },
    { label: '追加', cls: 'primary', run: () => { const add = parseCardLines(ta.value); for (let i = cards.length - 1; i >= 0; i--) if (!cards[i].front && !cards[i].back) cards.splice(i, 1); cards.push(...add); done(); toast(`${add.length}枚追加しました`); } },
  ]);
}
function flashCards(root, n, id, save) {
  const cards = n.content.cards.filter((k) => k.front || k.back);
  let st = ui.flash[id];
  const start = (onlyNg, rnd) => {
    let pool = cards.filter((k) => !onlyNg || !k.ok);
    if (rnd) pool = shuffle(pool);
    ui.flash[id] = { order: pool.map((k) => k.id), idx: 0, flipped: false, ok: 0, ng: 0 };
    renderMain();
  };
  if (!st) {
    const ng = cards.filter((k) => !k.ok).length;
    root.append(h('div', { class: 'flash-wrap' },
      h('div', { class: 'panel', style: { width: '100%', maxWidth: '560px', textAlign: 'center' } },
        h('div', { style: { fontSize: '40px' } }, '🃏'),
        h('p', {}, `${cards.length}枚 ・ 覚えた ${cards.length - ng} ・ まだ ${ng}`),
        h('div', { class: 'play-modes' },
          h('button', { class: 'btn primary', disabled: !cards.length, onclick: () => start(false, false) }, '順番どおり'),
          h('button', { class: 'btn', disabled: !cards.length, onclick: () => start(false, true) }, 'シャッフル'),
          h('button', { class: 'btn', disabled: !ng, onclick: () => start(true, true) }, `「まだ」だけ (${ng})`)))));
    return;
  }
  const k = n.content.cards.find((c) => c.id === st.order[st.idx]);
  if (!k) {
    root.append(h('div', { class: 'flash-wrap' }, h('div', { class: 'panel', style: { width: '100%', maxWidth: '560px', textAlign: 'center' } },
      h('div', { style: { fontSize: '40px' } }, '🎉'), h('h3', {}, 'おつかれさま！'), h('p', {}, `覚えた ${st.ok} ・ まだ ${st.ng}`),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: () => { delete ui.flash[id]; renderMain(); } }, 'メニューへ'),
        st.ng ? h('button', { class: 'btn', onclick: () => start(true, true) }, '「まだ」をもう一度') : null))));
    return;
  }
  const ans = (ok) => { k.ok = ok; save(); st.idx++; st.flipped = false; ok ? st.ok++ : st.ng++; renderMain(); };
  root.append(h('div', { class: 'flash-wrap' },
    h('div', { class: 'row', style: { width: '100%', maxWidth: '560px' } }, h('span', { class: 'muted small grow' }, `${st.idx + 1} / ${st.order.length}`), h('button', { class: 'btn sm ghost', onclick: () => { delete ui.flash[id]; renderMain(); } }, '終了')),
    h('div', { class: 'progressbar' }, h('div', { style: { width: (st.idx / st.order.length) * 100 + '%' } })),
    h('div', { class: 'flash' + (st.flipped ? ' back' : ''), onclick: () => { st.flipped = !st.flipped; renderMain(); } },
      h('div', { class: 'side-lbl' }, st.flipped ? '裏（タップで表）' : '表（タップでめくる）'),
      h('div', {}, k.front),
      st.flipped ? h('div', { class: 'back-text', style: { marginTop: '16px' } }, k.back) : null),
    h('div', { class: 'big-btns' },
      h('button', { class: 'btn ngb', onclick: () => ans(false) }, '😣 まだ'),
      h('button', { class: 'btn okb', onclick: () => ans(true) }, '😊 覚えた'))));
}

/* ================= quiz overview ================= */
function renderQuiz(main, id) {
  const z = getQuiz(id);
  if (!z) { main.append(h('div', { class: 'welcome' }, h('p', {}, '問題集が見つかりません'), h('a', { href: '#/' }, '一覧へ'))); return; }
  const prog = getProg(id);
  const st = quizStats(z, prog);
  const saveQuiz = (zz) => { zz.updatedAt = Date.now(); Store.put(P.quiz(id), zz); };
  const raw = () => structuredClone(Store.get(P.quiz(id)));

  main.append(h('div', { class: 'topbar' },
    backBtn(),
    h('input', { class: 'title-input', value: z.title, placeholder: '無題の問題集', onchange: (e) => { const r = raw(); r.title = e.target.value; saveQuiz(r); } }),
    menuButton([
      { label: '🤖 AIで問題を追加', run: () => aiAddDialog(id) },
      { label: '{ } JSONを直接編集', run: () => jsonEditDialog(id) },
      { label: '⬇️ JSONで書き出し', run: () => download(`${z.title || 'quiz'}.json`, JSON.stringify(Store.get(P.quiz(id)), null, 2)) },
      { label: '↺ 解答記録をリセット', run: async () => { if (await confirmDlg('この問題集の解答記録をすべて消しますか？', 'リセット', true)) { Store.put(P.prog(id), { q: {} }); renderMain(); } } },
      { label: '🗑 問題集を削除', danger: true, run: async () => { if (await confirmDlg(`「${z.title}」を削除しますか？`, '削除', true)) { Store.remove(P.quiz(id)); if (Store.get(P.prog(id))) Store.remove(P.prog(id)); go('#/'); } } },
    ])));
  main.append(h('div', { class: 'meta' },
    folderInput(z.folder, (v) => { const r = raw(); r.folder = v; saveQuiz(r); }, 'quizzes'),
    h('input', { type: 'text', value: z.description, placeholder: '説明', class: 'grow', onchange: (e) => { const r = raw(); r.description = e.target.value; saveQuiz(r); } })));

  const c = h('div', { class: 'content' });
  main.append(c);
  const rate = st.c + st.w ? Math.round((st.c / (st.c + st.w)) * 100) + '%' : '—';
  c.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', {}, st.total), h('span', {}, '問題数')),
    h('div', { class: 'stat' }, h('b', { style: { color: 'var(--ok)' } }, st.c), h('span', {}, '前回正解')),
    h('div', { class: 'stat' }, h('b', { style: { color: 'var(--ng)' } }, st.w), h('span', {}, '前回不正解')),
    h('div', { class: 'stat' }, h('b', {}, rate), h('span', {}, '正答率'))));
  const tags = [...new Set(z.questions.flatMap((q) => q.tags || []))];
  const tagSel = tags.length ? h('select', {}, h('option', { value: '' }, 'すべての分野'), tags.map((t) => h('option', { value: t }, t))) : null;
  const goPlay = (mode) => go(`#/play/${id}?mode=${mode}${tagSel?.value ? '&tag=' + encodeURIComponent(tagSel.value) : ''}&t=${Date.now()}`);
  c.append(
    tagSel ? h('div', { class: 'row' }, h('span', { class: 'small muted' }, '分野:'), tagSel) : null,
    h('div', { class: 'play-modes' },
      h('button', { class: 'btn primary', disabled: !st.total, onclick: () => goPlay('all') }, '▶ 最初から'),
      h('button', { class: 'btn', disabled: !st.total, onclick: () => goPlay('shuffle') }, '🔀 シャッフル'),
      h('button', { class: 'btn', disabled: !st.w, onclick: () => goPlay('wrong') }, `❌ 間違えた問題 (${st.w})`),
      h('button', { class: 'btn', disabled: !st.n, onclick: () => goPlay('new') }, `🆕 未回答 (${st.n})`)));
  if (!st.total) {
    c.append(h('div', { class: 'panel' }, h('p', {}, 'まだ問題がありません。AIに作ってもらいましょう。'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => aiAddDialog(id) }, '🤖 AIで問題を追加'), h('button', { class: 'btn', onclick: () => jsonEditDialog(id) }, '{ } JSONを編集'))));
    return;
  }
  const showAll = ui.showAns[id];
  c.append(h('div', { class: 'row', style: { marginTop: '18px' } },
    h('b', { class: 'grow' }, '問題一覧'),
    h('button', { class: 'btn sm', onclick: () => aiAddDialog(id) }, '🤖 AIで追加'),
    h('button', { class: 'btn sm', onclick: () => { ui.showAns[id] = !showAll; renderMain(); } }, showAll ? '答えを隠す' : '答えを表示')));
  c.append(h('div', { class: 'qlist' }, z.questions.map((q, i) => {
    const r = prog.q?.[q.id];
    const mk = !r ? ['n', '−'] : r.last === 'c' ? ['c', '○'] : ['w', '×'];
    return h('div', { class: 'qitem' },
      h('div', { class: 'mk ' + mk[0], title: r ? `正解${r.c}回・不正解${r.w}回` : '未回答' }, mk[1]),
      h('div', { class: 'qt' },
        h('span', { class: 'tag' }, `${i + 1}. ${Q_TYPES[q.type]}`), (q.tags || []).map((t) => h('span', { class: 'tag' }, t)),
        String(q.question).length > 140 ? String(q.question).slice(0, 140) + '…' : q.question,
        showAll ? h('div', { class: 'qa' }, '答: ', answerText(q, z)) : null),
      h('button', { class: 'icon-btn', title: 'この問題を解く', onclick: () => go(`#/play/${id}?mode=one&q=${encodeURIComponent(q.id)}&t=${Date.now()}`) }, '▶'),
      h('button', { class: 'icon-btn', title: '削除', onclick: async () => {
        if (!(await confirmDlg(`${i + 1}問目を削除しますか？`, '削除', true))) return;
        const rr = raw(); rr.questions = (rr.questions || []).filter((x, j) => String(x.id ?? `q${j + 1}`) !== q.id); saveQuiz(rr); renderMain();
      } }, '🗑'));
  })));
}
function answerText(q) {
  switch (q.type) {
    case 'choice': return `${'ABCDEFGHIJ'[q.answer] || '?'}. ${q.choices[q.answer] ?? ''}`;
    case 'multi': return (q.answer || []).map((a) => `${'ABCDEFGHIJ'[a]}. ${q.choices[a]}`).join(' / ');
    case 'text': return [].concat(q.answer).join(' / ');
    case 'number': return fmtNum(q.answer) + (q.unit || '');
    case 'journal': return `(借) ${q.answer.debit.map((r) => `${r.account} ${fmtNum(r.amount)}`).join('、')}　(貸) ${q.answer.credit.map((r) => `${r.account} ${fmtNum(r.amount)}`).join('、')}`;
    default: return String(q.answer ?? '');
  }
}
function aiAddDialog(id) {
  const z = getQuiz(id);
  const req = h('textarea', { class: 'plain', rows: 3, placeholder: '例：減価償却と貸倒引当金の問題を10問追加。間違えやすいひっかけも入れて。' });
  const paste = h('textarea', { class: 'plain', rows: 7, placeholder: 'AIが出力したJSONを貼り付け' });
  modal('🤖 AIで問題を追加', h('div', {},
    h('label', {}, '① 追加したい内容'), req,
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn sm', onclick: async () => { (await copyText(aiPromptAdd(req.value.trim(), z))) ? toast('依頼文をコピーしました。AIに貼り付けてください') : toast('コピーできませんでした'); } }, '📋 AIへの依頼文をコピー')),
    h('p', { class: 'hint' }, '既存の問題の一覧も依頼文に入るので、重複しない問題を作ってもらえます。'),
    h('label', {}, '② AIの回答（JSON）を貼り付け'), paste), [
    { label: 'キャンセル' },
    { label: '追加する', cls: 'primary', run: () => {
      try {
        const obj = questionsFrom(extractJson(paste.value));
        const errs = validateQuestions(obj.questions);
        if (errs.length) { toast(errs.slice(0, 3).join(' / '), 5000); return false; }
        const r = structuredClone(Store.get(P.quiz(id)));
        r.questions = (r.questions || []).map((q, i) => ({ ...q, id: String(q.id ?? `q${i + 1}`) }));
        mergeQuestions(r, obj.questions); r.updatedAt = Date.now();
        Store.put(P.quiz(id), r); toast(`${obj.questions.length}問を追加しました`); renderMain();
      } catch (e) { toast('読み込めません: ' + e.message, 4000); return false; }
    } }]);
}
function jsonEditDialog(id) {
  const ta = h('textarea', { class: 'plain', rows: 18, spellcheck: false, value: JSON.stringify(Store.get(P.quiz(id)), null, 2) });
  ta.style.minHeight = '50vh';
  modal('{ } 問題集のJSON', h('div', {}, ta, h('details', { class: 'small' }, h('summary', {}, '形式の説明'), h('pre', { style: { whiteSpace: 'pre-wrap' } }, QUIZ_SCHEMA))), [
    { label: '📋 コピー', run: async () => { await copyText(ta.value); toast('コピーしました'); return false; } },
    { label: 'キャンセル' },
    { label: '保存', cls: 'primary', run: () => {
      try {
        const obj = JSON.parse(ta.value);
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.questions)) throw new Error('"questions" 配列が必要です');
        const errs = validateQuestions(obj.questions);
        if (errs.length) { toast(errs.slice(0, 3).join(' / '), 5000); return false; }
        obj.updatedAt = Date.now(); Store.put(P.quiz(id), obj); toast('保存しました'); renderMain();
      } catch (e) { toast('JSONエラー: ' + e.message, 4000); return false; }
    } }]);
}

/* ================= quiz play ================= */
function renderPlay(main, id, params) {
  const z = getQuiz(id);
  if (!z) { go('#/'); return; }
  const key = params.get('t') || '';
  if (!ui.play || ui.play.id !== id || ui.play.key !== key) {
    const prog = getProg(id);
    const mode = params.get('mode') || 'all', tag = params.get('tag');
    let qs = z.questions.filter((q) => !tag || (q.tags || []).includes(tag));
    if (mode === 'wrong') qs = qs.filter((q) => prog.q?.[q.id]?.last === 'w');
    if (mode === 'new') qs = qs.filter((q) => !prog.q?.[q.id]);
    if (mode === 'one') qs = qs.filter((q) => q.id === params.get('q'));
    if (mode === 'shuffle' || mode === 'wrong' || mode === 'new') qs = shuffle(qs);
    ui.play = { id, key, order: qs.map((q) => q.id), idx: 0, res: {}, input: null, checked: false };
  }
  const S = ui.play;
  main.append(h('div', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: () => go(`#/quiz/${id}`) }, '‹'),
    h('div', { class: 'grow', style: { fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, z.title),
    h('span', { class: 'muted small' }, S.idx < S.order.length ? `${S.idx + 1} / ${S.order.length}` : '')));
  const c = h('div', { class: 'content' });
  main.append(c);
  const box = h('div', { class: 'qcard' });
  c.append(box);
  box.append(h('div', { class: 'progressbar', style: { maxWidth: 'none', marginBottom: '14px' } }, h('div', { style: { width: (S.idx / Math.max(1, S.order.length)) * 100 + '%' } })));

  if (!S.order.length) { box.append(h('div', { class: 'panel' }, '対象の問題がありません。', h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => go(`#/quiz/${id}`) }, '戻る')))); return; }
  if (S.idx >= S.order.length) {
    const ok = Object.values(S.res).filter(Boolean).length, total = Object.keys(S.res).length;
    const wrongIds = Object.entries(S.res).filter(([, v]) => !v).map(([k]) => k);
    box.append(h('div', { class: 'panel', style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '44px' } }, ok === total ? '🎉' : ok / total >= 0.7 ? '👍' : '💪'),
      h('h2', { style: { margin: '6px 0' } }, `${ok} / ${total} 問正解`),
      h('p', { class: 'muted' }, `正答率 ${total ? Math.round((ok / total) * 100) : 0}%`),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        wrongIds.length ? h('button', { class: 'btn primary', onclick: () => { ui.play = { id, key: 'retry' + Date.now(), order: shuffle(wrongIds), idx: 0, res: {}, input: null, checked: false }; renderMain(); } }, `間違えた${wrongIds.length}問を解き直す`) : null,
        h('button', { class: 'btn', onclick: () => go(`#/quiz/${id}`) }, '問題集へ戻る'))));
    return;
  }
  const q = z.questions.find((x) => x.id === S.order[S.idx]);
  if (!q) { S.idx++; renderMain(); return; }

  box.append(h('div', {}, h('span', { class: 'tag' }, Q_TYPES[q.type]), (q.tags || []).map((t) => h('span', { class: 'tag' }, t))));
  box.append(h('div', { class: 'qtext' }, q.question));
  if (Array.isArray(q.table) && q.table.length) {
    box.append(h('table', { class: 'data' }, h('thead', {}, h('tr', {}, q.table[0].map((x) => h('th', {}, x)))), h('tbody', {}, q.table.slice(1).map((r) => h('tr', {}, r.map((x) => h('td', {}, typeof x === 'number' ? fmtNum(x) : x)))))));
  }
  const area = h('div', {});
  box.append(area);
  const nav = h('div', { class: 'qnav' });
  box.append(nav);
  const finish = (ok) => { S.checked = true; S.res[q.id] = ok; record(id, q.id, ok); draw(); };
  const next = () => { S.idx++; S.input = null; S.checked = false; renderMain(); main.scrollTop = 0; };

  function resultBox(ok, extraAnswer = true) {
    return h('div', { class: 'result ' + (ok ? 'ok' : 'ng') },
      h('div', { class: 'verdict' }, ok ? '○ 正解！' : '× 不正解'),
      extraAnswer && q.type !== 'journal' ? h('div', { class: 'answer-line' }, h('b', {}, '正解: '), answerText(q)) : null,
      q.type === 'journal' ? journalTable(q.answer) : null,
      q.explanation ? h('div', { class: 'explain' }, h('b', {}, '解説: '), q.explanation) : null);
  }
  function draw() {
    area.replaceChildren(); nav.replaceChildren();
    const checkBtn = (fn, disabled) => h('button', { class: 'btn primary', disabled, onclick: fn }, '答え合わせ');
    const nextBtn = () => h('button', { class: 'btn primary', onclick: next }, S.idx + 1 < S.order.length ? '次の問題 →' : '結果を見る');
    const skip = () => h('button', { class: 'btn', onclick: () => finish(false) }, 'わからない');

    if (q.type === 'choice' || q.type === 'multi') {
      const multi = q.type === 'multi';
      S.input ??= multi ? [] : null;
      area.append(h('div', { class: 'choices' }, q.choices.map((ch, i) => {
        let cls = 'choice';
        const sel = multi ? S.input.includes(i) : S.input === i;
        if (S.checked) { const right = multi ? q.answer.includes(i) : q.answer === i; if (right) cls += ' correct'; else if (sel) cls += ' wrong'; }
        else if (sel) cls += ' sel';
        return h('button', { class: cls, disabled: S.checked, onclick: () => {
          if (multi) { S.input = sel ? S.input.filter((x) => x !== i) : [...S.input, i]; draw(); }
          else { S.input = i; finish(i === q.answer); }
        } }, h('span', { class: 'lab' }, (multi ? (sel ? '☑' : '☐') + ' ' : '') + 'ABCDEFGHIJ'[i] + '.'), h('span', {}, ch));
      })));
      if (S.checked) { area.append(resultBox(S.res[q.id])); nav.append(nextBtn()); }
      else if (multi) nav.append(skip(), checkBtn(() => { const a = [...S.input].sort().join(), b = [...q.answer].sort().join(); finish(a === b); }, !S.input.length));
      else nav.append(skip());
    } else if (q.type === 'text' || q.type === 'number') {
      const inp = h('input', { type: 'text', value: S.input ?? '', placeholder: q.type === 'number' ? '数値を入力' : '答えを入力', disabled: S.checked, inputmode: q.type === 'number' ? 'decimal' : null, style: { width: '100%', fontSize: '17px', padding: '12px' },
        oninput: (e) => { S.input = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); S.checked ? next() : check(); } } });
      const check = () => {
        const v = S.input ?? '';
        if (q.type === 'number') { const x = parseNum(v), tol = Number(q.tolerance) || 0; finish(!Number.isNaN(x) && Math.abs(x - q.answer) <= tol); }
        else finish([].concat(q.answer).some((a) => norm(a) === norm(v)));
      };
      area.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, inp), q.unit ? h('span', {}, q.unit) : null));
      if (S.checked) { area.append(resultBox(S.res[q.id])); nav.append(nextBtn()); }
      else { nav.append(skip(), checkBtn(check)); setTimeout(() => inp.focus(), 30); }
    } else if (q.type === 'journal') {
      journalInput(area, q, S, (ok) => finish(ok), nav, skip);
      if (S.checked) { area.append(resultBox(S.res[q.id])); nav.append(nextBtn()); }
    } else { // self
      const memo = h('textarea', { class: 'plain', rows: 4, placeholder: '自分の答えを書いてみる（任意）', value: S.input ?? '', style: { width: '100%' }, oninput: (e) => { S.input = e.target.value; } });
      area.append(memo);
      if (S.revealed && !S.checked) {
        area.append(h('div', { class: 'result', style: { background: 'var(--accent-weak)' } }, h('b', {}, '模範解答: '), h('div', { class: 'answer-line' }, String(q.answer ?? '')), q.explanation ? h('div', { class: 'explain' }, h('b', {}, '解説: '), q.explanation) : null));
        nav.append(h('button', { class: 'btn ngb', onclick: () => { S.revealed = false; finish(false); } }, '× できなかった'), h('button', { class: 'btn okb', onclick: () => { S.revealed = false; finish(true); } }, '○ できた'));
      } else if (S.checked) { area.append(resultBox(S.res[q.id])); nav.append(nextBtn()); }
      else nav.append(h('button', { class: 'btn primary', onclick: () => { S.revealed = true; draw(); } }, '答えを見る'));
    }
  }
  draw();
}
function journalTable(ans) {
  const n = Math.max(ans.debit.length, ans.credit.length);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = ans.debit[i], c = ans.credit[i];
    rows.push(h('tr', {}, h('td', {}, d?.account || ''), h('td', { class: 'num' }, d ? fmtNum(d.amount) : ''), h('td', {}, c?.account || ''), h('td', { class: 'num' }, c ? fmtNum(c.amount) : '')));
  }
  return h('table', { class: 'jans' }, h('thead', {}, h('tr', {}, h('th', {}, '借方科目'), h('th', {}, '金額'), h('th', {}, '貸方科目'), h('th', {}, '金額'))), h('tbody', {}, rows));
}
function journalInput(area, q, S, finish, nav, skip) {
  const ansAccounts = [...q.answer.debit, ...q.answer.credit].map((r) => r.account);
  let accounts = q.accounts || null;
  if (accounts) accounts = [...new Set([...accounts, ...ansAccounts])];
  S.input ??= { debit: [{ account: '', amount: '' }, { account: '', amount: '' }], credit: [{ account: '', amount: '' }, { account: '', amount: '' }] };
  const dlId = 'acct-dl';
  if (!accounts && !document.getElementById(dlId)) document.body.append(h('datalist', { id: dlId }, DEFAULT_ACCOUNTS.map((a) => h('option', { value: a }))));
  const sideEl = (key, label) => {
    const rows = S.input[key];
    return h('div', {},
      h('div', { class: 'side-h' }, label),
      rows.map((r) => h('div', { class: 'jrow' },
        accounts
          ? h('select', { disabled: S.checked, onchange: (e) => { r.account = e.target.value; } }, h('option', { value: '' }, '勘定科目'), accounts.map((a) => h('option', { value: a, selected: r.account === a }, a)))
          : h('input', { type: 'text', list: dlId, value: r.account, placeholder: '勘定科目', disabled: S.checked, oninput: (e) => { r.account = e.target.value; } }),
        h('input', { type: 'text', inputmode: 'numeric', value: r.amount, placeholder: '金額', disabled: S.checked, oninput: (e) => { r.amount = e.target.value; } }))),
      S.checked ? null : h('button', { class: 'btn sm ghost', onclick: () => { rows.push({ account: '', amount: '' }); redraw(); } }, '＋ 行を追加'));
  };
  const box = h('div', { class: 'journal' });
  const redraw = () => box.replaceChildren(sideEl('debit', '借方'), sideEl('credit', '貸方'));
  redraw();
  area.append(box);
  if (!S.checked) {
    nav.append(skip(), h('button', { class: 'btn primary', onclick: () => {
      const agg = (rows) => { const m = {}; for (const r of rows) { const a = norm(r.account), v = typeof r.amount === 'number' ? r.amount : parseNum(r.amount); if (!a && Number.isNaN(v)) continue; m[a] = (m[a] || 0) + (Number.isNaN(v) ? NaN : v); } return m; };
      const eq = (x, y) => { const kx = Object.keys(x), ky = Object.keys(y); return kx.length === ky.length && kx.every((k) => y[k] === x[k]); };
      finish(eq(agg(S.input.debit), agg(q.answer.debit)) && eq(agg(S.input.credit), agg(q.answer.credit)));
    } }, '答え合わせ'));
  }
}

/* ================= settings ================= */
function renderSettings(main) {
  main.append(h('div', { class: 'topbar' }, backBtn(), h('div', { class: 'grow', style: { fontWeight: 700, fontSize: '18px', padding: '6px 4px' } }, '設定')));
  const c = h('div', { class: 'content settings' });
  main.append(c);
  const cfg = ghCfg || { owner: '', repo: '', branch: 'main', token: '' };
  const f = (label, key, attrs = {}) => h('div', { class: 'field' }, h('label', {}, label), h('input', { type: 'text', value: cfg[key] || '', autocomplete: 'off', spellcheck: false, oninput: (e) => { cfg[key] = e.target.value.trim(); }, ...attrs }));
  c.append(
    h('h3', {}, '🔄 GitHub 同期（PC とスマホで同じ内容を見る）'),
    h('div', { class: 'panel' },
      h('p', { class: 'small', style: { marginTop: 0 } }, 'データ保存用の GitHub リポジトリ（非公開推奨）にノートと問題集を保存し、どの端末からでも同じ内容を見られるようにします。各端末でこの設定を1回入力してください。'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, f('ユーザー名 (owner)', 'owner', { placeholder: 'your-name' })), h('div', { class: 'grow' }, f('リポジトリ名', 'repo', { placeholder: 'study-notes-data' }))),
      f('ブランチ', 'branch', { placeholder: 'main' }),
      f('アクセストークン（fine-grained token）', 'token', { type: 'password', placeholder: 'github_pat_...' }),
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          if (!cfg.owner || !cfg.repo || !cfg.token) { toast('ユーザー名・リポジトリ名・トークンを入力してください'); return; }
          cfg.branch ||= 'main'; ghCfg = { ...cfg }; lsSet(LS_CFG, ghCfg);
          toast('接続して同期しています…'); await runSync({ manual: true }); renderSide();
        } }, '保存して同期'),
        ghCfg ? h('button', { class: 'btn', onclick: () => runSync({ manual: true }) }, '今すぐ同期') : null,
        ghCfg ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDlg('この端末の同期設定を解除しますか？（データはこの端末に残ります）', '解除')) { ghCfg = null; localStorage.removeItem(LS_CFG); setSync('local'); renderMain(); renderSide(); } } }, '同期を解除') : null),
      h('p', { class: 'small muted' }, '状態: ', sync.msg || (ghCfg ? '未同期' : 'この端末のみに保存中'))),
    h('details', { class: 'panel', style: { marginTop: '10px' } },
      h('summary', { style: { fontWeight: 700, cursor: 'pointer' } }, '設定のしかた（はじめての方）'),
      h('ol', { class: 'small' },
        h('li', {}, 'GitHub で新しいリポジトリを作成（例: ', h('code', {}, 'study-notes-data'), '）。', h('b', {}, '公開範囲は Private'), ' がおすすめ。'),
        h('li', {}, 'GitHub の Settings → Developer settings → Personal access tokens → ', h('b', {}, 'Fine-grained tokens'), ' → Generate new token'),
        h('li', {}, 'Repository access で「Only select repositories」→ 作ったデータ用リポジトリだけを選ぶ'),
        h('li', {}, 'Permissions → Repository permissions → ', h('b', {}, 'Contents を「Read and write」'), ' にする'),
        h('li', {}, '有効期限を決めて生成し、表示されたトークン（github_pat_…）を上の欄に貼って「保存して同期」'),
        h('li', {}, 'スマホでも同じ設定を入力すれば同じノートが見られます')),
      h('p', { class: 'small muted' }, 'トークンはこの端末のブラウザ内にだけ保存され、GitHub 以外には送信されません。共用の端末では使わないでください。')),

    h('h3', {}, '🤖 AI に問題集を作ってもらう'),
    h('div', { class: 'panel small' },
      h('p', { style: { marginTop: 0 } }, h('b', {}, '方法1：コピペ（どの AI でもOK）'), h('br'), '問題集タブの「＋ 新規」や、問題集の「🤖 AIで追加」で依頼文をコピー → AI に貼り付け → 返ってきた JSON をアプリに貼り付け。'),
      h('p', {}, h('b', {}, '方法2：Claude Code に直接頼む'), h('br'), 'データ用リポジトリを Claude Code で開き、「簿記3級の仕訳問題を20問作って」「○○の問題集に問題を10問追加して」と頼むだけ。リポジトリの ', h('code', {}, 'CLAUDE.md'), '（初回同期時にアプリが自動作成）に形式が書いてあるので、Claude が ', h('code', {}, 'data/quizzes/'), ' に直接書き込み、main に push するとアプリに同期されます。')),

    h('h3', {}, '🎨 表示'),
    h('div', { class: 'panel' },
      h('div', { class: 'field' }, h('label', {}, 'テーマ'), h('select', { onchange: (e) => { prefs.theme = e.target.value; savePrefs(); applyPrefs(); } },
        [['auto', '自動（端末に合わせる）'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, l]) => h('option', { value: v, selected: prefs.theme === v }, l)))),
      h('div', { class: 'field' }, h('label', {}, 'ノートの文字サイズ'), h('select', { onchange: (e) => { prefs.fontSize = +e.target.value; savePrefs(); applyPrefs(); } },
        [[15, '小'], [17, '標準'], [19, '大']].map(([v, l]) => h('option', { value: v, selected: prefs.fontSize === v }, l))))),

    h('h3', {}, '💾 バックアップ'),
    h('div', { class: 'panel' },
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => {
          const all = Object.fromEntries(Object.entries(Store.files).filter(([, v]) => !v.deleted && v.data).map(([k, v]) => [k, v.data]));
          download(`manabi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'manabi-note', version: 1, files: all }, null, 2));
        } }, '⬇️ すべて書き出し'),
        h('label', { class: 'btn', style: { margin: 0 } }, '⬆️ 読み込み', h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => {
          const file = e.target.files[0]; if (!file) return;
          try {
            const obj = JSON.parse(await file.text());
            if (obj.files) { let n = 0; for (const [p, d] of Object.entries(obj.files)) if (p.startsWith('data/')) { Store.put(p, d); n++; } toast(`${n}件を読み込みました`); }
            else if (Array.isArray(obj.questions)) { Store.put(P.quiz(uid('z')), { ...obj, updatedAt: Date.now() }); toast('問題集を読み込みました'); }
            else if (obj.type && obj.content) { Store.put(P.note(uid('n')), { ...obj, updatedAt: Date.now() }); toast('ノートを読み込みました'); }
            else throw new Error('形式が違います');
            renderSide();
          } catch (err) { toast('読み込めません: ' + err.message, 4000); }
        } }))),
      h('p', { class: 'small muted' }, 'まなびノート v1 ・ データはこの端末のブラウザ' + (ghCfg ? 'と GitHub' : '') + 'に保存されます。')));
}

/* ================= data repo guide (CLAUDE.md) ================= */
const DATA_GUIDE = `# まなびノート データリポジトリ

このリポジトリは学習アプリ「まなびノート」のデータ保存場所です。アプリは起動時・編集時にこのリポジトリと同期します。
AI（Claude Code など）は、このファイルの形式に従って JSON ファイルを追加・編集してください。

## 重要なルール
- 変更は **main ブランチに直接コミットして push** してください（アプリは main だけを読みます。PR や別ブランチは反映されません）。
- JSON は UTF-8、2スペースインデント、正しい JSON（末尾カンマ禁止）。
- 既存の問題の \`id\` は変更しないこと（解答記録が \`id\` で紐づいています）。新しい問題には既存と重複しない \`id\` を付ける。
- \`data/progress/\` は解答記録なので編集しないこと。
- 正解・解説は正確に。計算問題は必ず検算すること。

## フォルダ構成
- \`data/quizzes/<id>.json\` … 問題集（1ファイル1冊）。ファイル名の \`<id>\` は英数字とハイフン（例: \`boki3-shiwake.json\`）
- \`data/notes/<id>.json\` … ノート
- \`data/progress/<id>.json\` … 問題集ごとの解答記録（アプリが管理）

## 問題集の形式 (data/quizzes/*.json)
\`\`\`json
{
  "title": "簿記3級 仕訳問題",
  "description": "本試験第1問レベル",
  "folder": "簿記3級",
  "updatedAt": 1767225600000,
  "questions": [ ... ]
}
\`\`\`
\`updatedAt\` はミリ秒の UNIX 時刻（編集したら更新すると一覧の並び順に反映されます）。

### 問題の形式
${QUIZ_SCHEMA}

## ノートの形式 (data/notes/*.json)
\`\`\`json
{ "title": "タイトル", "type": "lined", "folder": "簿記3級", "createdAt": 1767225600000, "updatedAt": 1767225600000, "content": { ... } }
\`\`\`
type ごとの content:
- "lined"（罫線）/ "grid"（方眼）/ "blank"（無地）: {"text": "本文"}   ※ [[語句]] で囲むと暗記モードで赤シートのように隠れる。**太字**
- "bullet"（箇条書き）: {"items": [{"text": "項目", "level": 0}, {"text": "子項目", "level": 1, "check": false}]}
- "cornell"（コーネル式）: {"cues": "キーワード", "notes": "ノート本文", "summary": "まとめ"}
- "cards"（暗記カード）: {"cards": [{"id": "k1", "front": "表", "back": "裏", "ok": false}]}
`;

/* ================= samples ================= */
function seedSamples() {
  if (lsGet('manabi.seeded', false)) return;
  const now = Date.now();
  const put = (path, data) => { Store.files[path] = { data, sha: null, dirty: false, deleted: false, v: 1 }; };
  put(P.note('welcome'), { title: 'まなびノートの使い方', type: 'lined', folder: '', createdAt: now, updatedAt: now, content: { text:
`ようこそ！ここは「罫線ノート」です。
上の「形式」から方眼・箇条書き・コーネル式・暗記カードに変えられます。

■ 暗記モード
覚えたい語を二重の角カッコで囲むと、「暗記」ボタンで赤シートのように隠れます（「編集」に戻ると書き方が見えます）。
例：日本の首都は[[東京]]。簿記の5要素は[[資産・負債・純資産・収益・費用]]。
文字を選んで「🟥 隠す語にする」を押してもOK。

■ 同期
⚙️ 設定 → GitHub 同期 を設定すると、PCとスマホで同じノートが見られます。

■ ホーム画面に追加
スマホのブラウザの「共有 → ホーム画面に追加」でアプリのように使えます。` } });
  put(P.quiz('sample-boki3'), { title: 'サンプル：簿記3級 仕訳', description: 'アプリの問題形式のサンプルです', folder: '簿記3級', createdAt: now, updatedAt: now - 1000, questions: [
    { id: 'q1', type: 'journal', question: '商品 50,000円を売り上げ、代金は掛けとした。', accounts: ['現金', '売掛金', '買掛金', '売上', '仕入', '前受金'], answer: { debit: [{ account: '売掛金', amount: 50000 }], credit: [{ account: '売上', amount: 50000 }] }, explanation: '掛けで売り上げたときは「売掛金（資産）」の増加。売上（収益）の発生は貸方。', tags: ['商品売買'] },
    { id: 'q2', type: 'journal', question: '商品 30,000円を仕入れ、代金のうち10,000円は現金で支払い、残額は掛けとした。', accounts: ['現金', '売掛金', '買掛金', '売上', '仕入', '支払手形'], answer: { debit: [{ account: '仕入', amount: 30000 }], credit: [{ account: '現金', amount: 10000 }, { account: '買掛金', amount: 20000 }] }, explanation: '仕入（費用）は借方。支払いは現金 10,000円と買掛金（負債）20,000円に分かれる。', tags: ['商品売買'] },
    { id: 'q3', type: 'choice', question: '次のうち、負債に分類される勘定科目はどれか。', choices: ['売掛金', '前払金', '借入金', '受取手数料'], answer: 2, explanation: '借入金は将来返済する義務なので負債。売掛金・前払金は資産、受取手数料は収益。', tags: ['勘定科目'] },
    { id: 'q4', type: 'multi', question: '次のうち、資産の勘定科目をすべて選べ。', choices: ['備品', '未払金', '貸付金', '前受金', '当座預金'], answer: [0, 2, 4], explanation: '未払金と前受金は負債。', tags: ['勘定科目'] },
    { id: 'q5', type: 'number', question: '取得原価 600,000円、残存価額ゼロ、耐用年数 5年の備品を定額法で減価償却する。1年分の減価償却費はいくらか。', answer: 120000, unit: '円', explanation: '600,000円 ÷ 5年 = 120,000円', tags: ['決算'] },
    { id: 'q6', type: 'text', question: '商品を仕入れる前に代金の一部を支払ったときに使う勘定科目は何か。', answer: ['前払金', '前渡金'], explanation: '前払金（資産）。商品を受け取ったときに仕入へ振り替える。', tags: ['勘定科目'] },
    { id: 'q7', type: 'self', question: '「貸倒引当金」を設定する目的を簡潔に説明しなさい。', answer: '売掛金などの債権が将来回収できなくなる可能性に備え、その見込額を当期の費用として計上し、債権の評価額を適正に示すため。', explanation: '費用収益対応の原則と資産の適正評価がポイント。', tags: ['決算'] },
  ] });
  lsSet('manabi.seeded', true);
  Store.persistNow();
}

/* ================= boot ================= */
function boot() {
  applyPrefs();
  Store.load();
  seedSamples();
  if (ghCfg?.token) setSync('pending');
  render();
  if (ghCfg?.token) runSync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { Store.persistNow(); if (Store.pendingCount()) scheduleSync.flush(); }
    else if (ghCfg?.token && Date.now() - sync.last > 30000) runSync();
  });
  window.addEventListener('online', () => runSync());
  window.addEventListener('pagehide', () => Store.persistNow());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
