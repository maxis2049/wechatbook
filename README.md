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

## 生产部署

### ⚠️ 为什么不能用 Vercel（Serverless）

本项目是**常驻型 Web 服务 + 磁盘文件数据库（`node:sqlite` → `data/quannei.db`）**，两者都要求进程一直存活、文件系统可写。Vercel 是 serverless：

- 函数文件系统只读/临时，无法写入 SQLite 文件；
- `node:sqlite` 实验内置模块在 Vercel 运行时不保证可加载；
- 无常驻进程，`express-session` 的内存会话会在每次冷启动后丢失。

因此部署到 Vercel 会报 `500 FUNCTION_INVOCATION_FAILED`（运行时崩溃）。**请用持久型平台**：Render、Railway、Fly.io，或任意有 Node 22 的 VPS。

### 方案 A：Render（推荐，有免费档）

仓库已含 `Dockerfile` + `render.yaml`，最省事：

1. 登录 <https://dashboard.render.com>，进该仓库的项目。
2. 新建 **Web Service** → 选本仓库 `wechatbook`。
3. Runtime 选 **Docker**（用仓库里的 `Dockerfile`），或 Build `npm install`、Start `npm start`。
4. 设环境变量：
   - `SESSION_SECRET` = 一串随机长字符串（必改）
   - `PORT` 保持 3000（Render 会自动注入实际端口，代码已读 `process.env.PORT`）
5. 建一块 **Persistent Disk**（1GB 起），挂载到 `/data`，并设 `DATA_DIR=/data`。这样数据库不会随重启清空。
   - 不挂盘也能跑（重启会重新灌种子数据，适合纯演示）。
6. 部署完成后访问 Render 给的 `https://xxx.onrender.com`。

> 用 `render.yaml` 的话，本地执行 `render run wechatbook`（已装 Render CLI 并 `render login`）即可按蓝图一键建服务。

### 方案 B：Railway / Fly.io / VPS

任意支持 Node 22 的持久环境：

```bash
npm install
DATA_DIR=/var/lib/quannei SESSION_SECRET="<你的随机串>" npm start
```

- 务必配可写、持久化的 `DATA_DIR`（放 SQLite 文件）。
- 用 `SESSION_SECRET` 强随机值。
- 前面套 HTTPS（联系方式、注册依赖安全上下文）。

### 通用注意事项

1. **改 `SESSION_SECRET`** 为强随机值。
2. 用 `DATA_DIR` 指向持久化目录，避免数据库被部署/重启覆盖。
3. 上 HTTPS。

## 数据持久化与备份恢复（重要）

### 为什么重新部署会丢数据

`DATA_DIR`（默认 `./data`，线上是 `/data`）里存着 `quannei.db`。
服务启动时 `seed()` 会检查：`users` 表为空才灌入 12 条演示数据。

- **挂了持久盘** → `quannei.db` 保留在盘上 → 重启/重部署后数据都在，`seed` 发现表非空自动跳过。
- **没挂持久盘**（Render 默认行为）→ 每次重新部署/重启，容器临时盘被清空 → 数据库变全新 → `seed` 重新灌 12 条 → **你注册的真实账号全部丢失**。

> 这是「丢数据」的唯一原因。挂上持久盘即可根治。

### 怎么用 Render 面板挂持久盘

服务页 → **Advanced** → **Disks** → **Attach a Disk**（没有就先 Create，1GB、区域与服务一致）。
把 `mountPath` 设为 **`/data`**，保存后 Render 自动重新部署。

### 数据健康检查：`GET /api/stats`

```
curl https://你的域名/api/stats
```
返回：
```json
{
  "dbFileExists": true, "dbFileSizeKB": 116,
  "totalUsers": 12, "realUsers": 0, "demoUsers": 12,
  "seededFreshly": true,
  "hint": "当前只有演示数据，真实注册账号可能已随重启丢失（未挂持久盘）。"
}
```
- `realUsers` = 非 `@demo.com` 的真实用户数。**0 且 `seededFreshly=true` 就是数据丢了。**
- 这个端点是公开的（只读、不含任何密码/联系方式），用于快速诊断。

### 备份 / 恢复安全网（`/api/backup`）

在 Render 设环境变量 `ADMIN_KEY`（任意随机串，`render.yaml` 里已配 `generateValue`），即可随时导出、一键恢复。

**部署前导出（存一份真实用户）：**
```bash
curl "https://你的域名/api/backup?adminKey=你的ADMIN_KEY" -o backup.json
```

**部署/重启后导入恢复：**
```bash
curl -X POST "https://你的域名/api/backup" \
  -H 'Content-Type: application/json' \
  -d @<(jq -n --argjson d "$(cat backup.json)" '{adminKey:"你的ADMIN_KEY", data:$d}')
```
恢复按 `email` 幂等 upsert，会带回用户主页小节、标签、圈子成员关系。

> 建议流程：**每次重新部署前**先 `GET /api/backup` 存一份 `backup.json`，部署完再 `POST` 恢复一次。挂持久盘后这一步可省。

### 恢复已丢失的数据

如果没备份、数据已经丢了，只能**重新注册**——但 `seed` 每次都给演示账号固定 slug（`zhangmingyuan` 等），不会和你的真实账号冲突，重新填即可。挂好持久盘后新数据就不会再丢了。


4. `node:sqlite` 目前是实验特性，升级 Node 大版本前建议回归测试；追求更稳可换回 `better-sqlite3`（接口几乎一致，需编译环境）。

## 设计语言

暖调纸感。主色陶土橘 `#D4653C`，辅色青瓷绿 `#2E9E8F`，点缀陈金 `#C9922F`，背景米白 `#F7F5F1`。头像占位按 `slug` 哈希到 8 色暖色盘，同一用户任何设备颜色一致。

---

配套文档：《[圈内PRD.html](../圈内PRD.html)》《[圈内Demo.html](../圈内Demo.html)》（在工作区根目录）。
