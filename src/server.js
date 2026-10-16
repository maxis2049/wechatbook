/**
 * 圈内 · 服务入口
 * Express + SQLite，前端为原生 HTML/CSS/JS（SPA 风格，由 /public/app.js 驱动）
 * 个人主页同时支持 SSR 注入 OG 标签（微信分享预览）
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const { db, migrate } = require('./db');
const { seed } = require('./db/seed');
const { avatarColor, initial } = require('./lib');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_NAME = '圈内';
const SITE_SLOGAN = '在圈子里被看见';

/* ---------- 初始化数据库 ---------- */
migrate();
const seedResult = seed();
if (!seedResult.skipped) console.log(`[db] 已写入种子数据：${seedResult.users} 位成员 / ${seedResult.circles} 个圈子`);

/* ---------- 中间件 ---------- */
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'quannei-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 },
}));

/* ---------- API ---------- */
const auth = require('./routes/auth');
const profile = require('./routes/profile');
const me = require('./routes/me');
const directory = require('./routes/directory');
const circles = require('./routes/circles');
const dictionary = require('./routes/dictionary');

app.use('/api/auth', auth.router);
app.use('/api/me', me.router);          // 放前面，避免 /api/profile/:slug 冲突
app.use('/api/profile', profile.router);
app.use('/api/directory', directory.router);
app.use('/api/circles', circles.router);
app.use('/api/dictionary', dictionary.router);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ---------- 静态资源 ---------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

/* ---------- 页面（SPA 外壳 + 主页 SSR） ---------- */
const shell = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 主页 SSR：注入 title / description / OG */
function renderProfileShell(user, req) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const title = `${user.name} · ${SITE_NAME}`;
  const desc = user.headline || `${user.company || ''} ${user.title || ''}`.trim() || SITE_SLOGAN;
  const color = avatarColor(user.slug || user.name);
  const letter = initial(user.name);
  // 用 SVG data URI 生成 OG 图（无外部依赖）
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${color}"/><text x="50%" y="54%" font-size="280" fill="#fff" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(letter)}</text></svg>`;
  const ogImage = `${origin}/og/${encodeURIComponent(user.slug)}.svg`;

  const meta = `
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:url" content="${esc(origin + '/u/' + user.slug)}">
  <meta name="twitter:card" content="summary_large_image">
  <script>window.__SSR__ = { profileSlug: ${JSON.stringify(user.slug)} };</script>`;

  return shell.replace('<!--SSR_META-->', meta);
}

/** OG 占位图（SVG） */
app.get('/og/:file', (req, res) => {
  const slug = String(req.params.file).replace(/\.svg$/i, '');
  const u = db.prepare('SELECT name, slug FROM users WHERE slug = ? COLLATE NOCASE').get(slug);
  const color = avatarColor(slug);
  const letter = initial(u ? u.name : slug);
  res.type('image/svg+xml').send(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${color}"/><text x="50%" y="54%" font-size="280" fill="#fff" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(letter)}</text></svg>`
  );
});

/** 个人主页：先尝试 SSR，失败则交回 SPA 处理（前端会请求 API 并展示未公开提示） */
app.get('/u/:slug', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE slug = ? COLLATE NOCASE').get(req.params.slug);
  if (!u || u.visibility !== 'public') return res.send(shell);
  res.send(renderProfileShell(u, req));
});

/** 其余页面统一交给 SPA */
const PAGE_ROUTES = ['/', '/circles', '/circles/:slug', '/me/edit', '/signup', '/login', '/directory'];
PAGE_ROUTES.forEach(r => app.get(r, (req, res) => res.send(shell)));

/* 404 */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: '接口不存在' });
  res.status(404).send(shell);
});

/* 错误兜底 */
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  // 把真实报错暴露出来，方便线上排查（生产环境可考虑去掉 message 字段）
  res.status(500).json({ error: '服务器内部错误', message: (err && err.message) || 'unknown', stack: (process.env.NODE_ENV !== 'production' ? err.stack : undefined) });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`  ${SITE_NAME} · ${SITE_SLOGAN}`);
  console.log(`  ▸ http://localhost:${PORT}`);
  console.log(`  ▸ 演示登录：zhangmingyuan@demo.com / quannei123`);
  console.log('');
});
