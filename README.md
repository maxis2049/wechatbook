# 圈内 · 在圈子里被看见

> 面向校友群、俱乐部、兴趣社群的**线上通讯录与个人主页平台**。

微信群解决了「即时沟通」，却没解决「成员认知」。一个 300 人的群，除了少数活跃者，大家彼此一无所知；自我介绍沉没在 999+ 的消息里再也翻不到。

**圈内的做法**：把每个成员从流水消息里打捞出来，固化成一页**可被检索、可被长期访问**的个人主页。群负责拉新，站点负责沉淀。

- **最小单元**：富文本可编辑的个人主页，注册用户即可维护。
- **公共区域**：名录广场，按 行业 / 城市 / 标签 / 圈子 多维筛选，找到那个你想找的人。
- **圈子**：每个群、每个俱乐部都是一个圈子，成员名录可单独查看。

## 功能

- **账号**：邮箱 + 密码注册登录（bcrypt 加密），可注销账号
- **个人主页**：富文本正文（加粗 / 列表 / 引用 / 链接…）、预置结构化小节（关于我 / 职业经历 / 我可以提供 / 我正在寻找）、自定义标签（最多 5 个）、可选头像（未上传按姓名首字 + 稳定色块生成占位）
- **联系方式**：手机 / 邮箱 / 微信 / 网址，**逐项开关**是否公开；别人点「联系 TA」直接复制
- **可见性**：整页三档——公开 / 仅圈子内 / 仅自己
- **名录广场**：关键词搜索 + 行业 / 城市 / 标签 / 圈子四维筛选 + 排序 + 分页，筛选条件写进 URL 可分享
- **圈子**：创建 / 加入 / 退出，自由加入或需审核
- **分享**：一键复制主页链接，丢进微信群一劳永逸；个人主页 SSR 注入 Open Graph，微信内分享有像样的预览

## 技术栈

- **后端**：Node.js + Express
- **数据库**：Node 22 内置 `node:sqlite`（零依赖、免编译、文件数据库）——无需安装任何原生模块
- **前端**：原生 HTML / CSS / JavaScript（移动优先，无框架、无构建步骤）
- **安全**：富文本 `sanitize-html` 白名单清洗（防 XSS）、密码 bcrypt、session 鉴权

> 选 `node:sqlite` 而非 `better-sqlite3`：后者需要 C++ 编译环境（Visual Studio Build Tools），后者在这台机器上装不上。Node 22.5+ 已内置 SQLite，直接用，`npm install` 零编译、开箱即用。

## 快速开始

需要 **Node.js 22.5+**（内置 `node:sqlite`；用 `node:sqlite` 的实验特性，Node 22.22 可用）。

```bash
# 1. 安装依赖（纯 JS，无编译）
npm install

# 2. 启动（首次会自动建库并写入 12 位示例成员 + 4 个圈子）
npm start
# 或开发模式（文件变更自动重启）
npm run dev
```

打开 <http://localhost:3000>。

**演示账号**（密码统一 `quannei123`）：

| 邮箱 | 角色 |
| --- | --- |
| `zhangmingyuan@demo.com` | 跨境电商 SaaS · CTO |
| `lijingyi@demo.com` | 新消费品牌 · 品牌总监 |
| `wangsiyuan@demo.com` | 科技公司 · 设计负责人 |
| `zhaojun@demo.com` | 律师事务所 · 合伙人 |
| `zhenghao@demo.com` | 私募基金 · 量化研究员 |

其他 7 位成员：`lijingyi` / `chenmo` / `zhouyutong` / `wujianping` / `sunkeer` / `linzhiyuan` / `huangxi` / `maxiaochuan`。

### 常用命令

```bash
npm start        # 启动服务
npm run dev      # 开发模式（--watch）
npm run reset-db # 清空并重建数据库、重新灌种子数据
npm test         # 跑本地全链路 API 测试（需先启动服务）
```

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `./data` | SQLite 数据库文件目录 |
| `SESSION_SECRET` | dev 值 | **生产环境务必改成随机长串** |

## 项目结构

```
quannei/
├─ src/
│  ├─ server.js        # Express 入口 + SSR（个人主页 OG 注入）+ 路由挂载
│  ├─ lib.js           # 头像色 / 富文本清洗 / slug / 摘要等工具
│  ├─ db/
│  │  ├─ index.js      # node:sqlite 连接 + schema + 事务 helper
│  │  ├─ seed.js       # 12 成员 + 4 圈子 种子数据
│  │  └─ reset.js      # 重置数据库
│  └─ routes/
│     ├─ auth.js       # 注册 / 登录 / 登出 / 注销
│     ├─ me.js         # 读写自己主页
│     ├─ profile.js    # 读公开主页（含可见性判定）
│     ├─ directory.js  # 名录：搜索 + 四维筛选 + 排序分页
│     ├─ circles.js    # 圈子 CRUD
│     └─ dictionary.js # 行业 / 城市 / 标签字典
├─ public/             # 前端（原生 JS）
│  ├─ index.html       # SPA 外壳 + SSR 占位
│  ├─ css/style.css
│  └─ js/{api.js,app.js}
├─ test.js             # 全链路 API 测试
├─ package.json
└─ .gitignore          # data/ 本地数据库不入版本库
```

## 生产部署注意

1. **改 `SESSION_SECRET`** 为强随机值。
2. 用 `DATA_DIR` 指定持久化目录，避免数据库被部署覆盖。
3. 前面套 Nginx / Caddy 上 HTTPS（联系方式、注册表单依赖安全上下文）。
4. `node:sqlite` 目前是实验特性，升级 Node 前建议回归测试；如需更稳，可换回 `better-sqlite3`（接口几乎一致，需编译环境）。

## 设计语言

暖调纸感。主色陶土橘 `#D4653C`，辅色青瓷绿 `#2E9E8F`，点缀陈金 `#C9922F`，背景米白 `#F7F5F1`。头像占位按 `slug` 哈希到 8 色暖色盘，同一用户任何设备颜色一致。

---

配套文档：《[圈内PRD.html](../圈内PRD.html)》《[圈内Demo.html](../圈内Demo.html)》（在工作区根目录）。
