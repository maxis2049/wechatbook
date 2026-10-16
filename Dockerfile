# 圈内 · 线上部署镜像
# Node 22 官方镜像（内置 node:sqlite，无需编译任何原生依赖，构建快）
FROM node:22-slim

WORKDIR /app

# 先装依赖，最大化利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 拷贝源码与静态资源
COPY src ./src
COPY public ./public
COPY test.js ./

# 数据目录（Render 持久盘挂载点，SQLite 落在这里）
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000

# SQLite 需要可写目录
RUN mkdir -p /data

# --experimental-sqlite：兼容 Node 22 各小版本
#   - 该模块默认启用的版本里，此 flag 是 no-op；
#   - 仍需 flag 的版本里，它正好激活 node:sqlite。
#   两条路都通，容器一定能起来。
CMD ["node", "--experimental-sqlite", "src/server.js"]
