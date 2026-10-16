/* ==========================================================================
   圈内 · 前端应用（原生 JS，hash-free History API 路由）
   ========================================================================== */
(() => {
'use strict';

/* ---------------- 全局状态 ---------------- */
const S = {
  me: null,
  dict: null,
  filters: { industry: new Set(), city: new Set(), tag: new Set(), circle: new Set() },
  q: '',
  sort: 'recent',
  page: 1,
  listMeta: null,
  draft: null,          // 编辑器草稿
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const THEME_COLORS = {
  teal: ['#E7F5F2', '#1F7A6E'], brand: ['#FDF1EA', '#B8502C'],
  gold: ['#FAF2E1', '#8F6A1A'], blue: ['#EEF4FF', '#3A5F9E'],
};

/* ---------------- 通用 UI ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2000);
}

function copyText(text, label) {
  const done = () => toast(`已复制${label ? '（' + label + '）' : ''}：${String(text).slice(0, 24)}${String(text).length > 24 ? '…' : ''}`);
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('请手动复制：' + text); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && location.protocol !== 'file:') {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else fallback();
}

function confirmModal(title, desc, okText, onOk) {
  const m = $('#modal'), box = $('#modalBox');
  box.innerHTML = `
    <div class="mt">${esc(title)}</div>
    <div class="md">${desc}</div>
    <div class="ma">
      <button class="btn btn-g" id="mCancel">取消</button>
      <button class="btn btn-p" id="mOk">${esc(okText || '确认')}</button>
    </div>`;
  m.classList.add('on');
  const close = () => { m.classList.remove('on'); box.innerHTML = ''; };
  $('#mCancel').onclick = close;
  $('#mOk').onclick = () => { close(); onOk && onOk(); };
  m.onclick = (e) => { if (e.target === m) close(); };
}

/* 头像渲染 */
function avatarHTML(p, cls = 'av', style = '') {
  if (p.avatarUrl) return `<div class="${cls}" style="${style}"><img src="${esc(p.avatarUrl)}" alt=""></div>`;
  return `<div class="${cls}" style="background:${p.avatarColor || '#D4653C'};${style}">${esc(p.initial || '?')}</div>`;
}

/* ---------------- 路由 ---------------- */
function parseRoute() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'list' };
  if (p === '/circles') return { name: 'circles' };
  const mc = p.match(/^\/circles\/([^/]+)$/);
  if (mc) return { name: 'circle', slug: decodeURIComponent(mc[1]) };
  const mu = p.match(/^\/u\/([^/]+)$/);
  if (mu) return { name: 'profile', slug: decodeURIComponent(mu[1]) };
  if (p === '/me/edit') return { name: 'edit' };
  if (p === '/signup') return { name: 'signup' };
  if (p === '/login') return { name: 'login' };
  if (p === '/directory') return { name: 'list' };
  return { name: 'notfound' };
}

function go(path, replace) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

function setNav(name) {
  $$('#topnav a[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}

/* ---------------- 顶栏状态 ---------------- */
function paintAuth() {
  const me = S.me;
  $$('.auth-only').forEach(e => e.hidden = !me);
  $$('.auth-out').forEach(e => e.hidden = !!me);
  const um = $('.usermenu');
  um.hidden = !me;
  if (me) {
    const btn = $('#uavatar');
    btn.textContent = me.name ? me.name[0] : '?';
    btn.style.background = me.avatarColor || '#D4653C';
    btn.onclick = (e) => { e.stopPropagation(); $('#udrop').classList.toggle('on'); };
  } else {
    $('#udrop').classList.remove('on');
  }
}

document.addEventListener('click', () => $('#udrop').classList.remove('on'));
$('#udrop').addEventListener('click', e => e.stopPropagation());

$('#viewmine').onclick = (e) => { e.preventDefault(); if (S.me) go('/u/' + S.me.slug); };
$('#sharemine').onclick = (e) => {
  e.preventDefault();
  if (S.me) copyText(location.origin + '/u/' + S.me.slug, '主页链接');
};
$('#logout').onclick = async (e) => {
  e.preventDefault();
  await API.logout();
  S.me = null; paintAuth(); toast('已退出登录'); go('/');
};

/* 全局链接拦截（站内 SPA 跳转） */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#')) return;
  e.preventDefault();
  go(href);
});

/* 搜索框 */
let searchTimer;
$('#q').addEventListener('input', (e) => {
  S.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (parseRoute().name !== 'list') go('/');
    else { S.page = 1; loadList(); }
  }, 260);
});
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { S.page = 1; if (parseRoute().name === 'list') loadList(); else go('/'); }
});

/* ==========================================================================
   视图：名录广场
   ========================================================================== */
function listSkeleton(n = 8) {
  return `<div class="grid">${Array.from({ length: n }).map(() => `
    <div class="skel">
      <div style="display:flex;gap:12px;margin-bottom:12px">
        <div class="b" style="width:50px;height:50px;border-radius:14px"></div>
        <div style="flex:1">
          <div class="b" style="height:14px;width:60%;margin-bottom:8px"></div>
          <div class="b" style="height:11px;width:80%"></div>
        </div>
      </div>
      <div class="b" style="height:11px;margin-bottom:7px"></div>
      <div class="b" style="height:11px;width:70%;margin-bottom:14px"></div>
      <div style="display:flex;gap:6px">
        <div class="b" style="height:20px;width:56px;border-radius:99px"></div>
        <div class="b" style="height:20px;width:70px;border-radius:99px"></div>
      </div>
    </div>`).join('')}</div>`;
}

