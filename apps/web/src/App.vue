<script setup lang="ts">
import { onMounted, ref } from "vue";
import ChatPanel from "./components/ChatPanel.vue";
import GraphViewer from "./components/GraphViewer.vue";
import UnitSelector from "./components/UnitSelector.vue";

const health = ref<string>("checking…");
const selectedUnitId = ref<string | null>(null);
const selectedNodeId = ref<string | null>(null);
const sidebarOpen = ref(false);
const activeTab = ref<"chat" | "graph">("graph");

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
  sidebarOpen.value = false;
}

function handleAffixSelected(affixId: string) {
  selectedUnitId.value = null;
  selectedNodeId.value = affixId;
  sidebarOpen.value = false;
}

function handleExampleSelected(exampleId: string) {
  selectedUnitId.value = null;
  selectedNodeId.value = exampleId;
  sidebarOpen.value = false;
}

function handleNodeSelectedFromSearch(nodeId: string) {
  selectedUnitId.value = null;
  selectedNodeId.value = nodeId;
  sidebarOpen.value = false;
}

function handleNodeSelected(nodeId: string) {
  console.log("[App] Node selected:", nodeId);
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebar() {
  sidebarOpen.value = false;
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <button class="hamburger" @click="toggleSidebar" aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <h1>word-decompose</h1>
      <span class="subtitle">词根词源浏览器</span>
      <div class="health-status">{{ health }}</div>
    </header>

    <div class="mobile-tabs">
      <button 
        :class="['tab-btn', { active: activeTab === 'graph' }]"
        @click="activeTab = 'graph'"
      >
        图谱
      </button>
      <button 
        :class="['tab-btn', { active: activeTab === 'chat' }]"
        @click="activeTab = 'chat'"
      >
        对话
      </button>
    </div>

    <div class="app-body">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>
      
      <aside :class="['sidebar', { open: sidebarOpen }]">
        <UnitSelector 
          @unit-selected="handleUnitSelected"
          @affix-selected="handleAffixSelected"
          @example-selected="handleExampleSelected"
          @node-selected="handleNodeSelectedFromSearch"
        />
      </aside>

      <main class="main-content">
        <div class="split-view">
          <div :class="['panel', 'chat-container', { hidden: activeTab !== 'chat' }]">
            <ChatPanel />
          </div>
          <div :class="['panel', 'graph-container', { hidden: activeTab !== 'graph' }]">
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

.hamburger {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  width: 28px;
  height: 24px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.hamburger span {
  display: block;
  width: 100%;
  height: 3px;
  background: #2c3e50;
  border-radius: 2px;
  transition: all 0.3s;
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

.mobile-tabs {
  display: none;
  background: white;
  border-bottom: 1px solid #ddd;
}

.tab-btn {
  flex: 1;
  padding: 0.875rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 1rem;
  font-weight: 600;
  color: #7f8c8d;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #4ecdc4;
  border-bottom-color: #4ecdc4;
}

.sidebar-overlay {
  display: none;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #ddd;
  overflow: hidden;
  transition: transform 0.3s ease;
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
  .hamburger {
    display: flex;
  }

  .app-header {
    position: relative;
    z-index: 1001;
  }

  .app-header h1 {
    font-size: 1.25rem;
  }

  .subtitle {
    display: none;
  }

  .health-status {
    display: none;
  }

  .mobile-tabs {
    display: flex;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 1000;
    transform: translateX(-100%);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 999;
  }

  .split-view {
    flex-direction: column;
  }

  .panel {
    max-width: none !important;
    width: 100%;
    height: 100%;
    border: none !important;
  }

  .panel.hidden {
    display: none;
  }
}

@media (max-width: 480px) {
  .app-header {
    padding: 0.75rem 1rem;
  }

  .app-header h1 {
    font-size: 1.1rem;
  }

  .sidebar {
    width: 85vw;
    max-width: 300px;
  }

  .tab-btn {
    padding: 0.75rem;
    font-size: 0.95rem;
  }
}
</style>
