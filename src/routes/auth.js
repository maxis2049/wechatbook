/** 账号：注册 / 登录 / 登出 / 当前用户 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { normalizeSlug, uniqueSlug } = require('../lib');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, slug: u.slug, name: u.name,
    headline: u.headline, company: u.company, title: u.title,
    industry: u.industry, city: u.city, avatarUrl: u.avatar_url,
    visibility: u.visibility,
  };
}

/* 注册 */
router.post('/signup', (req, res) => {
  const { email, password, name, slug } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: '请输入有效的邮箱地址' });
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入姓名' });

  const exists = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (exists) return res.status(409).json({ error: '该邮箱已注册，请直接登录' });

  const id = crypto.randomUUID();
  const finalSlug = uniqueSlug(db, slug || name);
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(`INSERT INTO users (id,email,password_hash,slug,name,industry)
              VALUES (?,?,?,?,?,?)`)
    .run(id, email.trim(), hash, finalSlug, name.trim(), '其他');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  req.session.uid = id;
  res.json({ user: publicUser(user) });
});

/* 登录 */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }
  req.session.uid = user.id;
  res.json({ user: publicUser(user) });
});

/* 登出 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* 当前登录用户 */
router.get('/me', (req, res) => {
  if (!req.session.uid) return res.json({ user: null });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.uid);
  res.json({ user: publicUser(user) });
});

/* 注销账号：真删（级联删主页小节 / 标签 / 圈子成员） */
router.delete('/me', (req, res) => {
  if (!req.session.uid) return res.status(401).json({ error: '未登录' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.session.uid);
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = { router, publicUser };
