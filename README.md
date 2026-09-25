# なんでも掲示板＠あの頃

昔ながらの見た目のスレッド式 BBS（電子掲示板）です。

- フロントエンド: React + Vite
- バックエンド: Node.js + fastify
- データベース: SQLite3（better-sqlite3）

## 機能

- スレッドの作成・一覧表示（最終書き込み順）
- レスの投稿（1 スレッド 1000 レスまで）
- 日替わりの ID 表示（IP アドレスと日付から生成）
- トリップ: 名前欄に `名前#キー` と入力すると `名前 ◆xxxxxxxxxx` と表示
- sage: E-mail 欄に `sage` と入力するとスレッドを上げずに書き込み
- `>>1` 形式のアンカーと URL の自動リンク
- 削除キーによるレスの削除（「あぼーん」表示、キーは scrypt でハッシュ化して保存）
- アクセスカウンター（同一ブラウザセッションでは 1 回のみ加算）
- 掲示板名の設定変更
- ライト / ダークモードの切り替え（右上の「表示：自動｜ライト｜ダーク」、選択はブラウザに保存）

## 必要なもの

- Node.js 24 以上（ローカルで起動する場合）
- Docker / Docker Compose（Docker で起動する場合）

## ローカルで起動

```sh
npm install

# 開発モード（http://localhost:5173、/api は :3000 にプロキシ）
npm run dev

# 本番モード（http://localhost:3000）
npm run build
npm start
```

`client/dist` が存在する場合、サーバーはビルド済みのクライアントも配信します。

## Docker で起動

```sh
cp .env.example .env   # 必要に応じて値を編集
docker compose up -d --build
```

http://localhost:3000 で開けます。データは名前付きボリューム `bbs-data`（コンテナ内の `/data/bbs.db`）に保存されるため、コンテナを作り直しても消えません。

## Kubernetes で起動

`charts/bbs/` に Helm チャート、`deploy/` に Kustomize のマニフェストがあります。SQLite は 1 プロセスからしか書き込めないため、StatefulSet の 1 レプリカで動かし、[Litestream](https://litestream.io/) で DB を S3（または S3 互換ストレージ）へ常時レプリケートします。

- `restore`（initContainer）: PVC に DB がなく S3 にレプリカがあれば復元
- `litestream`（サイドカー）: WAL を監視して S3 へ送信
- `bbs`: アプリ本体（PVC の `/data/bbs.db` を使用）

Kubernetes 1.29 以降（サイドカー用の `restartPolicy: Always` を使用）と、S3 のバケットが必要です。

### Helm

```sh
helm install bbs oci://ghcr.io/num20/charts/bbs --version 0.1.0 \
  --namespace bbs --create-namespace \
  --set litestream.s3.bucket=<バケット名> \
  --set litestream.s3.accessKeyId=<アクセスキー> \
  --set litestream.s3.secretAccessKey=<シークレットキー>

kubectl -n bbs port-forward svc/bbs 3000:80
```

設定できる値は `charts/bbs/values.yaml` を参照してください。`bbs.salt` を指定しない場合は初回インストール時にランダムに生成され、以降のアップグレードでも同じ値が使われます。ローカルのチャートを使う場合は `oci://...` の代わりに `charts/bbs` を指定します。

### Kustomize

```sh
cp deploy/secret.env.example deploy/secret.env   # ソルトと S3 の認証情報を記入
# deploy/config.env のバケット名などを編集

kubectl apply -k deploy
kubectl -n bbs port-forward svc/bbs 3000:80
```

PVC を削除してもデータが戻ることを確認するには:

```sh
kubectl -n bbs delete pvc --wait=false data-bbs-0
kubectl -n bbs delete pod bbs-0
```

## イメージとチャートの公開

GitHub Actions の「Actions」タブから手動で実行します。

| ワークフロー | 公開先 | 内容 |
|---|---|---|
| `publish-image` | `ghcr.io/num20/bbs` | 入力したバージョン（例: `0.1.0`）でイメージをビルド（linux/amd64, linux/arm64）。タグは `0.1.0` / `0.1` / `latest`（任意）/ `sha-xxxxxxx`。バージョンに `edge` を指定すると `edge` / `sha-xxxxxxx` のみ |
| `publish-chart` | `oci://ghcr.io/num20/charts/bbs` | `charts/bbs/Chart.yaml` の `version` でチャートを公開 |

チャートを公開する前に、`Chart.yaml` の `appVersion` と同じバージョンのイメージを `publish-image` で公開しておいてください（`publish-chart` はイメージがない場合と、同じバージョンのチャートが公開済みの場合に失敗します）。

初めて公開したパッケージは非公開になります。認証なしで取得できるようにするには、GitHub のパッケージの設定（Package settings → Change visibility）で公開に変更してください。

## 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `BBS_TITLE` | `なんでも掲示板＠あの頃` | 掲示板名（見出しとブラウザのタブに表示） |
| `BBS_SALT` | `change-me-bbs-salt` | トリップと ID の生成に使うソルト。**公開する場合は必ず変更してください** |
| `PORT` | `3000` | サーバーのポート |
| `DB_PATH` | `server/bbs.db`（Docker では `/data/bbs.db`） | SQLite データベースファイルのパス |

ルートに `.env` を置くと、ローカル起動（`npm run dev` / `npm start`）と `docker compose` の両方で読み込まれます。設定例は `.env.example` を参照してください。

```sh
cp .env.example .env
```

コマンドラインで直接指定することもできます（`.env` より優先されます）。

```sh
BBS_TITLE='おスコーン愛好会' npm start
```

`DB_PATH` はローカル起動時のみ有効です。相対パスは `server/` からの相対になります。Docker では `/data/bbs.db` 固定です。

## API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/config` | 掲示板の設定（`{ title }`） |
| `GET` | `/api/threads` | スレッド一覧 |
| `POST` | `/api/threads` | スレッド作成（`title`, `body`, `name`?, `email`?, `password`?） |
| `GET` | `/api/threads/:id` | スレッドとレス一覧 |
| `POST` | `/api/threads/:id/posts` | レス投稿（`body`, `name`?, `email`?, `password`?） |
| `POST` | `/api/posts/:id/delete` | レス削除（`password`） |
| `POST` | `/api/counter` | アクセスカウンターを加算して値を返す |

## ディレクトリ構成

```
.
├── package.json        # npm workspaces（server / client）
├── Dockerfile
├── compose.yaml
├── .env.example
├── .github/workflows/  # イメージとチャートの公開（手動実行）
├── charts/bbs/         # Helm チャート
├── deploy/             # Kustomize のマニフェスト
├── server/
│   └── src/
│       ├── index.js    # fastify サーバーと API
│       ├── db.js       # SQLite 接続とスキーマ
│       └── util.js     # トリップ・ID・削除キーの処理
└── client/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx         # ルーティング・カウンター・フッター
        ├── ThreadList.jsx  # トップページ（スレッド一覧・スレ立て）
        ├── Thread.jsx      # スレッド表示
        ├── PostForm.jsx    # 投稿フォーム
        ├── api.js
        ├── format.js
        └── style.css
```
