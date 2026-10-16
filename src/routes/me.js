/** 我的主页：读写自己（均需登录） */
const express = require('express');
const crypto = require('crypto');
const { db, withTransaction } = require('../db');
const { clean, uniqueSlug } = require('../lib');
const { buildProfile, SECTION_DEFAULT } = require('./profile');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.uid) return res.status(401).json({ error: '请先登录' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.uid);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ error: '请先登录' }); }
  req.user = user;
  next();
}

/* 取自己完整主页（含未公开字段） */
router.get('/', requireLogin, (req, res) => {
  res.json({ profile: buildProfile(req.user, req.user) });
});

/* 保存主页 */
router.put('/', requireLogin, (req, res) => {
  const b = req.body || {};
  const u = req.user;

  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: '姓名不能为空' });

  const headline = (b.headline || '').toString().slice(0, 120);
  const company = (b.company || '').toString().slice(0, 80);
  const title = (b.title || '').toString().slice(0, 80);
  const industry = (b.industry || '其他').toString().slice(0, 30);
  const city = (b.city || '').toString().slice(0, 30);
  const phone = (b.phone || '').toString().slice(0, 40);
  const wechat = (b.wechat || '').toString().slice(0, 60);
  const website = (b.website || '').toString().slice(0, 200);
  const visibility = ['public', 'circle', 'private'].includes(b.visibility) ? b.visibility : 'public';

  // 行业必须在字典中（不存在则自动加入字典，实现「可扩展」）
  db.prepare('INSERT OR IGNORE INTO industries(name) VALUES (?)').run(industry);

  const slug = b.slug ? uniqueSlug(db, b.slug, u.id) : u.slug;

  const tx = () => {
    db.prepare(`UPDATE users SET
        name=?, headline=?, company=?, title=?, industry=?, city=?, slug=?,
        phone=?, wechat=?, website=?,
        phone_public=?, wechat_public=?, website_public=?, email_public=?,
        visibility=?, updated_at=datetime('now')
      WHERE id=?`).run(
      name, headline, company, title, industry, city, slug,
      phone, wechat, website,
      b.phonePublic ? 1 : 0, b.wechatPublic ? 1 : 0, b.websitePublic ? 1 : 0, b.emailPublic ? 1 : 0,
      visibility, u.id
    );

    // 小节：整体替换
    if (Array.isArray(b.sections)) {
      db.prepare('DELETE FROM profile_sections WHERE user_id = ?').run(u.id);
      const ins = db.prepare(`INSERT INTO profile_sections (id,user_id,kind,title,content,sort_order)
                              VALUES (?,?,?,?,?,?)`);
      b.sections.forEach((s, i) => {
        const t = (s.title || '').toString().trim() || '未命名小节';
        const c = clean(s.content);
        if (!c && !s.title) return;              // 跳过完全空的小节
        ins.run(crypto.randomUUID(), u.id, (s.kind || 'custom').toString().slice(0, 20), t.slice(0, 60), c, i);
      });
    }

    // 标签：整体替换，最多 5 个
    if (Array.isArray(b.tags)) {
      db.prepare('DELETE FROM user_tags WHERE user_id = ?').run(u.id);
      const names = [...new Set(b.tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 5);
      const insTag = db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
      const link = db.prepare('INSERT OR IGNORE INTO user_tags(user_id,tag_id) VALUES (?,?)');
      names.forEach(n => { insTag.run(n.slice(0, 24)); link.run(u.id, getTag.get(n.slice(0, 24)).id); });
      db.prepare(`UPDATE tags SET use_count = (SELECT COUNT(*) FROM user_tags WHERE user_tags.tag_id = tags.id)`).run();
    }
  };

  withTransaction(tx);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ profile: buildProfile(fresh, fresh) });
});

/* 用默认小节模板初始化（引导新用户） */
router.post('/scaffold', requireLogin, (req, res) => {
  const has = db.prepare('SELECT COUNT(*) c FROM profile_sections WHERE user_id = ?').get(req.user.id).c;
  if (has > 0) return res.json({ created: 0 });
  const ins = db.prepare(`INSERT INTO profile_sections (id,user_id,kind,title,content,sort_order)
                          VALUES (?,?,?,?,'',?)`);
  SECTION_DEFAULT.forEach((s, i) => ins.run(crypto.randomUUID(), req.user.id, s.kind, s.title, i));
  res.json({ created: SECTION_DEFAULT.length });
});

module.exports = { router, requireLogin };
