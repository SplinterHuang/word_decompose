# word-decompose

pnpm monorepo: Vue 3 frontend + Express API, both TypeScript.

## Structure

```text
/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/     @word-decompose/web   Vue 3 + Vite + TypeScript
│   └── api/     @word-decompose/api   Express + TypeScript
├── packages/    reserved (empty at init)
└── scripts/     start / stop / status / restart (deploy host)
```

## Setup

```bash
pnpm install
cp .env.example .env   # optional; defaults match below
```

## Ports

| Process | Default bind | Notes |
| --- | --- | --- |
| web | `127.0.0.1:3000` | Vite; proxies `/api` → api |
| api | `127.0.0.1:4000` | Express `GET /api/health` |

Public hosts (tunnel owned by another team; **not** configured in this repo):

- `https://word-decom-test.vm.splinter.fun` → host `:3000`
- `https://word-decom-dev.vm.splinter.fun` → host `:3000`
- Leave `vm.splinter.fun` → `:8080` untouched

Vite `allowedHosts` includes `*.vm.splinter.fun` so those hostnames work once the tunnel exists.

## Deploy host: start / stop / status

Native processes (no Docker). Pid + logs under `logs/<env>/`.

```bash
./scripts/start.sh test    # or: ./scripts/start.sh dev
./scripts/status.sh test
./scripts/stop.sh test
./scripts/restart.sh test
```

Root shortcuts:

```bash
pnpm start:test
pnpm status:test
pnpm stop:test
pnpm restart:test
pnpm start:dev
pnpm status:dev
pnpm stop:dev
pnpm restart:dev
```

`dev` and `test` share the same localhost ports for now; they use separate pid/log directories so only one set should be running at a time.

### Health

- API: `http://127.0.0.1:4000/api/health`
- Web: `http://127.0.0.1:3000/`
- Proxy: `http://127.0.0.1:3000/api/health`

### Database note

There is a shared Neo4j on the deploy host (`bolt://127.0.0.1:7687`). This app is **read-only / must not write** to that DB. Neo4j client code is intentionally not part of this init; `.env.example` only has commented placeholders for later.

## Local interactive develop

```bash
pnpm dev          # foreground web + api
pnpm dev:web
pnpm dev:api
```

## Build

```bash
pnpm build
pnpm start:api    # run compiled API only
```
