# ---- クライアントのビルド ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
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
RUN npm ci --omit=dev -w server --include-workspace-root=false \
 && npm cache clean --force \
 && mkdir -p /data && chown node:node /data
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