function memberCard(p) {
  return `
  <div class="pcard" data-slug="${esc(p.slug)}">
    <div class="top">
      ${avatarHTML(p)}
      <div style="min-width:0">
        <div class="nm">${esc(p.name)}</div>
        <div class="pos">${esc([p.company, p.title].filter(Boolean).join(' · ') || '—')}</div>
      </div>
    </div>
    <div class="hd">${esc(p.headline || '')}</div>
    <div class="tags">
      ${p.industry ? `<span class="tag soft">${esc(p.industry)}</span>` : ''}
      ${(p.tags || []).slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
    </div>
    <div class="loc">
      ${p.city ? '📍 ' + esc(p.city) : ''}
      ${(p.circles || []).length ? `　·　${p.circles.length} 个圈子` : ''}
    </div>
  </div>`;
}

async function loadList(append = false) {
  const app = $('#app');
  const params = {
    q: S.q,
    industry: [...S.filters.industry],
    city: [...S.filters.city],
    tag: [...S.filters.tag],
    circle: [...S.filters.circle],
    sort: S.sort,
    page: S.page,
    size: 24,
  };
  if (!append) {
    const gridHost = $('#gridhost');
    if (gridHost) gridHost.innerHTML = listSkeleton();
    else app.innerHTML = listShell();
  }

  let data;
  try { data = await API.directory(params); }
  catch (e) { toast(e.message); return; }

  S.listMeta = data;
  const grid = $('#grid');
  if (!grid) return;
  const html = data.items.map(memberCard).join('');
  grid.innerHTML = append ? grid.innerHTML + html : html;

  $('#rcount').textContent = data.total;
  const desc = [
    ...['industry', 'city', 'tag', 'circle'].map(k => S.filters[k].size ? [...S.filters[k]].join('/') : null),
    S.q ? `"${S.q}"` : null,
  ].filter(Boolean).join(' · ');
  $('#rdesc').textContent = desc ? '· ' + desc : '';

  $('#empty').style.display = data.total === 0 ? 'block' : 'none';
  const more = $('#morehost');
  if (more) {
    if (data.page < data.pages) {
      more.innerHTML = `<button class="btn btn-g" id="moreBtn">加载更多（还有 ${data.total - data.page * data.size} 位）</button>`;
      $('#moreBtn').onclick = () => { S.page++; loadList(true); };
    } else more.innerHTML = data.total > 24 ? `<div style="font-size:13px;color:var(--sub)">已显示全部 ${data.total} 位成员</div>` : '';
  }
  paintFilterButtons();
  syncUrl();
}

function paintFilterButtons() {
  ['industry', 'city', 'tag', 'circle'].forEach(k => {
    const n = S.filters[k].size;
    const btn = $('#f-' + k); if (!btn) return;
    btn.classList.toggle('active', n > 0);
    const c = $('#c-' + k);
    c.textContent = n;
    c.style.display = n ? 'inline-block' : 'none';
  });
}

function syncUrl() {
  const p = new URLSearchParams();
  Object.entries(S.filters).forEach(([k, set]) => { if (set.size) p.set(k, [...set].join(',')); });
  if (S.q) p.set('q', S.q);
  if (S.sort !== 'recent') p.set('sort', S.sort);
  const s = p.toString();
  history.replaceState({}, '', '/' + (s ? '?' + s : ''));
}

function readUrlFilters() {
  const p = new URLSearchParams(location.search);
  ['industry', 'city', 'tag', 'circle'].forEach(k => {
    S.filters[k] = new Set((p.get(k) || '').split(',').map(s => s.trim()).filter(Boolean));
  });
  S.q = p.get('q') || '';
  S.sort = p.get('sort') || 'recent';
  $('#q').value = S.q;
}

function listShell() {
  return `
  <div class="sec-title">成员名录</div>
  <div class="sec-sub">按行业、城市、标签、圈子多维筛选，找到你在找的那个人</div>
  <div class="filterbar">
    <div class="filters">
      <div class="fgroup"><button class="fbtn" id="f-industry">行业 <span class="cnt" id="c-industry">0</span></button><div class="fdrop" id="d-industry"></div></div>
      <div class="fgroup"><button class="fbtn" id="f-city">城市 <span class="cnt" id="c-city">0</span></button><div class="fdrop" id="d-city"></div></div>
      <div class="fgroup"><button class="fbtn" id="f-tag">标签 <span class="cnt" id="c-tag">0</span></button><div class="fdrop" id="d-tag"></div></div>
      <div class="fgroup"><button class="fbtn" id="f-circle">圈子 <span class="cnt" id="c-circle">0</span></button><div class="fdrop" id="d-circle"></div></div>
      <button class="reset" id="reset">清空筛选</button>
    </div>
  </div>
  <div class="resline">共 <b id="rcount">0</b> 位成员 <span id="rdesc"></span>
    <div class="sortsel"><span>排序</span>
      <select id="sortsel">
        <option value="recent">最近更新</option>
        <option value="name">姓名</option>
        <option value="created">最新加入</option>
      </select>
    </div>
  </div>
  <div id="gridhost"><div class="grid" id="grid"></div>
    <div class="empty" id="empty" style="display:none">
      <div class="e-icon">🫙</div>
      <div style="font-weight:600;color:#4E4841;margin-bottom:5px">没有匹配的成员</div>
      <div style="font-size:13.5px">试试放宽筛选条件，或者邀请你的朋友加入</div>
    </div>
    <div class="loadmore" id="morehost"></div>
  </div>`;
}

