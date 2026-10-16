/** 个人主页：读取（公开） / 编辑（登录） */
const express = require('express');
const { db } = require('../db');
const { clean, excerpt, avatarColor, initial, uniqueSlug } = require('../lib');

const router = express.Router();

const SECTION_DEFAULT = [
  { kind: 'about', title: '关于我' },
  { kind: 'experience', title: '职业经历' },
  { kind: 'offer', title: '我可以提供' },
  { kind: 'need', title: '我正在寻找' },
];

/** 组装一个人的完整主页数据 */
function buildProfile(user, viewer) {
  const sections = db.prepare(
    'SELECT id,kind,title,content,sort_order FROM profile_sections WHERE user_id = ? ORDER BY sort_order, rowid'
  ).all(user.id).map(s => ({ id: s.id, kind: s.kind, title: s.title, content: s.content }));

  const tags = db.prepare(
    'SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = ? ORDER BY t.use_count DESC, t.name'
  ).all(user.id).map(r => r.name);

  const circles = db.prepare(
    `SELECT c.id,c.name,c.slug,c.emoji,c.theme,cm.role FROM circle_members cm
     JOIN circles c ON c.id = cm.circle_id WHERE cm.user_id = ? ORDER BY c.name`
  ).all(user.id);

  const isSelf = viewer && viewer.id === user.id;
  const contact = [];
  const push = (type, label, value, isPublic, icon) => {
    if (!value) return;
    contact.push({ type, label, icon, value, isPublic: !!(isSelf || isPublic) });
  };
  push('phone', '手机', user.phone, user.phone_public, '📱');
  push('email', '邮箱', user.email, user.email_public, '✉️');
  push('wechat', '微信', user.wechat, user.wechat_public, '💬');
  push('website', '网址', user.website, user.website_public, '🔗');

  return {
    id: user.id,
    slug: user.slug,
    name: user.name,
    headline: user.headline,
    avatarUrl: user.avatar_url,
    avatarColor: avatarColor(user.slug || user.name),
    initial: initial(user.name),
    company: user.company,
    title: user.title,
    industry: user.industry,
    city: user.city,
    visibility: user.visibility,
    updatedAt: user.updated_at,
    isSelf: !!isSelf,
    sections,
    tags,
    circles,
    contact,
    // 编辑用原始字段（仅本人可见）
    raw: isSelf ? {
      phone: user.phone, wechat: user.wechat, website: user.website, email: user.email,
      phonePublic: !!user.phone_public, wechatPublic: !!user.wechat_public,
      websitePublic: !!user.website_public, emailPublic: !!user.email_public,
      visibility: user.visibility,
    } : undefined,
  };
}

/** 可见性判定：viewer 能否看这个主页 */
function canView(user, viewer) {
  if (user.visibility === 'public') return true;
  if (!viewer) return false;
  if (viewer.id === user.id) return true;
  if (user.visibility === 'private') return false;
  // circle：同圈子任一即可见
  const shared = db.prepare(
    `SELECT 1 FROM circle_members a
     JOIN circle_members b ON a.circle_id = b.circle_id
     WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`
  ).get(user.id, viewer.id);
  return !!shared;
}

/* 读主页 */
router.get('/:slug', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE slug = ? COLLATE NOCASE').get(req.params.slug);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const viewer = req.session.uid
    ? db.prepare('SELECT id FROM users WHERE id = ?').get(req.session.uid)
    : null;

  if (!canView(user, viewer)) {
    return res.status(403).json({ error: '该主页未公开', locked: true, name: user.name, slug: user.slug });
  }
  res.json({ profile: buildProfile(user, viewer) });
});

module.exports = { router, buildProfile, canView, SECTION_DEFAULT };
