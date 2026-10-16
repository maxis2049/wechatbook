/** 字典：行业 / 城市 / 标签 / 圈子（供筛选器使用） */
const express = require('express');
const { db } = require('../db');

const router = express.Router();

const CITIES_SEED = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '苏州',
  '宁波', '南京', '武汉', '西安', '天津', '长沙', '青岛', '厦门', '郑州', '合肥',
  '福州', '济南', '东莞', '佛山', '无锡', '昆明', '大连', '沈阳', '石家庄', '南昌',
  '贵阳', '南宁', '哈尔滨', '长春', '太原', '乌鲁木齐', '兰州', '海口', '海外'];

/** 全量字典 */
router.get('/', (req, res) => {
  const industries = db.prepare('SELECT name FROM industries WHERE active = 1 ORDER BY rowid').all().map(r => r.name);

  // 城市：预置城市 + 用户实际填写过的（去重，预置在前）
  const used = db.prepare(`SELECT DISTINCT city FROM users WHERE city != '' AND visibility != 'private'`).all().map(r => r.city);
  const cities = [...CITIES_SEED.filter(c => used.includes(c) || true)];
  used.forEach(c => { if (!cities.includes(c)) cities.push(c); });

  const tags = db.prepare('SELECT name, use_count FROM tags ORDER BY use_count DESC, name LIMIT 100').all();
  const circles = db.prepare('SELECT slug,name,emoji,theme FROM circles ORDER BY name').all();

  res.json({ industries, cities, tags, circles });
});

module.exports = { router };