function bindListEvents() {
  // 筛选下拉
  const lists = {
    industry: () => S.dict.industries,
    city: () => S.dict.cities,
    tag: () => S.dict.tags.map(t => t.name),
    circle: () => S.dict.circles.map(c => c.slug),
  };
  const labels = {
    circle: (v) => { const c = S.dict.circles.find(x => x.slug === v); return c ? c.emoji + ' ' + c.name : v; },
    tag: (v) => v,
    industry: (v) => v,
    city: (v) => v,
  };

  ['industry', 'city', 'tag', 'circle'].forEach(k => {
    const box = $('#d-' + k);
    const vals = lists[k]();
    box.innerHTML = vals.length
      ? vals.map(v => `<div class="fi ${S.filters[k].has(v) ? 'sel' : ''}" data-k="${k}" data-v="${esc(v)}">${esc(labels[k](v))}<span class="ck">✓</span></div>`).join('')
      : '<div class="fi" style="color:#B5B0A8;cursor:default">暂无</div>';
    box.querySelectorAll('.fi[data-v]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const kk = el.dataset.k, vv = el.dataset.v;
        S.filters[kk].has(vv) ? S.filters[kk].delete(vv) : S.filters[kk].add(vv);
        el.classList.toggle('sel');
        S.page = 1; loadList();
      };
    });
  });

  $$('.fbtn').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const d = $('#d-' + b.id.slice(2));
      const was = d.classList.contains('on');
      $$('.fdrop').forEach(x => x.classList.remove('on'));
      if (!was) d.classList.add('on');
    };
  });

  $('#reset').onclick = () => {
    Object.values(S.filters).forEach(s => s.clear());
    S.q = ''; S.page = 1; $('#q').value = '';
    $$('.fdrop .fi').forEach(el => el.classList.remove('sel'));
    loadList();
  };

  const ss = $('#sortsel');
  ss.value = S.sort;
  ss.onchange = () => { S.sort = ss.value; S.page = 1; loadList(); };

  // 卡片点击
  $('#grid').onclick = (e) => {
    const card = e.target.closest('.pcard');
    if (card) go('/u/' + card.dataset.slug);
  };
}

async function viewList() {
  if (!S.dict) S.dict = await API.dictionary();
  readUrlFilters();
  $('#app').innerHTML = listShell();
  bindListEvents();
  setNav('list');
  $('#searchbar').style.display = '';
  await loadList();
  // 若筛选条件来自 URL，同步下拉选中态
  ['industry', 'city', 'tag', 'circle'].forEach(k => {
    $$(`#d-${k} .fi[data-v]`).forEach(el => el.classList.toggle('sel', S.filters[k].has(el.dataset.v)));
  });
}

/* ==========================================================================
   视图：个人主页
   ========================================================================== */
function sectionHTML(s) {
  return `<h3>${esc(s.title)}</h3><div>${s.content || ''}</div>`;
}

function profileHTML(p) {
  const contacts = p.contact.length ? p.contact.map(c => `
    <div class="cc ${c.isPublic ? '' : 'lock'}" ${c.isPublic ? `data-copy="${esc(c.value)}" data-label="${esc(c.label)}"` : ''}>
      <span class="ic">${c.icon}</span>
      <div><div class="lb">${esc(c.label)}${c.isPublic ? '' : '（未公开）'}</div>
        <div class="vl">${c.isPublic ? esc(c.value) : '••••••••'}</div></div>
      ${c.isPublic ? '<span class="cp">复制</span>' : ''}
    </div>`).join('')
    : '<div style="font-size:13px;color:var(--sub)">主人没有留下联系方式</div>';

  const circles = p.circles.length ? p.circles.map(c => `
    <div class="cbx" data-circle="${esc(c.slug)}">
      <div class="em" style="background:${(THEME_COLORS[c.theme] || THEME_COLORS.teal)[0]}">${esc(c.emoji)}</div>
      <div><div class="t1">${esc(c.name)}</div><div class="t2">${c.role === 'owner' ? '圈主' : '成员'}</div></div>
    </div>`).join('')
    : '<div style="font-size:13px;color:var(--sub)">还没加入任何圈子</div>';

  const body = p.sections.length ? p.sections.map(sectionHTML).join('')
    : '<div style="color:var(--sub);font-size:14px">这位成员还没有填写详细介绍</div>';

  return `
  <div class="hero">
    <div class="acts">
      <button class="btn btn-g btn-s" id="shareProfile">🔗 复制主页链接</button>
      ${p.isSelf ? `<button class="btn btn-p btn-s" onclick="location.href='/me/edit'">编辑主页</button>` : ''}
    </div>
    <div class="row">
      ${avatarHTML(p, 'av', 'width:88px;height:88px;border-radius:24px;font-size:36px')}
      <div style="min-width:0">
        <h1>${esc(p.name)}</h1>
        <div class="pos">${esc([p.company, p.title].filter(Boolean).join(' · ') || '—')}</div>
        ${p.headline ? `<div class="hd">${esc(p.headline)}</div>` : ''}
        <div class="meta">
          ${p.city ? `<span>📍 ${esc(p.city)}</span>` : ''}
          ${p.industry ? `<span>💼 ${esc(p.industry)}</span>` : ''}
        </div>
      </div>
    </div>
    ${(p.tags.length || p.circles.length) ? `<div class="chiprow" style="margin-top:16px;position:relative">
      ${p.tags.map(t => `<span class="tag soft">${esc(t)}</span>`).join('')}
      ${p.circles.map(c => `<span class="tag teal">🏛 ${esc(c.name)}</span>`).join('')}
    </div>` : ''}
  </div>
  <div class="cnt2">
    <div class="rt">${body}</div>
    <div class="side">
      <div class="sbox"><h4>联系方式</h4>${contacts}
        ${p.contact.some(c => c.isPublic) ? '<div style="font-size:11.5px;color:#B5B0A8;margin-top:8px;line-height:1.5">主人选择了公开以上信息。点击即可复制。</div>' : ''}
      </div>
      <div class="sbox"><h4>所属圈子</h4>${circles}</div>
      <div class="sbox"><h4>最近更新</h4><div style="font-size:13px;color:#5E574F">${relTime(p.updatedAt)}</div></div>
    </div>
  </div>`;
}

