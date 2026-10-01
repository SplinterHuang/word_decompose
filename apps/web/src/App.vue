<script setup lang="ts">
import { onMounted, ref } from "vue";
import ChatPanel from "./components/ChatPanel.vue";
import GraphViewer from "./components/GraphViewer.vue";
import UnitSelector from "./components/UnitSelector.vue";

const health = ref<string>("checking…");
const selectedUnitId = ref<string | null>(null);
const selectedNodeId = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch("/api/health");
    const data = (await res.json()) as { 
      ok?: boolean; 
      service?: string; 
      neo4j?: { available: boolean; error?: string } 
    };
    
    if (data.ok) {
      const neo4jStatus = data.neo4j?.available 
        ? "Neo4j connected" 
        : `Neo4j unavailable (${data.neo4j?.error || "unknown"})`;
      health.value = `API ok • ${neo4jStatus}`;
    } else {
      health.value = "API returned unexpected payload";
    }
  } catch {
    health.value = "API unreachable — start apps/api with pnpm dev:api (127.0.0.1:4000)";
  }
});

function handleUnitSelected(unitId: string) {
  selectedUnitId.value = unitId;
  selectedNodeId.value = null;
}

// Node selection is handled internally by GraphViewer
// This handler is available for future features like deep-linking
function handleNodeSelected(nodeId: string) {
  // For MVP: selection shows details without reloading graph
  // Future: could update URL or enable "view neighborhood" action
  console.log("[App] Node selected:", nodeId);
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>word-decompose</h1>
      <span class="subtitle">词根词源浏览器</span>
      <div class="health-status">{{ health }}</div>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <UnitSelector @unit-selected="handleUnitSelected" />
      </aside>

      <main class="main-content">
        <div class="split-view">
          <div class="panel chat-container">
            <ChatPanel />
          </div>
          <div class="panel graph-container">
            <GraphViewer 
              :unit-id="selectedUnitId || undefined"
              :node-id="selectedNodeId || undefined"
              @node-selected="handleNodeSelected"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  height: 100vh;
  overflow: hidden;
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
}

.subtitle {
  color: #7f8c8d;
  font-size: 1rem;
}

.health-status {
  margin-left: auto;
  padding: 0.5rem 1rem;
  background: #e8f8f5;
  color: #27ae60;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #ddd;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.split-view {
  display: flex;
  height: 100%;
}

.panel {
  flex: 1;
  overflow: hidden;
}

.chat-container {
  max-width: 600px;
  border-right: 1px solid #ddd;
}

.graph-container {
  flex: 2;
  position: relative;
}

@media (max-width: 1200px) {
  .split-view {
    flex-direction: column;
  }

  .chat-container {
    max-width: none;
    height: 40%;
    border-right: none;
    border-bottom: 1px solid #ddd;
  }

  .graph-container {
    height: 60%;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 220px;
  }

  .app-header h1 {
    font-size: 1.25rem;
  }

  .subtitle {
    display: none;
  }
}
</style>
