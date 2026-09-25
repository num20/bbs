# ---- クライアントのビルド（静的ファイルなのでビルド環境のアーキテクチャで実行） ----
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY worker/package.json worker/
# better-sqlite3 はビルド済みバイナリを同梱しているので node-gyp（Python が必要）を走らせない
RUN npm ci --ignore-scripts
COPY client client
RUN npm run build

# ---- 実行用イメージ ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/bbs.db
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY worker/package.json worker/
RUN npm ci --omit=dev -w server --include-workspace-root=false --ignore-scripts \
 && npm cache clean --force \
 && mkdir -p /data && chown node:node /data
COPY server/src server/src
COPY server/migrations server/migrations
COPY --from=build /app/client/dist client/dist
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