function relTime(ts) {
  if (!ts) return '—';
  const t = new Date(ts.replace(' ', 'T') + (ts.includes('Z') ? '' : 'Z')).getTime();
  if (isNaN(t)) return '—';
  const d = Date.now() - t;
  const min = Math.floor(d / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

async function viewProfile(slug) {
  setNav('profile');
  $('#searchbar').style.display = 'none';
  $('#app').innerHTML = listSkeleton(2);
  let data;
  try { data = await API.profile(slug); }
  catch (e) {
    if (e.status === 403 && e.data && e.data.locked) {
      $('#app').innerHTML = `
        <div class="locked">
          <div class="em">🔒</div>
          <h2>${esc(e.data.name || '该成员')} 的主页未公开</h2>
          <p>TA 选择只对同圈子的成员可见。加入 TA 所在的圈子后即可查看。</p>
          <a class="btn btn-g" href="/circles" data-link>去看看圈子</a>
        </div>`;
      return;
    }
    if (e.status === 404) {
      $('#app').innerHTML = `<div class="locked"><div class="em">🔍</div><h2>找不到这位成员</h2>
        <p>主页地址可能已变更，或者 TA 已经注销</p><a class="btn btn-g" href="/" data-link>回到名录广场</a></div>`;
      return;
    }
    toast(e.message);
    go('/', true);
    return;
  }
  const p = data.profile;
  document.title = `${p.name} · 圈内`;
  $('#app').innerHTML = profileHTML(p);
  $('#searchbar').style.display = '';

  $('#shareProfile').onclick = () => copyText(location.origin + '/u/' + p.slug, '主页链接');
  $$('#app .cc[data-copy]').forEach(el => {
    el.onclick = () => copyText(el.dataset.copy, el.dataset.label);
  });
  $$('#app .cbx[data-circle]').forEach(el => {
    el.onclick = () => go('/circles/' + el.dataset.circle);
  });
}

/* ==========================================================================
   视图：圈子列表 / 圈子详情
   ========================================================================== */
async function viewCircles() {
  setNav('circles');
  $('#searchbar').style.display = 'none';
  $('#app').innerHTML = `<div class="sec-title">圈子</div>
    <div class="sec-sub">每个群、每个俱乐部，都可以是一个圈子</div>
    <div style="margin-bottom:16px"><button class="btn btn-p" id="newCircle">＋ 创建圈子</button></div>
    <div class="circles" id="clist"></div>`;

  $('#newCircle').onclick = openCreateCircle;
  const { items } = await API.circles();
  $('#clist').innerHTML = items.map(c => {
    const [bg] = THEME_COLORS[c.theme] || THEME_COLORS.teal;
    return `<div class="ccard" data-slug="${esc(c.slug)}">
      <div class="em" style="background:${bg}">${esc(c.emoji)}</div>
      <div class="nm">${esc(c.name)}</div>
      <div class="d">${esc(c.intro || '这个圈子还没有简介')}</div>
      <div class="ft"><span>${c.memberCount} 位成员</span>
        ${c.joined ? '<span class="tag teal">已加入</span>'
          : c.joinPolicy === 'review' ? '<span class="tag">需审核</span>' : '<span class="tag">+ 加入</span>'}</div>
    </div>`;
  }).join('');
  $('#clist').onclick = (e) => {
    const c = e.target.closest('.ccard');
    if (c) go('/circles/' + c.dataset.slug);
  };
}

function openCreateCircle() {
  if (!S.me) { toast('请先登录'); go('/login'); return; }
  const m = $('#modal'), box = $('#modalBox');
  box.innerHTML = `
    <div class="mt">创建圈子</div>
    <div class="md" style="text-align:left">
      <div class="fld"><label>圈子名称</label><input type="text" id="ccName" placeholder="如：2026 跨境电商校友群"></div>
      <div class="fld"><label>简介</label><input type="text" id="ccIntro" placeholder="一句话说明这个圈子是干什么的"></div>
      <div class="fld"><label>图标</label><input type="text" id="ccEmoji" value="🏛" style="width:80px"></div>
      <div class="fld"><label>加入方式</label>
        <select id="ccPolicy"><option value="open">自由加入</option><option value="review">需审核</option></select></div>
    </div>
    <div class="ma"><button class="btn btn-g" id="mCancel">取消</button><button class="btn btn-p" id="mOk">创建</button></div>`;
  m.classList.add('on');
  const close = () => { m.classList.remove('on'); box.innerHTML = ''; };
  $('#mCancel').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  $('#mOk').onclick = async () => {
    const name = $('#ccName').value.trim();
    if (!name) return toast('请填写圈子名称');
    try {
      const r = await API.createCircle({
        name, intro: $('#ccIntro').value.trim(),
        emoji: $('#ccEmoji').value.trim() || '🏛', joinPolicy: $('#ccPolicy').value,
      });
      close(); toast('圈子已创建');
      go('/circles/' + r.circle.slug);
    } catch (e) { toast(e.message); }
  };
}

async function viewCircle(slug) {
  setNav('circles');
  $('#searchbar').style.display = 'none';
  $('#app').innerHTML = listSkeleton(2);

  let data;
  try { data = await API.circle(slug); }
  catch (e) {
    $('#app').innerHTML = `<div class="locked"><div class="em">🔍</div><h2>找不到这个圈子</h2>
      <p>圈子可能已被删除</p><a class="btn btn-g" href="/circles" data-link>查看全部圈子</a></div>`;
    return;
  }
  const c = data.circle;
  const [bg, fg] = THEME_COLORS[c.theme] || THEME_COLORS.teal;

  $('#app').innerHTML = `
    <div class="ctop" style="background:linear-gradient(120deg,${fg},${fg}dd);color:#fff">
      <div class="acts">
        <button class="btn" id="joinBtn">${c.joined ? '退出圈子' : (c.joinPolicy === 'review' ? '申请加入' : '加入圈子')}</button>
      </div>
      <h1><span>${esc(c.emoji)}</span>${esc(c.name)}</h1>
      <div class="d">${esc(c.intro || '这个圈子还没有简介')}</div>
      <div class="st"><div><b>${c.memberCount}</b>位成员</div>
        <div><b>${c.members ? c.members.length : c.memberCount}</b>已展示</div>
        <div><b>${c.joinPolicy === 'review' ? '审核' : '自由'}</b>加入方式</div></div>
    </div>
    <div class="resline">共 <b>${data.members.length}</b> 位成员</div>
    <div class="grid" id="grid"></div>
    ${data.members.length ? '' : '<div class="empty"><div class="e-icon">👥</div><div>这个圈子还没有公开成员</div></div>'}
  `;

  $('#grid').innerHTML = data.members.map(m => memberCard({
    ...m, circles: [], updatedAt: null,
  })).join('');
  $('#grid').onclick = (e) => {
    const card = e.target.closest('.pcard');
    if (card) go('/u/' + card.dataset.slug);
  };

  $('#joinBtn').onclick = async () => {
    if (!S.me) { toast('请先登录'); go('/login'); return; }
    try {
      if (c.joined) {
        const r = await API.leaveCircle(slug);
        toast('已退出圈子'); viewCircle(slug);
      } else {
        const r = await API.joinCircle(slug);
        toast(r.pending ? '申请已提交，圈主审核通过后即可加入' : '已加入圈子');
        viewCircle(slug);
      }
    } catch (e) { toast(e.message); }
  };
}

/* ==========================================================================
   视图：编辑器
   ========================================================================== */
async function viewEdit() {
  setNav('edit');
  $('#searchbar').style.display = 'none';
  if (!S.me) { go('/login'); toast('请先登录'); return; }

  let p;
  try { p = (await API.myProfile()).profile; }
  catch (e) { toast(e.message); go('/login'); return; }

  await API.scaffold().catch(() => {});
  try { p = (await API.myProfile()).profile; } catch (e) {}

  if (!S.dict) S.dict = await API.dictionary();

  S.draft = {
    name: p.name, headline: p.headline, company: p.company, title: p.title,
    industry: p.industry, city: p.city, slug: p.slug, avatarUrl: p.avatarUrl,
    avatarColor: p.avatarColor, initial: p.initial,
    phone: p.raw.phone, wechat: p.raw.wechat, website: p.raw.website, email: p.raw.email,
    phonePublic: p.raw.phonePublic, wechatPublic: p.raw.wechatPublic,
    websitePublic: p.raw.websitePublic, emailPublic: p.raw.emailPublic,
    visibility: p.raw.visibility,
    tags: [...p.tags],
    sections: p.sections.map(s => ({ kind: s.kind, title: s.title, content: s.content })),
  };

  // 城市选项：字典 + 当前值
  const cityOpts = [...new Set([...S.dict.cities, S.draft.city].filter(Boolean))];
  const indOpts = [...new Set([...S.dict.industries, S.draft.industry].filter(Boolean))];

  $('#app').innerHTML = `
  <div class="sec-title">编辑我的主页</div>
  <div class="sec-sub">左边填写，右边实时预览。点「保存并发布」后生效</div>
  <div class="ed2">
    <div class="form">
      <div class="fld"><label>头像 <span class="opt">（可选，不传则用姓名首字）</span></label>
        <div style="display:flex;gap:12px;align-items:center">
          <div id="edAvatar"></div>
          <button class="btn btn-g btn-s" id="useInitial">用首字占位</button>
        </div>
      </div>
      <div class="fld"><label>姓名 <span class="opt">（必填）</span></label>
        <input type="text" id="ed-name" maxlength="20"><div class="err">请填写姓名</div></div>
      <div class="fld"><label>主页短链</label>
        <input type="text" id="ed-slug"><div class="hint">别人通过 ${esc(location.origin)}/u/<span id="slugPv"></span> 访问你的主页</div></div>
      <div class="fld"><label>一句话简介 <span class="opt">（60 字内，名录页展示这句）</span></label>
        <input type="text" id="ed-hd" maxlength="120"></div>
      <div class="frow">
        <div class="fld"><label>公司 / 组织</label><input type="text" id="ed-co" maxlength="80"></div>
        <div class="fld"><label>职位</label><input type="text" id="ed-ti" maxlength="80"></div>
      </div>
      <div class="frow">
        <div class="fld"><label>行业</label><select id="ed-ind">${indOpts.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
        <div class="fld"><label>城市</label><select id="ed-city">${cityOpts.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label>标签 <span class="opt">（最多 5 个，回车添加）</span></label>
        <div class="taginput" id="taginput"><input type="text" id="tagnew" placeholder="+ 添加标签" maxlength="24"></div>
      </div>

      <div class="fld"><label>正文内容</label><div id="sectionsHost"></div>
        <button class="btn btn-g btn-s" id="addSec">＋ 添加自定义小节</button></div>

      <div class="fld"><label>联系方式与可见性 <span class="opt">（逐项控制是否公开）</span></label>
        ${contactRow('phone', '📱 手机号', 'text')}
        ${contactRow('email', '✉️ 邮箱', 'email')}
        ${contactRow('wechat', '💬 微信号', 'text')}
        ${contactRow('website', '🔗 网址', 'url')}
      </div>

      <div class="fld"><label>整页可见性</label>
        <div class="vis-opt" id="visOpt">
          ${visOpt('public', '🌐 公开', '任何人可通过名录找到我')}
          ${visOpt('circle', '🏛 仅圈子内', '只有同圈子成员可见')}
          ${visOpt('private', '🔒 仅自己', '发布前先自己看看')}
        </div>
      </div>

      <div class="edbar">
        <button class="btn btn-g" id="delAcct" style="margin-right:auto;color:#B5B0A8">注销账号</button>
        <button class="btn btn-g" id="saveDraft">存草稿</button>
        <button class="btn btn-p" id="publish">保存并发布</button>
      </div>
    </div>
    <div class="pv" id="preview"></div>
  </div>`;

  wireEditor();
  renderSections();
  renderTags();
  renderPreview();
  paintEditorAvatar();
}

function contactRow(k, label, type) {
  const d = S.draft;
  const val = d[k === 'email' ? 'email' : k] || '';
  const pub = d[k + 'Public'];
  return `<div class="toggle-row">
    <span>${label}</span>
    <div class="rin">
      <input type="${type}" id="ct-${k}" value="${esc(val)}" placeholder="未填写">
      <div class="sw ${pub ? 'on' : ''}" data-ct="${k}" title="是否公开"></div>
    </div></div>`;
}

function visOpt(v, t, d) {
  return `<div class="vo ${S.draft.visibility === v ? 'on' : ''}" data-vis="${v}">
    <div class="t">${t}</div><div class="d">${d}</div></div>`;
}

let activeEditorEl = null;
function makeToolbar() {
  return `<div class="toolbar">
    <button type="button" data-cmd="bold" title="加粗"><b>B</b></button>
    <button type="button" data-cmd="italic" title="斜体"><i>I</i></button>
    <button type="button" data-cmd="underline" title="下划线"><u>U</u></button>
    <div class="sep"></div>
    <button type="button" data-cmd="insertUnorderedList" title="无序列表">•≡</button>
    <button type="button" data-cmd="insertOrderedList" title="有序列表">1≡</button>
    <button type="button" data-cmd="formatBlock" data-arg="h3" title="小标题">H</button>
    <button type="button" data-cmd="formatBlock" data-arg="blockquote" title="引用">❝</button>
    <div class="sep"></div>
    <button type="button" data-cmd="createLink" title="插入链接">🔗</button>
    <button type="button" data-cmd="removeFormat" title="清除格式">⌫</button>
  </div>`;
}

function renderSections() {
  const host = $('#sectionsHost');
  if (!host) return;
  host.innerHTML = S.draft.sections.map((s, i) => `
    <div class="secblock" data-i="${i}">
      <div class="sh">
        <input type="text" class="stitle" value="${esc(s.title)}" maxlength="60" placeholder="小节标题">
        <button type="button" class="iconbtn up" title="上移">↑</button>
        <button type="button" class="iconbtn down" title="下移">↓</button>
        <button type="button" class="iconbtn danger del" title="删除">✕</button>
      </div>
      ${makeToolbar()}
      <div class="rtedit" contenteditable="true" data-ph="写点什么吧…">${s.content || ''}</div>
    </div>`).join('');

  host.querySelectorAll('.secblock').forEach(block => {
    const i = +block.dataset.i;
    block.querySelector('.stitle').oninput = (e) => { S.draft.sections[i].title = e.target.value; renderPreview(); };
    const ed = block.querySelector('.rtedit');
    ed.addEventListener('focus', () => activeEditorEl = ed);
    ed.addEventListener('input', () => { S.draft.sections[i].content = ed.innerHTML; renderPreview(); });

    block.querySelectorAll('.toolbar button').forEach(b => {
      b.onmousedown = (e) => e.preventDefault();  // 保持选区
      b.onclick = () => {
        const el = activeEditorEl || ed;
        el.focus();
        const cmd = b.dataset.cmd, arg = b.dataset.arg;
        if (cmd === 'createLink') {
          const url = prompt('输入链接地址：', 'https://');
          if (!url) return;
          document.execCommand('createLink', false, /^https?:|^mailto:/.test(url) ? url : 'https://' + url);
        } else if (cmd === 'formatBlock') {
          document.execCommand('formatBlock', false, arg);
        } else {
          document.execCommand(cmd, false, null);
        }
        S.draft.sections[i].content = ed.innerHTML;
        renderPreview();
      };
    });

    block.querySelector('.up').onclick = () => {
      if (i === 0) return;
      [S.draft.sections[i - 1], S.draft.sections[i]] = [S.draft.sections[i], S.draft.sections[i - 1]];
      syncSectionDOM(); renderSections(); renderPreview();
    };
    block.querySelector('.down').onclick = () => {
      if (i === S.draft.sections.length - 1) return;
      [S.draft.sections[i + 1], S.draft.sections[i]] = [S.draft.sections[i], S.draft.sections[i + 1]];
      syncSectionDOM(); renderSections(); renderPreview();
    };
    block.querySelector('.del').onclick = () => {
      syncSectionDOM();
      S.draft.sections.splice(i, 1);
      renderSections(); renderPreview();
    };
  });
}

/** 把 DOM 里的富文本内容同步回 draft（重排/删除前调用） */
function syncSectionDOM() {
  $$('#sectionsHost .secblock').forEach(block => {
    const i = +block.dataset.i;
    if (!S.draft.sections[i]) return;
    S.draft.sections[i].title = block.querySelector('.stitle').value;
    S.draft.sections[i].content = block.querySelector('.rtedit').innerHTML;
  });
}

function renderTags() {
  const host = $('#taginput');
  if (!host) return;
  const input = $('#tagnew');
  host.innerHTML = S.draft.tags.map((t, i) =>
    `<span class="tg">${esc(t)}<b data-i="${i}" title="移除">✕</b></span>`).join('') + '<input type="text" id="tagnew" placeholder="+ 添加标签" maxlength="24">';
  const ni = $('#tagnew');
  ni.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(ni.value);
    }
  };
  ni.onblur = () => addTag(ni.value);
  host.querySelectorAll('.tg b').forEach(b => {
    b.onclick = () => { S.draft.tags.splice(+b.dataset.i, 1); renderTags(); renderPreview(); };
  });
  function addTag(v) {
    const t = String(v || '').trim().replace(/,$/, '');
    if (!t) return;
    if (S.draft.tags.length >= 5) { toast('最多 5 个标签'); return; }
    if (S.draft.tags.includes(t)) { toast('这个标签已经有了'); return; }
    S.draft.tags.push(t);
    renderTags(); renderPreview();
    const el = $('#tagnew'); if (el) el.focus();
  }
}

