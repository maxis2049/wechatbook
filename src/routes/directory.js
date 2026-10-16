/** 名录广场：搜索 + 四维筛选 + 排序 + 分页（公开）
 *
 * 全部使用位置参数（?）绑定。
 * 原因：node:sqlite 在不同 Node 22.x 小版本下对「命名参数」的校验行为不一致
 * （有的版本多余命名键抛 "Unknown named parameter"），线上 Docker 的 Node 小版本
 * 与本地开发可能不同，会触发 500。位置参数是最基础、跨版本零差异的绑定方式。
 */
const express = require('express');
const { db } = require('../db');
const { avatarColor, initial } = require('../lib');

const router = express.Router();

const SORTS = {
  recent: 'u.updated_at DESC',
  name: 'u.name COLLATE NOCASE ASC',
  created: 'u.created_at DESC',
};
const toList = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

router.get('/', (req, res) => {
  const { q = '', industry = '', city = '', tag = '', circle = '', sort = 'recent', page = 1, size = 24 } = req.query;

  // conds：SQL 片段（含 ? 占位），vals：位置参数值，顺序与 ? 严格一致
  const conds = ["u.visibility = 'public'"];
  const vals = [];

  if (q.trim()) {
    conds.push(`(u.name LIKE ? OR u.company LIKE ? OR u.headline LIKE ?
                 OR EXISTS (SELECT 1 FROM profile_sections ps WHERE ps.user_id = u.id AND ps.content LIKE ?)
                 OR EXISTS (SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                            WHERE ut.user_id = u.id AND t.name LIKE ?))`);
    const kw = '%' + q.trim() + '%';
    vals.push(kw, kw, kw, kw, kw); // 5 个 LIKE ?
  }

  const inds = toList(industry);
  if (inds.length) {
    conds.push(`u.industry IN (${inds.map(() => '?').join(',')})`);
    vals.push(...inds);
  }

  const cities = toList(city);
  if (cities.length) {
    conds.push(`u.city IN (${cities.map(() => '?').join(',')})`);
    vals.push(...cities);
  }

  const tags = toList(tag); // OR 语义：命中任一标签
  if (tags.length) {
    conds.push(`EXISTS (SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
                        WHERE ut.user_id = u.id AND t.name IN (${tags.map(() => '?').join(',')}))`);
    vals.push(...tags);
  }

  const circles = toList(circle);
  if (circles.length) {
    conds.push(`EXISTS (SELECT 1 FROM circle_members cm JOIN circles c ON c.id = cm.circle_id
                        WHERE cm.user_id = u.id AND c.slug IN (${circles.map(() => '?').join(',')}))`);
    vals.push(...circles);
  }

  const whereSql = 'WHERE ' + conds.join(' AND ');
  const orderBy = SORTS[sort] || SORTS.recent;

  const base = `SELECT COUNT(*) c FROM users u ${whereSql}`;
  const total = db.prepare(base).get(...vals).c;

  const limit = Math.min(Math.max(parseInt(size, 10) || 24, 1), 60);
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const rows = db.prepare(
    `SELECT u.id,u.slug,u.name,u.headline,u.company,u.title,u.industry,u.city,u.avatar_url,u.updated_at
     FROM users u ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...vals, limit, (p - 1) * limit);

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
