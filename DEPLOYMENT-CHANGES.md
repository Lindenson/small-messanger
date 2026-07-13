# Deployment-environment changes — messenger test harness (staging `hormi.isolutions.io`)

Handoff for the hormiga-deploy agent. Every item below is a **live change on the server**
(`den@91.99.6.25`, `/opt/hormigas_run/hormiga-deploy`) that is **NOT yet reflected in the
hormiga-deploy repo**. Bring the repo/compose into conformance so a clean `deploy.sh` reproduces it.

Legend: 🆕 = added this session (attachments) · ♻️ = added earlier in the harness work · ⚠️ = risk/stopgap.

---

## Reproducible deploy — OWNED BY THIS REPO (read first)

small-messanger's full footprint on the shared Hormiga prod host (`91.99.6.25`,
`hormi.isolutions.io`) is now captured as reproducible artifacts **in this repo**,
under `deploy/`. This is the source of truth — these deltas are **NOT** to be pulled
into hormiga-deploy.

| Footprint item | Reproducible artifact (this repo) | Was it already declared? |
|---|---|---|
| `hormiga-coturn` (TURN/STUN for WebRTC) | `deploy/hormiga-coturn.compose.yml` | ⚠️ Partially — the repo-root `docker-compose.yaml` had a **demo** coturn (`realm=example.com`, bridge net, `user:pass`, no `--external-ip`). Prod differs (host net, `realm=hormi.isolutions.io`, `--external-ip=91.99.6.25`, `--no-tls --no-dtls`). Now reproduced exactly. |
| Edge nginx routes `/messenger-ui/` (+ WebRTC Permissions-Policy) and `/messenger-attachments` | `deploy/nginx/messenger-edge.conf` | ❌ Live-only drift — absent from both the repo-root `nginx/default.conf` (that's the standalone-demo vhost) and from hormiga-deploy's `04-edge`. Now captured. |
| front4mess :5555 static SPA server | `deploy/front4mess.service` + existing `front/server.mjs` + `deploy.sh` | 🟡 The Node server (`front/server.mjs`) and the SPA dist-swap (`deploy.sh`) were present; the **systemd unit** was live-only. Now captured. |
| Infra installer (coturn + nginx + unit) | `deploy/deploy-infra.sh` | ❌ New — one-shot provisioner. Routine UI redeploy stays `deploy.sh`. |
| Required secrets/config | `deploy/.env.example` | ❌ New. |

**Secrets rule:** no real key/secret is committed. `deploy/.env` (gitignored) or
env vars supply `TURN_USER`/`TURN_PASSWORD` (and `MESSENGER_ADMIN_KEY`, see below).

### ⚠️ Admin-key correction (supersedes §3 below)

The messenger admin key and the IDS admin key are **two different keys** — an
earlier assumption in §3 that `hormiga.admin.key == IDS_ADMIN_KEY` is **stale**:

- **Messenger key** (`hormiga.admin.key`, currently `81b2…`) — guards OUR messenger's
  admin/service HTTP endpoints, e.g. `POST /api/chats` chat provisioning. Supply it as
  **`MESSENGER_ADMIN_KEY`**. This is the key small-messanger currently has **stale**.
- **IDS key** (`IDS_ADMIN_KEY`, currently `be6fa…`) — guards kratosgate `/ids/admin/**`
  (user directory lookups). This one is **current/valid**; leave it alone.

**Root cause (fixed in this PR):** the SPA used ONE build-time constant
`VITE_IDS_ADMIN_KEY` as `X-Admin-Key` for **both** `/ids/admin/users` (needs the IDS key)
**and** `POST /api/chats` (needs the messenger key). Once the two keys diverged, chat
provisioning 403'd (`"Se requiere X-Admin-Key válido para crear chats"`). This PR splits
the constants in `front/src/shared/config/api.ts`:

- `IDS_ADMIN_KEY`  ← `VITE_IDS_ADMIN_KEY`  (= IDS key `be6fa…`) — used by `idsApi`.
- `MESSENGER_ADMIN_KEY` ← `VITE_MESSENGER_ADMIN_KEY` (= messenger key `81b2…`, falls back
  to `VITE_IDS_ADMIN_KEY` for single-key setups) — used by `chatApi.createChat`.

⚠️ **Build-time deploy requirement:** set BOTH vars before `npm run build` (they bake into
the bundle). With distinct keys, `VITE_MESSENGER_ADMIN_KEY` MUST be the messenger key `81b2…`
or UI chat creation stays 403. Values are NOT committed — see `front/.env.example`.

⚠️ **Security:** admin keys shipped in a browser bundle are exposed to every visitor. This
is a demo-only crutch; the real fix is a server-side proxy (or short-lived scoped token)
holding the key so it never reaches the browser.

> NOTE: `/api` and `/_next/static` routes observed on the host belong to a **separate**
> app (Dental Zone, Next.js on `127.0.0.1:8181`, vhost `hormi-day.isolutions.io`) — they
> are **not** small-messanger's and are intentionally excluded from `deploy/nginx/`.

---

## 0. Big picture (read first)

- **The `hormiga-messenger-app` container is an ORPHAN** ⚠️ — it is **not defined in any compose file**
  in the repo. It runs on network **`ci_hormi_hormiga_default`** (a *different* compose project, likely CI),
  with aliases `messenger`, image `eclipse-temurin:25`, cmd `java -jar quarkus-run.jar`, workdir
  `/messenger/quarkus-app`, mount `03-services/messenger → /messenger`. It was (re)created ad-hoc via
  `docker run`. **Canonical target:** define it as a real service in `03-services/docker-compose.yml`
  (same network as ids/master/order/client so Oathkeeper resolves `messenger`), env from the compose,
  no ad-hoc `docker run`.
- **Container ENV overrides the mounted config file** — Quarkus env vars (ordinal 300) beat
  `config/application.properties` (ordinal 260). So the stopgap config file is only a fallback; the real
  values must live in compose env.
- **`deploy.sh` wipes `quarkus-app/`** ⚠️ — it replaces the built artifact, so the stopgap
  `config/application.properties` (admin key, minio endpoint, DEBUG) is lost on each deploy. Move those
  values into compose env / repo before relying on deploy.sh.

---

## 1. nginx — edge (`/etc/nginx/conf.d/hormi.isolutions.io.conf`)

Host nginx (443, certbot) in front of Oathkeeper. My backups: `*.bak-minio-*`, `*.bak-slash-*` (this
session), `*.bak-front4mess`, `*.bak-permpolicy`, `*.bak-authui` (earlier).

### 1a. 🆕 `location /messenger-attachments` — MinIO presigned proxy
```nginx
    location /messenger-attachments {          # NOTE: NO trailing slash — bucket-root ops
        proxy_pass http://127.0.0.1:9000;      # (?location=, make-bucket) sign the path WITHOUT
        proxy_set_header Host $host;           # a slash and must match, else they fall to
        proxy_set_header X-Real-IP $remote_addr;  # Oathkeeper → SigV4 SignatureDoesNotMatch.
        proxy_request_buffering off;
        proxy_buffering off;
        client_max_body_size 0;
        proxy_read_timeout 300s;
    }
```
- **Why:** browser + backend reach MinIO over HTTPS same-origin. `Host` MUST be preserved (SigV4 signs
  host=`hormi.isolutions.io`). Bucket = `messenger-attachments`; presign signs only `host`, so Content-Type
  is unsigned (frontend sends it freely). Place **before** `location /`.
- **Canonical:** either keep this edge route, or (better) implement backend `MINIO_PUBLIC_URL` split-horizon
  (see §3) and route a dedicated MinIO hostname.

### 1b. ♻️ `location /messenger-ui/` — SPA + WebRTC Permissions-Policy override
```nginx
    location /messenger-ui/ {
        include /etc/nginx/snippets/strip-identity-headers.conf;
        proxy_pass http://127.0.0.1:5555/;     # front4mess SPA server
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        # WebRTC needs camera/mic; override the domain-wide Permissions-Policy that disables them.
        # A location add_header disables inheritance, so all security headers are re-declared:
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Cross-Origin-Resource-Policy same-origin always;
        add_header Content-Security-Policy "frame-ancestors 'self'" always;
        add_header Permissions-Policy "geolocation=(), camera=(self), microphone=(self)" always;
    }
```
- **Why:** the UI is mounted at subpath `/messenger-ui/` (root `/` is master-app). WebRTC getUserMedia is
  blocked by the domain-wide `Permissions-Policy: camera=(),microphone=()` unless overridden here.

> NOTE: the WS path `/messenger/ws` and REST `/messenger/api` go through the existing `location /` →
> Oathkeeper (not changed by me).

---

## 2. `hormiga-messenger-app` container (orphan) — env & recreate

Current live run-spec (what a compose service must reproduce):

| field | value |
|---|---|
| image | `eclipse-temurin:25` |
| entrypoint / cmd | `/__cacert_entrypoint.sh` / `java -jar quarkus-run.jar` |
| workdir | `/messenger/quarkus-app` |
| network | `ci_hormi_hormiga_default` (aliases: `messenger`) |
| restart | `unless-stopped` |
| mount | `/opt/hormigas_run/hormiga-deploy/03-services/messenger → /messenger` |
| **extra_hosts** 🆕 | `hormi.isolutions.io:172.19.0.1` |

ENV (relevant):
```
MINIO_ENDPOINT=https://hormi.isolutions.io     # 🆕 was http://minio:9000
MINIO_ACCESS_KEY=hormiga
MINIO_SECRET_KEY=hormiga123
MINIO_BUCKET=messenger-attachments
DB_NAME=hormiga_messenger  DB_USER=hormiga  DB_PASSWORD=hormiga
```
- 🆕 **`MINIO_ENDPOINT` changed** `http://minio:9000` → `https://hormi.isolutions.io` so presigned URLs are
  browser-reachable HTTPS.
- 🆕 **`extra_hosts: hormi.isolutions.io:172.19.0.1`** (docker gateway where host nginx listens) so the
  messenger's OWN S3 calls (ensureBucket/getBucketLocation/statObject) hit nginx directly, **bypassing
  Cloudflare** (avoids the 100MB free-tier body cap + WAF on internal calls).
- ⚠️ Changing env required **recreating** the container (env is immutable); done via `docker run` clone.
  In compose this is just `environment:` + `extra_hosts:` + `docker compose up -d messenger`.
- **Canonical (compose):**
  ```yaml
  extra_hosts:
    - "hormi.isolutions.io:172.19.0.1"   # or the deploy network's gateway
  environment:
    MINIO_ENDPOINT: https://hormi.isolutions.io
    # ...db/minio creds...
  ```

---

## 3. messenger config file (stopgap) ⚠️

`/opt/hormigas_run/hormiga-deploy/03-services/messenger/quarkus-app/config/application.properties`:
```properties
hormiga.admin.key=<REDACTED — value of IDS_ADMIN_KEY in hormiga-deploy/.env>   # ♻️ == IDS_ADMIN_KEY in .env
quarkus.log.category."org.hormigas".level=DEBUG                       # ♻️ ⚠️ TURN OFF for prod
minio.endpoint=https://hormi.isolutions.io                           # 🆕 (belt-and-suspenders; env wins)
```
- ⚠️ **Wiped by deploy.sh.** Move to compose env:
  - `HORMIGA_ADMIN_KEY: ${IDS_ADMIN_KEY}` (backend `hormiga.admin.key`; used for admin chat provisioning).
  - drop/lower the DEBUG log level.
  - `MINIO_ENDPOINT` already covered in §2.
- **Backend gap (for the messenger review agent, not deploy):** the MinIO client uses a **single**
  `MINIO_ENDPOINT` for both internal calls and presigned-URL host; the code comment references a
  `MINIO_PUBLIC_URL` **split-horizon that is not implemented**. Implementing it removes the need for the
  edge workaround + extra_hosts (internal → `minio:9000`, presign → public HTTPS).

---

## 4. front4mess — SPA static server (♻️)

- systemd unit `/etc/systemd/system/front4mess.service`:
  ```ini
  [Service]
  Type=simple
  Environment=PORT=5555
  Environment=HOST=127.0.0.1          # bound to loopback (edge-only)
  WorkingDirectory=/opt/front4mess
  ExecStart=/usr/bin/node /opt/front4mess/server.mjs
  Restart=on-failure
  User=den
  ```
- artifact: `/opt/front4mess/{dist/,server.mjs}` (zero-dep Node SPA server). node installed via apt (v20).
- Redeploy: `cd front && npx vite build --base=/messenger-ui/ --sourcemap` →
  `rsync -az dist/ den@91.99.6.25:/opt/front4mess/dist/` (server reads disk per request; no restart).
- **Canonical:** decide if the test UI belongs in hormiga-deploy at all (it's a harness). If yes, template
  the unit + artifact path; if no, document it as out-of-band.

---

## 5. coturn — TURN server (♻️)

`hormiga-coturn` container, `--network host`, restart unless-stopped:
```
-n --realm=hormi.isolutions.io --lt-cred-mech --fingerprint --user=user:pass
--listening-port=3478 --min-port=49160 --max-port=49200 --no-tls --no-dtls --external-ip=91.99.6.25
```
- ⚠️ Creds `user:pass` are demo-grade; rotate for real use. Frontend `webrtc.ts` points at
  `VITE_TURN_HOST=91.99.6.25` (host IP, NOT the CF hostname — CF only proxies HTTP).
- **Cloud firewall must keep open:** `3478/udp`, `3478/tcp`, `49160-49200/udp`.
- **Canonical:** add as a compose service (host network) in hormiga-deploy with creds from `.env`.

---

## 6. MinIO (context, mostly unchanged)

- `hormiga-minio` published on `0.0.0.0:9000` (API) + `127.0.0.1:9001` (console). No `MINIO_SERVER_URL`/
  `MINIO_DOMAIN`/region set (region defaults us-east-1).
- Bucket **`messenger-attachments`** auto-created by the messenger on first presign.
- ⚠️ **Cloudflare 100MB** free-tier request-body cap applies to **browser** uploads (they traverse CF).
  Raise the CF limit or bypass CF for `/messenger-attachments` if large files are needed.

---

## 7. Depends-on (already done by the architect — do NOT revert)

These are Oathkeeper/edge changes the messenger relies on (made on the user's side, listed for context):
- Oathkeeper access rule + header mutator for **admin** role (emits `X-User-Id`/`X-Role`), and the
  `/ids/admin/**` route (Kratos-gated, `X-Admin-Key` passthrough) used by the UI's user search + chat create.
- Messenger backend already carries admin-key auth (`AdminKeyFilter`/`@AdminOnly`) + revive-on-recreate —
  those are **backend code** changes deployed as jar (handled by the messenger review agent), not deploy-env.

---

## Quick conformance checklist for the hormiga-deploy agent
- [ ] Define `messenger` as a real service in `03-services/docker-compose.yml` (network, mount, cmd, image).
- [ ] Set `MINIO_ENDPOINT=https://hormi.isolutions.io` + `extra_hosts: hormi.isolutions.io:<gateway>`.
- [ ] Set `HORMIGA_ADMIN_KEY: ${IDS_ADMIN_KEY}`; remove the DEBUG log override.
- [ ] Add the two nginx locations (`/messenger-attachments` no-slash, `/messenger-ui/` perms) to the edge config in repo.
- [ ] Add coturn as a compose service; document firewall ports.
- [ ] Decide placement of front4mess (harness) — template or document as out-of-band.
- [ ] (backend, separate agent) implement `MINIO_PUBLIC_URL` split-horizon to retire the edge/extra_hosts workaround.