function paintEditorAvatar() {
  const host = $('#edAvatar');
  if (!host) return;
  const d = S.draft;
  host.innerHTML = d.avatarUrl
    ? `<div class="av" style="width:56px;height:56px;border-radius:16px;font-size:23px"><img src="${esc(d.avatarUrl)}" alt=""></div>`
    : `<div class="av" style="background:${d.avatarColor};width:56px;height:56px;border-radius:16px;font-size:23px">${esc(d.initial)}</div>`;
}

function renderPreview() {
  const pv = $('#preview');
  if (!pv) return;
  const d = S.draft;
  pv.innerHTML = `
    <div class="pvlabel">实时预览</div>
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">
      ${d.avatarUrl
        ? `<div class="av" style="width:60px;height:60px;border-radius:17px;font-size:25px"><img src="${esc(d.avatarUrl)}" alt=""></div>`
        : `<div class="av" style="background:${d.avatarColor};width:60px;height:60px;border-radius:17px;font-size:25px">${esc(d.initial)}</div>`}
      <div style="min-width:0">
        <div style="font-size:19px;font-weight:800">${esc(d.name || '未命名')}</div>
        <div style="font-size:13.5px;color:var(--sub)">${esc([d.company, d.title].filter(Boolean).join(' · ') || '—')}</div>
      </div>
    </div>
    ${d.headline ? `<div style="font-size:14px;color:#544E47;line-height:1.6;padding-bottom:13px;border-bottom:1px dashed var(--line);margin-bottom:13px">${esc(d.headline)}</div>` : ''}
    <div class="chiprow" style="margin-bottom:14px">
      ${d.industry ? `<span class="tag soft">${esc(d.industry)}</span>` : ''}
      ${d.tags.map(t => `<span class="tag soft">${esc(t)}</span>`).join('')}
      ${d.city ? `<span class="tag">📍 ${esc(d.city)}</span>` : ''}
    </div>
    <div style="font-size:14.5px;line-height:1.8;color:#3E3A35" id="pvBody"></div>`;
  $('#pvBody').innerHTML = d.sections.filter(s => s.content || s.title)
    .map(s => `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:14.5px;margin-bottom:5px">${esc(s.title)}</div>${s.content || ''}</div>`)
    .join('') || '<div style="color:var(--sub);font-size:13.5px">还没有正文内容</div>';
}

