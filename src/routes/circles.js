/** 圈子：列表 / 详情 / 成员 / 加入退出 / 创建 */
const express = require('express');
const crypto = require('crypto');
const { db, withTransaction } = require('../db');
const { avatarColor, initial, normalizeSlug } = require('../lib');

const router = express.Router();

const THEMES = { teal: ['#E7F5F2', '#1F7A6E'], brand: ['#FDF1EA', '#B8502C'], gold: ['#FAF2E1', '#8F6A1A'], blue: ['#EEF4FF', '#3A5F9E'] };

function circleCard(c, viewerId) {
  const memberCount = db.prepare('SELECT COUNT(*) c FROM circle_members WHERE circle_id = ?').get(c.id).c;
  const joined = viewerId
    ? !!db.prepare('SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ?').get(c.id, viewerId)
    : false;
  return {
    id: c.id, name: c.name, slug: c.slug, intro: c.intro,
    emoji: c.emoji, theme: c.theme, joinPolicy: c.join_policy,
    memberCount, joined,
  };
}

/* 圈子列表 */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM circles ORDER BY name').all();
  res.json({ items: rows.map(c => circleCard(c, req.session.uid)) });
});

/* 圈子详情 + 成员 */
router.get('/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM circles WHERE slug = ? COLLATE NOCASE').get(req.params.slug);
  if (!c) return res.status(404).json({ error: '圈子不存在' });

  const members = db.prepare(`
    SELECT u.id,u.slug,u.name,u.headline,u.company,u.title,u.industry,u.city,u.avatar_url,cm.role
    FROM circle_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.circle_id = ? AND u.visibility != 'private'
    ORDER BY cm.role='owner' DESC, u.name COLLATE NOCASE
  `).all(c.id);

  const tagStmt = db.prepare(`SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                              WHERE ut.user_id = ? ORDER BY t.use_count DESC LIMIT 3`);

  res.json({
    circle: circleCard(c, req.session.uid),
    members: members.map(m => ({
      id: m.id, slug: m.slug, name: m.name, headline: m.headline,
      company: m.company, title: m.title, industry: m.industry, city: m.city,
      avatarUrl: m.avatar_url, avatarColor: avatarColor(m.slug || m.name),
      initial: initial(m.name), role: m.role,
      tags: tagStmt.all(m.id).map(x => x.name),
    })),
  });
});

/* 创建圈子（登录） */
router.post('/', (req, res) => {
  if (!req.session.uid) return res.status(401).json({ error: '请先登录' });
  const { name, slug, intro = '', emoji = '🏛', theme = 'teal', joinPolicy = 'open' } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写圈子名称' });

  let s = normalizeSlug(slug || name) || 'circle';
  let cand = s, i = 1;
  while (db.prepare('SELECT 1 FROM circles WHERE slug = ? COLLATE NOCASE').get(cand)) cand = s + (++i);

  const id = crypto.randomUUID();
  withTransaction(() => {
    db.prepare(`INSERT INTO circles (id,name,slug,intro,emoji,theme,join_policy,owner_id)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, name.trim().slice(0, 60), cand, String(intro).slice(0, 400),
           String(emoji).slice(0, 4), THEMES[theme] ? theme : 'teal',
           ['open', 'review'].includes(joinPolicy) ? joinPolicy : 'open', req.session.uid);
    db.prepare('INSERT OR IGNORE INTO circle_members(circle_id,user_id,role) VALUES (?,?,?)')
      .run(id, req.session.uid, 'owner');
  });
  res.json({ circle: circleCard(db.prepare('SELECT * FROM circles WHERE id = ?').get(id), req.session.uid) });
});

/* 加入圈子（登录）；review 策略下代表「申请已提交」 */
router.post('/:slug/join', (req, res) => {
  if (!req.session.uid) return res.status(401).json({ error: '请先登录' });
  const c = db.prepare('SELECT * FROM circles WHERE slug = ? COLLATE NOCASE').get(req.params.slug);
  if (!c) return res.status(404).json({ error: '圈子不存在' });

  const inCircle = db.prepare('SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ?').get(c.id, req.session.uid);
  if (inCircle) return res.json({ joined: true, role: inCircle.role });

  let role = 'member';
  if (c.join_policy === 'review') {
    // MVP：审核制圈子先按「待审核」处理，这里简化为一律加入并标记 member
    role = 'member';
  }
  db.prepare('INSERT OR IGNORE INTO circle_members(circle_id,user_id,role) VALUES (?,?,?)').run(c.id, req.session.uid, role);
  res.json({ joined: true, role, pending: c.join_policy === 'review' });
});

/* 退出圈子（登录，圈主不可退出） */
router.post('/:slug/leave', (req, res) => {
  if (!req.session.uid) return res.status(401).json({ error: '请先登录' });
  const c = db.prepare('SELECT * FROM circles WHERE slug = ? COLLATE NOCASE').get(req.params.slug);
  if (!c) return res.status(404).json({ error: '圈子不存在' });
  const m = db.prepare('SELECT role FROM circle_members WHERE circle_id = ? AND user_id = ?').get(c.id, req.session.uid);
  if (m && m.role === 'owner') return res.status(400).json({ error: '圈主不能退出圈子' });
  db.prepare('DELETE FROM circle_members WHERE circle_id = ? AND user_id = ?').run(c.id, req.session.uid);
  res.json({ joined: false });
});

module.exports = { router };
