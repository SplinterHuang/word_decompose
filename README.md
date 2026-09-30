# word-decompose

pnpm monorepo: Vue 3 frontend + Express API, both TypeScript.

## Structure

```text
apps/web   @word-decompose/web   Vue 3 + Vite + TypeScript
apps/api   @word-decompose/api   Express + TypeScript
packages/  reserved for shared packages
```

## Setup

```bash
pnpm install
```

## Develop

```bash
pnpm dev          # web + api in parallel
pnpm dev:web      # http://localhost:5173 (proxies /api → :3000)
pnpm dev:api      # http://localhost:3000
```

## Build

```bash
pnpm build
pnpm start:api    # run compiled API
```