function wireEditor() {
  const d = S.draft;
  const bind = (id, key, after) => {
    const el = $(id); if (!el) return;
    el.value = d[key] || '';
    el.oninput = () => { d[key] = el.value; after && after(); };
  };
  bind('#ed-name', 'name', () => { d.initial = d.name ? d.name[0] : '?'; paintEditorAvatar(); renderPreview(); $('.fld.invalid')?.classList.remove('invalid'); });
  bind('#ed-hd', 'headline', renderPreview);
  bind('#ed-co', 'company', renderPreview);
  bind('#ed-ti', 'title', renderPreview);
  bind('#ed-slug', 'slug', () => { const e = $('#slugPv'); if (e) e.textContent = d.slug || '...'; });

  const ind = $('#ed-ind'); ind.value = d.industry; ind.onchange = () => { d.industry = ind.value; renderPreview(); };
  const city = $('#ed-city'); city.value = d.city; city.onchange = () => { d.city = city.value; renderPreview(); };

  // 联系方式开关
  $$('#app .sw[data-ct]').forEach(sw => {
    sw.onclick = () => {
      const k = sw.dataset.ct;
      S.draft[k + 'Public'] = !S.draft[k + 'Public'];
      sw.classList.toggle('on', S.draft[k + 'Public']);
    };
  });
  ['phone', 'email', 'wechat', 'website'].forEach(k => {
    const el = $('#ct-' + k); if (!el) return;
    el.oninput = () => { S.draft[k] = el.value; };
  });

  // 可见性
  $$('#visOpt .vo').forEach(v => {
    v.onclick = () => {
      $$('#visOpt .vo').forEach(x => x.classList.remove('on'));
      v.classList.add('on');
      S.draft.visibility = v.dataset.vis;
    };
  });

  $('#addSec').onclick = () => {
    syncSectionDOM();
    S.draft.sections.push({ kind: 'custom', title: '新的小节', content: '' });
    renderSections(); renderPreview();
    const blocks = $$('#sectionsHost .secblock');
    blocks[blocks.length - 1]?.querySelector('.stitle')?.select();
  };

  $('#useInitial').onclick = () => { S.draft.avatarUrl = null; paintEditorAvatar(); renderPreview(); toast('已切换为占位头像'); };

  $('#saveDraft').onclick = () => {
    syncSectionDOM();
    localStorage.setItem('quannei_draft', JSON.stringify(S.draft));
    toast('草稿已保存到本机');
  };

  $('#publish').onclick = publish;

  $('#delAcct').onclick = () => {
    confirmModal('注销账号？', '注销后你的主页、标签、圈子成员身份都会被<strong>永久删除</strong>，无法恢复。', '确认注销', async () => {
      try {
        await API.deleteAccount();
        S.me = null; paintAuth(); toast('账号已注销');
        go('/', true);
      } catch (e) { toast(e.message); }
    });
  };
}

