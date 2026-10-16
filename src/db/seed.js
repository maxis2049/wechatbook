/**
 * 种子数据：预置 demo 里的 12 位成员 + 4 个圈子
 * 幂等：仅当 users 表为空时写入
 * 所有演示账号密码统一为 quannei123
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, withTransaction } = require('./index');

const DEMO_PASSWORD = 'quannei123';
const uid = () => crypto.randomUUID();

const INDUSTRIES = ['互联网', '金融', '教育', '医疗', '制造', '媒体', '法律', '咨询', '设计', '科研', '体制内', '其他'];

const CIRCLES = [
  { name: '跨境电商校友会', slug: 'cross-border', emoji: '🛒', theme: 'teal',
    intro: '聚集了做跨境、出海、独立站的校友，每月一次线下交流。', join_policy: 'open' },
  { name: '浙大计算机校友群', slug: 'zju-cs', emoji: '💻', theme: 'brand',
    intro: '从 08 级到 22 级，横跨十余届的计算机学院校友群。', join_policy: 'open' },
  { name: '杭马跑友俱乐部', slug: 'hmarathon', emoji: '🏃', theme: 'gold',
    intro: '周末约跑，一起备战杭州马拉松。', join_policy: 'open' },
  { name: '早期投资交流圈', slug: 'early-invest', emoji: '📈', theme: 'blue',
    intro: '天使投资人、FA、创业者组成的小圈子，只聊真问题。', join_policy: 'review' },
];

// slug 必须与 email 前缀一致，便于演示登录
const PEOPLE = [
  { slug: 'zhangmingyuan', name: '张明远', email: 'zhangmingyuan@demo.com',
    headline: '做了 9 年后端，现在带 20 人技术团队，最近在研究 AI Agent 在电商场景落地。',
    company: '某跨境电商 SaaS', title: '联合创始人 & CTO', city: '杭州', industry: '互联网',
    tags: ['跨境电商', '增长营销', 'AI 应用'], circles: ['cross-border', 'zju-cs'],
    phone: '13812345678', wechat: 'zhang_mingyuan', website: 'https://zhangmy.dev',
    pub: { phone: 1, wechat: 1, website: 0 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>2015 年从浙大计算机毕业，在两家公司做过后端与架构，2020 年开始创业，方向是跨境电商 SaaS 工具。技术上偏好 Go 和 Postgres，管理上信奉「小团队、高信息密度」。</p><p>工作之外爱跑步（半马 PB 1:52），也做点不赚钱的开源项目。</p>' },
      { kind: 'experience', title: '职业经历', content: '<ul><li><strong>2020 — 现在</strong>　某跨境电商 SaaS，联合创始人 &amp; CTO，负责技术体系与团队</li><li><strong>2018 — 2020</strong>　某大厂，高级后端工程师，负责商品中台</li><li><strong>2015 — 2018</strong>　某创业公司，后端工程师 → 技术负责人</li></ul>' },
      { kind: 'offer', title: '我可以提供', content: '<blockquote>如果群里有朋友在做跨境电商、或者需要技术团队搭建方面的建议（架构选型、招聘、技术合伙），随时找我聊，不收费，纯交朋友。</blockquote>' },
      { kind: 'need', title: '我正在寻找', content: '<p>想认识做<strong>出海品牌运营</strong>和<strong>海外市场投放</strong>的朋友，我们在做 AI 选品，需要真实业务场景来验证。</p>' },
    ] },

  { slug: 'lijingyi', name: '李静怡', email: 'lijingyi@demo.com',
    headline: '8 年消费品品牌操盘，擅长从 0 到 1 打造爆品，也做过私域增长。',
    company: '新消费品牌', title: '品牌总监', city: '上海', industry: '媒体',
    tags: ['品牌营销', '私域增长', '消费品'], circles: ['cross-border'],
    phone: '13822334455', wechat: 'lijingyi_brand',
    pub: { phone: 0, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>在消费品行业做了 8 年，从电商运营一路做到品牌总监。擅长把一个没人知道的小品牌，做成行业里有人讨论的名字。</p>' },
      { kind: 'offer', title: '我可以提供', content: '<p>品牌定位、内容策略、私域体系搭建的实战经验。如果你正在做消费品创业，欢迎交流。</p>' },
    ] },

  { slug: 'wangsiyuan', name: '王思远', email: 'wangsiyuan@demo.com',
    headline: '产品设计师，专注 B 端体验设计 8 年，相信好的设计能让复杂变简单。',
    company: '某科技公司', title: '设计负责人', city: '杭州', industry: '设计',
    tags: ['B端设计', '设计系统', '用户研究'], circles: ['zju-cs'],
    phone: '13900001111', wechat: 'wangsy_design',
    pub: { phone: 1, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>我是一名产品设计师，做 B 端已经 8 年，主要方向是复杂系统的信息架构与设计系统建设。</p><p>目前在带一支 6 人的设计团队，负责公司全线的产品设计规范。</p>' },
      { kind: 'experience', title: '职业经历', content: '<ul><li><strong>2021 — 现在</strong>　某科技公司，设计负责人</li><li><strong>2017 — 2021</strong>　某 SaaS 公司，高级产品设计师</li></ul>' },
    ] },

  { slug: 'chenmo', name: '陈默', email: 'chenmo@demo.com',
    headline: '在医疗行业做数据产品，北大医学背景转产品，关注 AI 辅助诊断。',
    company: '某医疗科技公司', title: '数据产品经理', city: '北京', industry: '医疗',
    tags: ['医疗数据', 'AI 应用', '产品经理'], circles: ['early-invest'],
    phone: '13500110022', wechat: 'chenmo_med', pub: { phone: 0, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>北大医学部毕业，在临床待过两年，后来转做产品。现在在一家医疗科技公司做数据产品，方向是 AI 辅助诊断。</p>' },
    ] },

  { slug: 'zhaojun', name: '赵君', email: 'zhaojun@demo.com',
    headline: '红圈所执业律师，主攻股权投融资和公司治理，服务过多家早期公司。',
    company: '某律师事务所', title: '合伙人', city: '北京', industry: '法律',
    tags: ['股权融资', '公司治理', '创业法律'], circles: ['early-invest'],
    phone: '13600110033', wechat: 'zhaojun_law', pub: { phone: 0, wechat: 0 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>执业 11 年，现在在一家红圈所做合伙人，主要方向是股权投融资和公司治理。服务过 60+ 家早期公司。</p>' },
      { kind: 'offer', title: '我可以提供', content: '<p>早期公司的股权架构、期权池设计、融资条款方面的建议。群里朋友有相关问题可以问我，简单咨询免费。</p>' },
    ] },

  { slug: 'zhouyutong', name: '周雨桐', email: 'zhouyutong@demo.com',
    headline: '前大厂 HRBP，现在做独立猎头和职业咨询，帮技术人规划职业路径。',
    company: '独立猎头顾问', title: '创始人', city: '深圳', industry: '咨询',
    tags: ['职业咨询', '技术招聘', 'HR'], circles: ['cross-border'],
    phone: '13700110044', wechat: 'zhouyt_career', pub: { phone: 1, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>在两家大厂做过 7 年 HRBP，2023 年出来做独立猎头和职业咨询。主要服务技术岗，帮候选人想清楚"下一步该去哪"。</p>' },
    ] },

  { slug: 'wujianping', name: '吴建平', email: 'wujianping@demo.com',
    headline: '制造业二代，做精密零部件，正在推进工厂数字化转型，想认识懂工业软件的人。',
    company: '某精密制造', title: '总经理', city: '宁波', industry: '制造',
    tags: ['智能制造', '供应链', '数字化转型'], circles: [],
    phone: '13500110055', wechat: 'wjp_manufacturing', pub: { phone: 0, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>家里的工厂做了 20 年精密零部件，我 2019 年接手，现在在推数字化改造——排产、质检、库存都想上系统。</p>' },
      { kind: 'need', title: '我正在寻找', content: '<p>想认识做<strong>工业软件 / MES / 智能制造</strong>的朋友，不管是厂商还是同行，都欢迎交流踩过的坑。</p>' },
    ] },

  { slug: 'sunkeer', name: '孙可儿', email: 'sunkeer@demo.com',
    headline: '独立摄影师，接过很多品牌视觉，也做播客聊青年生活方式。',
    company: '自由职业', title: '摄影师 / 内容创作', city: '成都', industry: '媒体',
    tags: ['视觉设计', '内容创作', '播客'], circles: ['hmarathon'],
    phone: '13800110066', wechat: 'sunkeer_photo', pub: { phone: 0, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>自由摄影师第 6 年，拍过 30+ 个品牌的视觉，也做一档聊青年生活方式的播客《慢一点》。</p><p>喜欢成都的慢节奏，喜欢跑步。</p>' },
    ] },

  { slug: 'linzhiyuan', name: '林志远', email: 'linzhiyuan@demo.com',
    headline: '中学物理老师，业余做科普视频，B 站 12 万粉丝，想找教育产品合作。',
    company: '某中学', title: '教师 / UP 主', city: '广州', industry: '教育',
    tags: ['教育科普', '视频创作', 'AI 应用'], circles: ['zju-cs'],
    phone: '13900110077', wechat: 'linzhiyuan_edu', pub: { phone: 1, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>物理老师，教了 10 年书。业余在 B 站做物理科普，账号 12 万粉丝，最火的一期讲"为什么天空是蓝的"有 80 万播放。</p>' },
      { kind: 'need', title: '我正在寻找', content: '<p>想找做<strong>教育产品 / 内容工具</strong>的朋友合作，把物理科普做得更有互动性。</p>' },
    ] },

  { slug: 'zhenghao', name: '郑好', email: 'zhenghao@demo.com',
    headline: '量化基金研究员，数学出身，喜欢用数据解释一切，也爱长跑和登山。',
    company: '某私募基金', title: '量化研究员', city: '上海', industry: '金融',
    tags: ['量化投资', '数据分析', '长跑'], circles: ['hmarathon', 'early-invest'],
    phone: '13600110088', wechat: 'zhenghao_quant',
    pub: { phone: 1, wechat: 1, website: 1 }, website: 'https://zhenghao.quant.blog',
    sections: [
      { kind: 'about', title: '关于我', content: '<p>数学系出身，现在在一家私募做量化研究，主要做中低频策略。相信大部分问题都可以用数据回答。</p><p>跑过 4 个全马，下一个目标是东京马拉松。</p>' },
    ] },

  { slug: 'huangxi', name: '黄曦', email: 'huangxi@demo.com',
    headline: '体制内工作，负责产业园区招商，想更多了解市场化的产业运作。',
    company: '某产业园区管委会', title: '招商主管', city: '苏州', industry: '体制内',
    tags: ['产业招商', '政企合作'], circles: [],
    phone: '13700110099', wechat: 'huangxi_park', pub: { phone: 0, wechat: 1 },
    sections: [
      { kind: 'about', title: '关于我', content: '<p>在苏州某产业园区做招商，主要面向高端制造和生物医药。工作之余喜欢逛园区里的咖啡馆，听创业者的故事。</p>' },
      { kind: 'need', title: '我正在寻找', content: '<p>想认识做<strong>产业投资 / 园区运营 / 政企服务</strong>的朋友，互相学习市场化的玩法。</p>' },
    ] },

  { slug: 'maxiaochuan', name: '马小川', email: 'maxiaochuan@demo.com',
    headline: '算法工程师，做推荐系统，业余写技术博客，最近在折腾大模型的落地应用。',
    company: '某互联网公司', title: '高级算法工程师', city: '深圳', industry: '互联网',
    tags: ['推荐算法', 'AI 应用', '技术写作'], circles: ['zju-cs'],
    phone: '13500110100', wechat: 'maxiaochuan_ai',
    pub: { phone: 0, wechat: 1, website: 1 }, website: 'https://mxc.tech',
    sections: [
      { kind: 'about', title: '关于我', content: '<p>做推荐系统 6 年，从召回到排序都趟过。业余写技术博客，最高的一篇讲"特征工程如何不踩坑"有 5 万阅读。</p><p>最近半年在折腾大模型的工程化落地，踩了不少坑。</p>' },
      { kind: 'offer', title: '我可以提供', content: '<p>推荐系统、算法工程、大模型落地的技术交流。也可以帮看简历。</p>' },
    ] },
];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return { skipped: true, users: count };

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const insIndustry = db.prepare('INSERT OR IGNORE INTO industries(name) VALUES (?)');
  const insTag = db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)');
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
  const insUser = db.prepare(`INSERT INTO users
    (id,email,password_hash,slug,name,headline,company,title,industry,city,phone,wechat,website,
     phone_public,wechat_public,email_public,website_public,visibility,created_at,updated_at)
    VALUES (@id,@email,@password_hash,@slug,@name,@headline,@company,@title,@industry,@city,@phone,@wechat,@website,
     @phone_public,@wechat_public,1,@website_public,'public',datetime('now','-'||@ago||' days'),datetime('now','-'||@ago||' days'))`);
  const insSection = db.prepare(`INSERT INTO profile_sections (id,user_id,kind,title,content,sort_order)
    VALUES (?,?,?,?,?,?)`);
  const insUserTag = db.prepare('INSERT OR IGNORE INTO user_tags(user_id,tag_id) VALUES (?,?)');
  const insCircle = db.prepare(`INSERT INTO circles (id,name,slug,intro,emoji,theme,join_policy,owner_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insMember = db.prepare('INSERT OR IGNORE INTO circle_members(circle_id,user_id,role) VALUES (?,?,?)');

  const run = () => {
    INDUSTRIES.forEach(n => insIndustry.run(n));

    // 圈子
    const circleId = {};
    CIRCLES.forEach(c => {
      const id = uid();
      circleId[c.slug] = id;
      insCircle.run(id, c.name, c.slug, c.intro, c.emoji, c.theme, c.join_policy, null);
    });

    // 用户
    PEOPLE.forEach((p, i) => {
      const id = uid();
      insUser.run({
        id, email: p.email, password_hash: hash, slug: p.slug, name: p.name,
        headline: p.headline, company: p.company, title: p.title,
        industry: p.industry, city: p.city,
        phone: p.phone || '', wechat: p.wechat || '', website: p.website || '',
        phone_public: p.pub?.phone ?? 0, wechat_public: p.pub?.wechat ?? 0,
        website_public: p.pub?.website ?? 0,
        ago: i * 3,
      });
      (p.sections || []).forEach((s, si) => insSection.run(uid(), id, s.kind, s.title, s.content, si));
      (p.tags || []).forEach(t => { insTag.run(t); insUserTag.run(id, getTag.get(t).id); });
      (p.circles || []).forEach(cs => insMember.run(circleId[cs], id, 'member'));
    });

    // 圈子 owner 设为第一位成员
    db.prepare(`UPDATE circles SET owner_id = (
      SELECT user_id FROM circle_members WHERE circle_id = circles.id LIMIT 1
    ) WHERE owner_id IS NULL`).run();

    // 标签使用计数
    db.prepare(`UPDATE tags SET use_count = (
      SELECT COUNT(*) FROM user_tags WHERE user_tags.tag_id = tags.id
    )`).run();
  };

  withTransaction(run);
  return { skipped: false, users: PEOPLE.length, circles: CIRCLES.length };
}

module.exports = { seed, DEMO_PASSWORD, PEOPLE, INDUSTRIES };
