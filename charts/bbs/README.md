# bbs Helm チャート

昔ながらの見た目のスレッド式 BBS（[num20/bbs](https://github.com/num20/bbs)）を Kubernetes にデプロイする Helm チャートです。

SQLite は 1 プロセスからしか書き込めないため、StatefulSet の 1 レプリカで動かし、[Litestream](https://litestream.io/) で DB を S3（または S3 互換ストレージ）へ常時レプリケートします。

| コンテナ | 種類 | 役割 |
| --- | --- | --- |
| `restore` | initContainer | PVC に DB がなく S3 にレプリカがあれば復元 |
| `litestream` | サイドカー（`restartPolicy: Always` の initContainer） | WAL を監視して S3 へ送信 |
| `bbs` | コンテナ | アプリ本体（PVC の `/data/bbs.db` を使用） |

## 必要なもの

- Kubernetes 1.29 以降
- Helm 3.8 以降（OCI レジストリからのインストールに必要）
- S3 のバケット（または Cloudflare R2 などの S3 互換ストレージ）
  - `litestream.enabled=false` にする場合は不要です
- ReadWriteOnce の PVC を作れる StorageClass

## インストール

チャートは `oci://ghcr.io/num20/charts/bbs` に公開しています。

```sh
helm install bbs oci://ghcr.io/num20/charts/bbs --version 0.1.1 \
  --namespace bbs --create-namespace \
  --set litestream.s3.bucket=<バケット名> \
  --set litestream.s3.accessKeyId=<アクセスキー> \
  --set litestream.s3.secretAccessKey=<シークレットキー>

kubectl -n bbs port-forward svc/bbs 3000:80
```

http://localhost:3000 で開けます。

設定が多い場合は values ファイルにまとめて `-f` で渡します。

```sh
helm install bbs oci://ghcr.io/num20/charts/bbs --version 0.1.1 \
  --namespace bbs --create-namespace -f my-values.yaml
```

リポジトリを clone している場合は、`oci://...` の代わりにローカルのチャートを指定できます。

```sh
helm install bbs charts/bbs --namespace bbs --create-namespace -f my-values.yaml
```

既定値の確認:

```sh
helm show values oci://ghcr.io/num20/charts/bbs --version 0.1.1
```

## アップグレード・アンインストール

```sh
helm upgrade bbs oci://ghcr.io/num20/charts/bbs --version <バージョン> \
  --namespace bbs --reuse-values

helm uninstall bbs --namespace bbs
```

- `helm uninstall` しても StatefulSet の PVC（`data-bbs-0`）は残ります。不要なら `kubectl -n bbs delete pvc data-bbs-0` で削除してください。
- 自動生成したソルトを持つ Secret は `helm uninstall` で削除されます。再インストールするとソルトが変わり、ID とトリップの表示も変わります。ソルトを保ちたい場合は `bbs.salt` か `bbs.existingSecret` を指定してください（[ソルト](#ソルト)を参照）。

## 設定例

### Amazon S3（アクセスキー）

```yaml
litestream:
  s3:
    bucket: my-bbs-backup
    region: ap-northeast-1
    accessKeyId: AKIA...
    secretAccessKey: ...
```

### Amazon S3（IRSA）

認証情報を空のままにし、ServiceAccount に IAM ロールを紐付けます。

```yaml
litestream:
  s3:
    bucket: my-bbs-backup
    region: ap-northeast-1

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/bbs-litestream
```

### Cloudflare R2

```yaml
litestream:
  s3:
    bucket: bbs
    region: auto
    endpoint: https://<account-id>.r2.cloudflarestorage.com
    accessKeyId: ...
    secretAccessKey: ...
```

MinIO など、パス形式の URL が必要なストレージでは `forcePathStyle: true` も指定します。

### 既存の Secret を使う

認証情報を values に書きたくない場合は、先に Secret を作って名前を指定します。

```sh
kubectl -n bbs create secret generic bbs-salt \
  --from-literal=BBS_SALT="$(openssl rand -hex 16)"

kubectl -n bbs create secret generic bbs-s3 \
  --from-literal=LITESTREAM_ACCESS_KEY_ID=<アクセスキー> \
  --from-literal=LITESTREAM_SECRET_ACCESS_KEY=<シークレットキー>
```

```yaml
bbs:
  existingSecret: bbs-salt

litestream:
  s3:
    bucket: my-bbs-backup
    existingSecret: bbs-s3
```

### Ingress で公開する

```yaml
bbs:
  title: なんでも掲示板＠あの頃

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  hosts:
    - host: bbs.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: bbs-tls
      hosts:
        - bbs.example.com
```

### Litestream を使わない

お試し用です。PVC を失うとデータも失われます。

```yaml
litestream:
  enabled: false
```

## ソルト

トリップと ID は `BBS_SALT` から生成するため、ソルトが変わると同じ人の ID やトリップも変わります。

- `bbs.salt` を指定した場合: その値を使います。
- `bbs.existingSecret` を指定した場合: その Secret のキー `BBS_SALT` を使います（`bbs.salt` より優先）。
- どちらも指定しない場合: 初回インストール時にランダムに生成し、以降のアップグレードでは既存の Secret の値を使い続けます。

自動生成は Helm の `lookup` で既存の Secret を読んで値を引き継いでいます。`helm template` や Argo CD のようにクラスターを参照せずにマニフェストを作る場合は、描画のたびに値が変わってしまうため、`bbs.salt` か `bbs.existingSecret` を指定してください。

## S3 からの復元

Pod の起動時、PVC に DB がなく S3 にレプリカがあれば、`restore` が自動で復元します。動作を確かめるには、PVC と Pod を削除します。

```sh
kubectl -n bbs delete pvc --wait=false data-bbs-0
kubectl -n bbs delete pod bbs-0
```

## Values

### イメージ

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `image.repository` | `ghcr.io/num20/bbs` | アプリのイメージ |
| `image.tag` | `""` | イメージのタグ。空なら Chart.yaml の `appVersion` |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[]` | |
| `nameOverride` | `""` | |
| `fullnameOverride` | `""` | |

### アプリ

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `bbs.title` | `なんでも掲示板＠あの頃` | 掲示板名 |
| `bbs.salt` | `""` | トリップと ID の生成に使うソルト。空なら自動生成（[ソルト](#ソルト)を参照） |
| `bbs.existingSecret` | `""` | キー `BBS_SALT` を持つ既存の Secret の名前（`bbs.salt` より優先） |

### Litestream

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `litestream.enabled` | `true` | 無効にすると PVC だけで動かす |
| `litestream.image.repository` | `litestream/litestream` | |
| `litestream.image.tag` | `0.5.17` | |
| `litestream.image.pullPolicy` | `IfNotPresent` | |
| `litestream.s3.bucket` | `""` | レプリケーション先のバケット（有効時は必須） |
| `litestream.s3.path` | `bbs.db` | バケット内のパス |
| `litestream.s3.region` | `us-east-1` | リージョン（R2 は `auto`） |
| `litestream.s3.endpoint` | `""` | S3 互換ストレージのエンドポイント |
| `litestream.s3.forcePathStyle` | `false` | パス形式の URL を使う（MinIO など） |
| `litestream.s3.accessKeyId` | `""` | アクセスキー。IRSA などを使う場合は空 |
| `litestream.s3.secretAccessKey` | `""` | シークレットキー（`accessKeyId` を指定したら必須） |
| `litestream.s3.existingSecret` | `""` | キー `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` を持つ既存の Secret の名前 |
| `litestream.metrics.port` | `9090` | Litestream のメトリクス（Prometheus 形式）のポート |
| `litestream.resources` | requests: `cpu: 10m`, `memory: 32Mi` / limits: `memory: 128Mi` | サイドカーのリソース |

### ストレージ

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `persistence.size` | `1Gi` | PVC のサイズ |
| `persistence.storageClass` | `""` | 空ならクラスターの既定の StorageClass |

### ServiceAccount・Service・Ingress

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `serviceAccount.create` | `true` | ServiceAccount を作る |
| `serviceAccount.annotations` | `{}` | IRSA などで使う注釈 |
| `serviceAccount.name` | `""` | 空なら fullname |
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | |
| `ingress.enabled` | `false` | |
| `ingress.className` | `""` | |
| `ingress.annotations` | `{}` | |
| `ingress.hosts` | `bbs.example.com` の `/` | ホストとパス |
| `ingress.tls` | `[]` | |

### Pod

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `resources` | requests: `cpu: 50m`, `memory: 64Mi` / limits: `memory: 256Mi` | アプリのリソース |
| `podSecurityContext` | `runAsUser: 1000`, `runAsGroup: 1000`, `fsGroup: 1000` | node イメージの node ユーザーに合わせる |
| `securityContext` | `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]` | アプリと Litestream のコンテナに適用 |
| `podAnnotations` | `{}` | |
| `nodeSelector` | `{}` | |
| `tolerations` | `[]` | |
| `affinity` | `{}` | |