async function publish() {
  syncSectionDOM();
  const d = S.draft;
  if (!d.name || !d.name.trim()) {
    const fld = $('#ed-name').closest('.fld');
    fld.classList.add('invalid');
    fld.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return toast('请填写姓名');
  }
  const btn = $('#publish');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    await API.saveProfile({
      name: d.name, headline: d.headline, company: d.company, title: d.title,
      industry: d.industry, city: d.city, slug: d.slug,
      phone: d.phone, wechat: d.wechat, website: d.website,
      phonePublic: d.phonePublic, wechatPublic: d.wechatPublic,
      websitePublic: d.websitePublic, emailPublic: d.emailPublic,
      visibility: d.visibility,
      tags: d.tags,
      sections: d.sections,
    });
    // 刷新 me（slug/nav 头像可能变化）
    const r = await API.me();
    S.me = r.user;
    paintAuth();
    localStorage.removeItem('quannei_draft');
    toast('主页已发布 ✓');
    setTimeout(() => go('/u/' + S.me.slug), 500);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = '保存并发布';
  }
}

/* ==========================================================================
   视图：注册 / 登录
   ========================================================================== */
function authShell(mode) {
  const isSignup = mode === 'signup';
  return `
  <div class="authwrap"><div class="authcard">
    <h1>${isSignup ? '创建你的主页' : '欢迎回来'}</h1>
    <div class="sub">${isSignup ? '注册后即可维护个人主页，让别人认识你' : '登录后继续维护你的个人主页'}</div>
    <div class="fld"><label>邮箱</label><input type="email" id="au-email" placeholder="you@example.com" autocomplete="email"><div class="err">请输入有效的邮箱</div></div>
    <div class="fld"><label>密码 <span class="opt">（至少 6 位）</span></label><input type="password" id="au-pass" placeholder="••••••" autocomplete="${isSignup ? 'new-password' : 'current-password'}"><div class="err">密码至少 6 位</div></div>
    ${isSignup ? `<div class="fld"><label>姓名</label><input type="text" id="au-name" placeholder="你的姓名" maxlength="20"><div class="err">请填写姓名</div></div>
      <div class="fld"><label>主页短链 <span class="opt">（可选，默认用姓名生成）</span></label><input type="text" id="au-slug" placeholder="如 laozhang"></div>` : ''}
    <button class="btn btn-p" style="width:100%;margin-top:6px" id="auSubmit">${isSignup ? '注册并创建主页' : '登录'}</button>
    <div class="authfoot">
      ${isSignup ? '已经有账号了？<a href="/login" data-link>去登录</a>' : '还没有账号？<a href="/signup" data-link>去注册</a>'}
    </div>
    <div class="demo-hint">演示账号：<b>zhangmingyuan@demo.com</b>　密码：<b>quannei123</b><br>其他成员同理，如 lijingyi@demo.com / wangsiyuan@demo.com</div>
  </div></div>`;
}

