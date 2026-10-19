/** 数据备份 / 恢复（安全网）
 *
 * 背景：Render 若未挂持久盘（Persistent Disk），每次重新部署会清空 /data/quannei.db，
 *       真实注册的账号随之丢失。本模块让你在部署前「导出」一份 JSON，部署后「导入」恢复。
 *
 * 安全：所有操作都必须带 adminKey（环境变量 ADMIN_KEY）。未设置 ADMIN_KEY 时一律 403。
 * 用法：
 *   导出  GET /api/backup?adminKey=XXX
 *   恢复  POST /api/backup  { adminKey, data }   （data 为导出的 JSON 对象）
 */
const express = require('express');
const crypto = require('crypto');
const { db, withTransaction } = require('../db');

const router = express.Router();

function guard(req, res, next) {
  const required = process.env.ADMIN_KEY;
  if (!required) return res.status(503).json({ error: '未配置 ADMIN_KEY，备份功能不可用（请在 Render 设环境变量 ADMIN_KEY 后重试）' });
  const given = String((req.query.adminKey || (req.body && req.body.adminKey) || ''));
  if (given !== required) return res.status(403).json({ error: 'adminKey 不正确' });
  next();
}

/** 导出：仅导出「真实用户」(非 @demo.com) 及其关联数据，用 email 作稳定身份键 */
router.get('/', guard, (req, res) => {
  const realUsers = db.prepare("SELECT * FROM users WHERE email NOT LIKE '%@demo.com'").all();
  const secStmt = db.prepare('SELECT kind,title,content,sort_order FROM profile_sections WHERE user_id = ? ORDER BY sort_order');
  const tagStmt = db.prepare('SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = ?');
  const cirStmt = db.prepare('SELECT cm.role, c.slug AS circleSlug FROM circle_members cm JOIN circles c ON c.id = cm.circle_id WHERE cm.user_id = ?');

  const circles = db.prepare('SELECT slug,name,intro,emoji,theme,join_policy FROM circles').all()
    .map(c => ({ ...c }));

  const payload = {
    app: 'quannei',
    format: 1,
    exportedAt: new Date().toISOString(),
    users: realUsers.map(u => ({
      email: u.email, slug: u.slug, name: u.name, headline: u.headline, avatarUrl: u.avatar_url,
      company: u.company, title: u.title, industry: u.industry, city: u.city,
      phone: u.phone, wechat: u.wechat, website: u.website,
      phonePublic: !!u.phone_public, wechatPublic: !!u.wechat_public,
      websitePublic: !!u.website_public, emailPublic: !!u.email_public,
      visibility: u.visibility, passwordHash: u.password_hash,
      sections: secStmt.all(u.id),
      tags: tagStmt.all(u.id).map(t => t.name),
      circles: cirStmt.all(u.id).map(c => ({ slug: c.circleSlug, role: c.role })),
    })),
    circles,
  };
  res.json(payload);
});

/** 恢复：把导出的 JSON 灌回数据库（upsert by email / circle slug / tag name） */
router.post('/', guard, (req, res) => {
  const d = req.body && req.body.data;
  if (!d || !Array.isArray(d.users)) return res.status(400).json({ error: '缺少 data.users 数组' });

  let created = 0, restored = 0;

  withTransaction(() => {
    // 1) 圈子（按 slug upsert）
    const insCircle = db.prepare(`INSERT INTO circles (id,name,slug,intro,emoji,theme,join_policy,owner_id)
        VALUES (?,?,?,?,?,?,?,NULL)
        ON CONFLICT(slug) DO UPDATE SET name=excluded.name, intro=excluded.intro,
          emoji=excluded.emoji, theme=excluded.theme, join_policy=excluded.join_policy`);
    const getCircle = db.prepare('SELECT id FROM circles WHERE slug = ? COLLATE NOCASE');
    const circleIds = {};
    (d.circles || []).forEach(c => {
      if (!c.slug) return;
      insCircle.run(crypto.randomUUID(), c.name || c.slug, c.slug, c.intro || '',
        c.emoji || '🏛', c.theme || 'teal', c.join_policy || 'open');
      circleIds[c.slug] = getCircle.get(c.slug).id;
    });

    // 2) 用户（按 email upsert；演示账号 email=@demo.com 不会被导出，天然安全）
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const insUser = db.prepare(`
      INSERT INTO users (id,email,password_hash,slug,name,headline,avatar_url,company,title,industry,city,
        phone,wechat,website,phone_public,wechat_public,website_public,email_public,visibility,
        created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET
        slug=excluded.slug, name=excluded.name, headline=excluded.headline, avatar_url=excluded.avatar_url,
        company=excluded.company, title=excluded.title, industry=excluded.industry, city=excluded.city,
        phone=excluded.phone, wechat=excluded.wechat, website=excluded.website,
        phone_public=excluded.phone_public, wechat_public=excluded.wechat_public,
        website_public=excluded.website_public, email_public=excluded.email_public,
        visibility=excluded.visibility, updated_at=datetime('now')`);
    const clean = require('../lib').clean;
    const insTag = db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)');
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
    const link = db.prepare('INSERT OR IGNORE INTO user_tags(user_id,tag_id) VALUES (?,?)');
    const insMember = db.prepare('INSERT OR IGNORE INTO circle_members(circle_id,user_id,role) VALUES (?,?,?)');
    const getUser = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE');

    d.users.forEach(u => {
      if (!u.email || !emailRe.test(u.email)) return;
      const isNew = !getUser.get(u.email);
      const id = u.id || crypto.randomUUID();
      insUser.run(id, u.email, u.passwordHash || crypto.randomBytes(20).toString('hex'),
        u.slug || u.email.split('@')[0], u.name || u.email, u.headline || '', u.avatarUrl || null,
        u.company || '', u.title || '', u.industry || '其他', u.city || '',
        u.phone || '', u.wechat || '', u.website || '',
        u.phonePublic ? 1 : 0, u.wechatPublic ? 1 : 0, u.websitePublic ? 1 : 0,
        u.emailPublic ? 1 : 0, u.visibility || 'public',
        new Date().toISOString(), new Date().toISOString());
      if (isNew) created++; else restored++;

      // 标签
      db.prepare('DELETE FROM user_tags WHERE user_id = ?').run(id);
      (u.tags || []).forEach(n => { if (n) { insTag.run(String(n).slice(0, 24)); link.run(id, getTag.get(String(n).slice(0, 24)).id); } });

      // 正文小节
      db.prepare('DELETE FROM profile_sections WHERE user_id = ?').run(id);
      const insSec = db.prepare('INSERT INTO profile_sections(id,user_id,kind,title,content,sort_order) VALUES (?,?,?,?,?,?)');
      (u.sections || []).forEach((s, i) => insSec.run(crypto.randomUUID(), id, s.kind || 'custom', s.title || '小节', clean(s.content || ''), i));

      // 圈子成员
      db.prepare('DELETE FROM circle_members WHERE user_id = ?').run(id);
      (u.circles || []).forEach(c => { if (circleIds[c.slug]) insMember.run(circleIds[c.slug], id, c.role || 'member'); });
    });

    // 标签使用计数
    db.prepare(`UPDATE tags SET use_count = (SELECT COUNT(*) FROM user_tags WHERE user_tags.tag_id = tags.id)`).run();
  });

  res.json({ ok: true, created, restored, users: d.users.length,
    message: `恢复完成：新建 ${created} 人，覆盖更新 ${restored} 人` });
});

module.exports = { router };
