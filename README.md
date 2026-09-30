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
└── packages/    reserved (empty at init)
```

## Setup

```bash
pnpm install
```

## Develop

Default binds:

- web: `http://127.0.0.1:3000` (proxies `/api` → api)
- api: `http://127.0.0.1:4000`

```bash
pnpm dev          # web + api in parallel
pnpm dev:web
pnpm dev:api
```

## Build

```bash
pnpm build
pnpm start:api
```