function viewAuth(mode) {
  setNav(null);
  $('#searchbar').style.display = 'none';
  $('#app').innerHTML = authShell(mode);
  const isSignup = mode === 'signup';

  const submit = async () => {
    const email = $('#au-email').value.trim();
    const pass = $('#au-pass').value;
    const mark = (id, bad) => $(id).closest('.fld').classList.toggle('invalid', bad);
    mark('#au-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    mark('#au-pass', pass.length < 6);
    let nameBad = false;
    if (isSignup) { nameBad = !$('#au-name').value.trim(); mark('#au-name', nameBad); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pass.length < 6 || nameBad) return;

    const btn = $('#auSubmit');
    btn.disabled = true; btn.textContent = '处理中…';
    try {
      const body = { email, password: pass };
      if (isSignup) { body.name = $('#au-name').value.trim(); body.slug = $('#au-slug').value.trim() || undefined; }
      const r = isSignup ? await API.signup(body) : await API.login(body);
      S.me = { ...r.user, avatarColor: null };
      const m = await API.me(); S.me = m.user;
      paintAuth();
      toast(isSignup ? '注册成功，去完善你的主页吧' : '登录成功');
      go(isSignup ? '/me/edit' : '/me/edit');
    } catch (e) {
      toast(e.message);
      btn.disabled = false; btn.textContent = isSignup ? '注册并创建主页' : '登录';
    }
  };

  $('#auSubmit').onclick = submit;
  $$('#app input').forEach(el => el.onkeydown = (e) => { if (e.key === 'Enter') submit(); });
}

/* ==========================================================================
   渲染调度
   ========================================================================== */
async function render() {
  const r = parseRoute();
  paintAuth();
  switch (r.name) {
    case 'list': await viewList(); break;
    case 'circles': await viewCircles(); break;
    case 'circle': await viewCircle(r.slug); break;
    case 'profile': await viewProfile(r.slug); break;
    case 'edit': await viewEdit(); break;
    case 'signup': viewAuth('signup'); break;
    case 'login': viewAuth('login'); break;
    default:
      $('#app').innerHTML = `<div class="locked"><div class="em">🧭</div><h2>页面不存在</h2>
        <p>检查一下地址，或者回到名录广场</p><a class="btn btn-g" href="/" data-link>回到首页</a></div>`;
  }
}

window.addEventListener('popstate', render);

/* ---------------- 启动 ---------------- */
(async function boot() {
  try {
    const r = await API.me();
    S.me = r.user;
  } catch (e) { S.me = null; }
  paintAuth();
  await render();
})();

})();
