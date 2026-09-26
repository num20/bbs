# bbs Helm chart

A Helm chart that deploys a classic-looking threaded BBS ([num20/bbs](https://github.com/num20/bbs)) to Kubernetes.

Since SQLite allows writes from only one process, the app runs as a single-replica StatefulSet, and [Litestream](https://litestream.io/) continuously replicates the database to S3 (or S3-compatible storage).

| Container | Kind | Role |
| --- | --- | --- |
| `restore` | initContainer | Restores the DB from S3 if the PVC has no DB and a replica exists |
| `litestream` | Sidecar (initContainer with `restartPolicy: Always`) | Watches the WAL and ships changes to S3 |
| `bbs` | Container | The application (uses `/data/bbs.db` on the PVC) |

## Prerequisites

- Kubernetes 1.29+
- Helm 3.8+ (required to install from an OCI registry)
- An S3 bucket (or S3-compatible storage such as Cloudflare R2)
  - Not required when `litestream.enabled=false`
- A StorageClass that can provision ReadWriteOnce PVCs

## Installation

The chart is published at `oci://ghcr.io/num20/charts/bbs`.

```sh
helm install bbs oci://ghcr.io/num20/charts/bbs --version 0.1.3 \
  --namespace bbs --create-namespace \
  --set litestream.s3.bucket=<bucket-name> \
  --set litestream.s3.accessKeyId=<access-key-id> \
  --set litestream.s3.secretAccessKey=<secret-access-key>

kubectl -n bbs port-forward svc/bbs 3000:80
```

Then open http://localhost:3000.

For more settings, put them in a values file and pass it with `-f`.

```sh
helm install bbs oci://ghcr.io/num20/charts/bbs --version 0.1.3 \
  --namespace bbs --create-namespace -f my-values.yaml
```

If you have cloned the repository, you can use the local chart instead of `oci://...`.

```sh
helm install bbs charts/bbs --namespace bbs --create-namespace -f my-values.yaml
```

To see the default values:

```sh
helm show values oci://ghcr.io/num20/charts/bbs --version 0.1.3
```

## Upgrading and uninstalling

```sh
helm upgrade bbs oci://ghcr.io/num20/charts/bbs --version <version> \
  --namespace bbs --reuse-values

helm uninstall bbs --namespace bbs
```

- The StatefulSet's PVC (`data-bbs-0`) is kept after `helm uninstall`. If you no longer need it, delete it with `kubectl -n bbs delete pvc data-bbs-0`.
- The Secret holding the auto-generated salt is deleted by `helm uninstall`. Reinstalling generates a new salt, which changes how IDs and trips are displayed. To keep the salt, set `bbs.salt` or `bbs.existingSecret` (see [Salt](#salt)).

## Examples

### Amazon S3 (access keys)

```yaml
litestream:
  s3:
    bucket: my-bbs-backup
    region: ap-northeast-1
    accessKeyId: AKIA...
    secretAccessKey: ...
```

### Amazon S3 (IRSA)

Leave the credentials empty and associate an IAM role with the ServiceAccount.

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

For storage that requires path-style URLs, such as MinIO, also set `forcePathStyle: true`.

### Using existing Secrets

If you don't want to put credentials in your values, create the Secrets beforehand and reference them by name.

```sh
kubectl -n bbs create secret generic bbs-salt \
  --from-literal=BBS_SALT="$(openssl rand -hex 16)"

kubectl -n bbs create secret generic bbs-s3 \
  --from-literal=LITESTREAM_ACCESS_KEY_ID=<access-key-id> \
  --from-literal=LITESTREAM_SECRET_ACCESS_KEY=<secret-access-key>
```

```yaml
bbs:
  existingSecret: bbs-salt

litestream:
  s3:
    bucket: my-bbs-backup
    existingSecret: bbs-s3
```

### Exposing via Ingress

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

### Running without Litestream

For trying things out only. If the PVC is lost, your data is lost too.

```yaml
litestream:
  enabled: false
```

## Salt

Trips and IDs are derived from `BBS_SALT`, so changing the salt changes the IDs and trips of the same users.

- If `bbs.salt` is set: that value is used.
- If `bbs.existingSecret` is set: the `BBS_SALT` key of that Secret is used (takes precedence over `bbs.salt`).
- If neither is set: a random salt is generated on the first install, and the value in the existing Secret is reused on subsequent upgrades.

Auto-generation carries the value over by reading the existing Secret with Helm's `lookup`. When manifests are rendered without access to the cluster, as with `helm template` or Argo CD, the value changes on every render, so set `bbs.salt` or `bbs.existingSecret` instead.

## Restoring from S3

When the Pod starts, if the PVC has no DB and a replica exists in S3, the `restore` container restores it automatically. To try it out, delete the PVC and the Pod.

```sh
kubectl -n bbs delete pvc --wait=false data-bbs-0
kubectl -n bbs delete pod bbs-0
```

## Values

### Image

| Key | Default | Description |
| --- | --- | --- |
| `image.repository` | `ghcr.io/num20/bbs` | Application image |
| `image.tag` | `""` | Image tag. Defaults to `appVersion` in Chart.yaml when empty |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[]` | |
| `nameOverride` | `""` | |
| `fullnameOverride` | `""` | |

### Application

| Key | Default | Description |
| --- | --- | --- |
| `bbs.title` | `なんでも掲示板＠あの頃` | Board name |
| `bbs.salt` | `""` | Salt used to generate trips and IDs. Auto-generated when empty (see [Salt](#salt)) |
| `bbs.existingSecret` | `""` | Name of an existing Secret with the key `BBS_SALT` (takes precedence over `bbs.salt`) |

### Litestream

| Key | Default | Description |
| --- | --- | --- |
| `litestream.enabled` | `true` | When disabled, the app runs on the PVC only |
| `litestream.image.repository` | `litestream/litestream` | |
| `litestream.image.tag` | `0.5.17` | |
| `litestream.image.pullPolicy` | `IfNotPresent` | |
| `litestream.s3.bucket` | `""` | Replication target bucket (required when enabled) |
| `litestream.s3.path` | `bbs.db` | Path within the bucket |
| `litestream.s3.region` | `us-east-1` | Region (`auto` for R2) |
| `litestream.s3.endpoint` | `""` | Endpoint for S3-compatible storage |
| `litestream.s3.forcePathStyle` | `false` | Use path-style URLs (MinIO, etc.) |
| `litestream.s3.accessKeyId` | `""` | Access key ID. Leave empty when using IRSA or similar |
| `litestream.s3.secretAccessKey` | `""` | Secret access key (required when `accessKeyId` is set) |
| `litestream.s3.existingSecret` | `""` | Name of an existing Secret with the keys `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` |
| `litestream.metrics.port` | `9090` | Port for Litestream metrics (Prometheus format) |
| `litestream.resources` | requests: `cpu: 10m`, `memory: 32Mi` / limits: `memory: 128Mi` | Sidecar resources |

### Storage

| Key | Default | Description |
| --- | --- | --- |
| `persistence.size` | `1Gi` | PVC size |
| `persistence.storageClass` | `""` | Uses the cluster's default StorageClass when empty |

### ServiceAccount, Service, and Ingress

| Key | Default | Description |
| --- | --- | --- |
| `serviceAccount.create` | `true` | Create a ServiceAccount |
| `serviceAccount.annotations` | `{}` | Annotations, e.g. for IRSA |
| `serviceAccount.name` | `""` | Defaults to the fullname when empty |
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | |
| `ingress.enabled` | `false` | |
| `ingress.className` | `""` | |
| `ingress.annotations` | `{}` | |
| `ingress.hosts` | `/` on `bbs.example.com` | Hosts and paths |
| `ingress.tls` | `[]` | |

### Pod

| Key | Default | Description |
| --- | --- | --- |
| `resources` | requests: `cpu: 50m`, `memory: 64Mi` / limits: `memory: 256Mi` | Application resources |
| `podSecurityContext` | `runAsUser: 1000`, `runAsGroup: 1000`, `fsGroup: 1000` | Matches the `node` user of the node image |
| `securityContext` | `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]` | Applied to the application and Litestream containers |
| `podAnnotations` | `{}` | |
| `nodeSelector` | `{}` | |
| `tolerations` | `[]` | |
| `affinity` | `{}` | |
