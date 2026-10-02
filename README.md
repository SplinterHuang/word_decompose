# word-decompose

pnpm monorepo: Vue 3 frontend + Express API, both TypeScript.

## Structure

```text
/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/     @word-decompose/web   Vue 3 + Vite + TypeScript
│   └── api/     @word-decompose/api   Express + TypeScript + Neo4j
├── packages/    reserved (empty at init)
└── scripts/     start / stop / status / restart (deploy host)
```

## Setup

```bash
pnpm install
cp .env.example .env
# Edit .env to set NEO4J_PASSWORD
```

### Neo4j Configuration (Read-Only)

The application connects to a Neo4j database for etymology graph data. Configure the following environment variables in `.env`:

```bash
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password_here
NEO4J_DATABASE=neo4j
```

**Important:**
- The application is **read-only** and will never write to Neo4j
- All queries filter by `source: "etymology-roots"` 
- If Neo4j is not configured or unavailable, the API will soft-fail with clear error messages
- Graph endpoints will return 503 when Neo4j is unavailable

## Ports

| Process | Default bind | Notes |
| --- | --- | --- |
| web | `127.0.0.1:3000` | Vite; proxies `/api` → api |
| api | `127.0.0.1:4000` | Express `GET /api/health` + `/api/graph/*` |

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

- API: `http://127.0.0.1:4000/api/health` (includes Neo4j status)
- Web: `http://127.0.0.1:3000/`
- Proxy: `http://127.0.0.1:3000/api/health`

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

## MVP Screen B: Graph Browser + Chat

### Features

**Layout:**
- Left sidebar: Course unit selector (main Roots with `unit_order`) + search
- Middle panel: Chat interface (stub replies for now)
- Right panel: Force-directed etymology graph viewer

**Graph Viewer:**
- Displays Roots, Words, Forms, Examples, and Insights
- Color-coded by node type
- Shows relationships: DERIVES_FROM, SYNONYM_OF, CONFUSABLE_WITH, MISSPELLING_OF, ABOUT, ILLUSTRATES
- Click nodes to see details and relationships
- Interactive physics simulation

**Course roots (Neo4j, read-only):** nine main `:Root` nodes with `unit_order` 1–9 (no `Unit` / `IN_UNIT`). Affix roots have no `unit_order`. Expected `Root.form` per unit:

| `unit_order` | `Root.form` (label in sidebar) |
|---:|---|
| 1 | chron-/chrono- |
| 2 | arch-/archi-/-archy |
| 3 | struct- |
| 4 | graph-/gram- |
| 5 | log- |
| 6 | path-/pat- |
| 7 | pel/puls |
| 8 | pon/pound |
| 9 | vis/vid |

**API Endpoints:**
- `GET /api/graph/course-roots` - List main Roots with `unit_order` (sidebar 单元/课)
- `GET /api/graph/course-root/:rootId` - Subgraph for one course Root (2-hop neighborhood)
- `GET /api/graph/units` and `GET /api/graph/unit/:unitId` - **410 Gone** (Unit nodes removed; use course-root endpoints)
- `GET /api/graph/node/:nodeId` - Get node neighborhood
- `GET /api/graph/search?q=term` - Search words/roots

### 验收 (Acceptance Testing)

1. **Start the application:**
   ```bash
   ./scripts/start.sh test
   ```

2. **Open in browser:**
   - Navigate to `http://127.0.0.1:3000`
   - You should see the word-decompose interface with three panels

3. **Test unit (课) selection:**
   - In the left sidebar, you should see nine main roots ordered by `unit_order` (forms in table above)
   - Click a row to load that Root’s neighborhood in the graph viewer
   - Optional API smoke check (read-only): `./scripts/verify-course-roots.sh` with API running

4. **Test Graph Interaction:**
   - The right panel shows the force-directed graph
   - Nodes are color-coded (Roots: red, affix roots: orange diamond, Words: blue, Forms: green, Examples: purple)
   - Click on any node to see its details in the overlay panel
   - The graph should show relationships between nodes

5. **Test Chat Panel:**
   - The middle panel has a chat interface
   - Type a message and press Enter or click "发送"
   - You should receive a stub reply (chat functionality is not fully implemented yet)

6. **Test Search:**
   - In the left sidebar, enter a search term in the search box
   - Click "搜索" to search for words or roots
   - Results are logged to console (search UI integration is future work)

7. **Check Health Status:**
   - The top-right corner shows API and Neo4j connection status
   - If Neo4j is unavailable, graph features will show appropriate error messages

### Notes

- **Cloud Agent VM**: The cloud agent VM cannot reach the shared Neo4j instance. The code is designed to handle this gracefully with clear error messages.
- **Local Development**: To test with real data, you need access to a Neo4j instance with etymology-roots data and proper credentials in `.env`.
- **No Docker**: This project runs as native processes without Docker.

