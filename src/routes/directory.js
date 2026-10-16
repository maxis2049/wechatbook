/** 名录广场：搜索 + 四维筛选 + 排序 + 分页（公开） */
const express = require('express');
const { db } = require('../db');
const { avatarColor, initial } = require('../lib');

const router = express.Router();

const SORTS = {
  recent: 'u.updated_at DESC',
  name: 'u.name COLLATE NOCASE ASC',
  created: 'u.created_at DESC',
};
const list = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

router.get('/', (req, res) => {
  const { q = '', industry = '', city = '', tag = '', circle = '', sort = 'recent', page = 1, size = 24 } = req.query;

  // whereSql 与 params 必须精确匹配：每加一个条件就同时登记对应的命名参数，
  // 多余的键在 count 查询会触发 node:sqlite 的 "Unknown named parameter"
  const where = ["u.visibility = 'public'"];
  const params = {};

  if (q.trim()) {
    where.push(`(u.name LIKE @kw OR u.company LIKE @kw OR u.headline LIKE @kw
                 OR EXISTS (SELECT 1 FROM profile_sections ps WHERE ps.user_id = u.id AND ps.content LIKE @kw)
                 OR EXISTS (SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                            WHERE ut.user_id = u.id AND t.name LIKE @kw))`);
    params.kw = `%${q.trim()}%`;
  }

  const inds = list(industry);
  if (inds.length) { where.push(`u.industry IN (${inds.map((_, i) => '@ind' + i).join(',')})`); inds.forEach((v, i) => params['ind' + i] = v); }

  const cities = list(city);
  if (cities.length) { where.push(`u.city IN (${cities.map((_, i) => '@city' + i).join(',')})`); cities.forEach((v, i) => params['city' + i] = v); }

  const tags = list(tag); // OR 语义：命中任一标签
  if (tags.length) {
    where.push(`EXISTS (SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                        WHERE ut.user_id = u.id AND t.name IN (${tags.map((_, i) => '@tag' + i).join(',')}))`);
    tags.forEach((v, i) => params['tag' + i] = v);
  }

  const circles = list(circle);
  if (circles.length) {
    where.push(`EXISTS (SELECT 1 FROM circle_members cm JOIN circles c ON c.id = cm.circle_id
                        WHERE cm.user_id = u.id AND c.slug IN (${circles.map((_, i) => '@cir' + i).join(',')}))`);
    circles.forEach((v, i) => params['cir' + i] = v);
  }

  const whereSql = 'WHERE ' + where.join(' AND ');
  const orderBy = SORTS[sort] || SORTS.recent;

  // count 用的正是当前 params（此时还没有 limit/offset）
  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${whereSql}`).get(params).c;

  const limit = Math.min(Math.max(parseInt(size, 10) || 24, 1), 60);
  const p = Math.max(parseInt(page, 10) || 1, 1);
  // 追加分页参数后 params 与主查询占位符完全匹配
  params.limit = limit;
  params.offset = (p - 1) * limit;

  const rows = db.prepare(`
    SELECT u.id,u.slug,u.name,u.headline,u.company,u.title,u.industry,u.city,u.avatar_url,u.updated_at
    FROM users u ${whereSql} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
  `).all(params);

  const tagStmt = db.prepare(`SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                              WHERE ut.user_id = ? ORDER BY t.use_count DESC LIMIT 3`);
  const cirStmt = db.prepare(`SELECT c.slug, c.name, c.emoji, c.theme FROM circle_members cm
                              JOIN circles c ON c.id = cm.circle_id WHERE cm.user_id = ? LIMIT 3`);

  const items = rows.map(r => ({
    id: r.id, slug: r.slug, name: r.name,
    headline: r.headline || '',
    company: r.company, title: r.title,
    industry: r.industry, city: r.city,
    avatarUrl: r.avatar_url,
    avatarColor: avatarColor(r.slug || r.name),
    initial: initial(r.name),
    tags: tagStmt.all(r.id).map(x => x.name),
    circles: cirStmt.all(r.id),
    updatedAt: r.updated_at,
  }));

  res.json({ total, page: p, size: limit, pages: Math.ceil(total / limit) || 1, items });
});

module.exports = { router };
