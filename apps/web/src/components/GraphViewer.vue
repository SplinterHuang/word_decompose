<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { patchWordUnfamiliar } from "../lib/graphWrite";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
  isAffix?: boolean;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const props = defineProps<{
  unitId?: string;
  nodeId?: string;
}>();

const emit = defineEmits<{
  nodeSelected: [nodeId: string];
}>();

const container = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedNode = ref<GraphNode | null>(null);
const currentGraphData = ref<GraphData>({ nodes: [], edges: [] });
const neighborhoodMode = ref(false);
const highlightedNodeId = ref<string | null>(null);
const hiddenNodeIds = ref<Set<string>>(new Set());
const showUnfamiliarOnly = ref(false);
const unfamiliarWriteLoading = ref(false);
const unfamiliarWriteError = ref<string | null>(null);
const unfamiliarNoteDraft = ref("");

const hiddenNodeCount = computed(() => hiddenNodeIds.value.size);
const hasHiddenNodes = computed(() => hiddenNodeCount.value > 0);

const selectedWordLemma = computed(() => {
  if (!selectedNode.value || selectedNode.value.type !== "Word") return null;
  const lemma = selectedNode.value.properties.lemma;
  return typeof lemma === "string" && lemma ? lemma : null;
});

const selectedWordIsUnfamiliar = computed(() => {
  if (!selectedNode.value || selectedNode.value.type !== "Word") return false;
  return selectedNode.value.properties.unfamiliar === true;
});

let network: Network | null = null;
type VisNode = {
  id: string;
  label: string;
  color?: string | { background?: string; border?: string; highlight?: { background?: string; border?: string } };
  shape?: string;
  title?: string;
  borderWidth?: number;
  hidden?: boolean;
};
const nodes = new DataSet<VisNode>();
const edges = new DataSet<{
  id: string;
  from: string;
  to: string;
  label?: string;
  arrows?: string;
  hidden?: boolean;
  color?: { color: string };
  width?: number;
  opacity?: number;
}>();

// Get edges connected to selected node
function getNodeEdges(nodeId: string): GraphEdge[] {
  return currentGraphData.value.edges.filter(
    e => e.source === nodeId || e.target === nodeId
  );
}

// Get 1-hop neighborhood node IDs from current graph data
function getNeighborhoodNodeIds(nodeId: string): Set<string> {
  const neighborhood = new Set<string>();
  neighborhood.add(nodeId); // Include the node itself
  
  // Find all directly connected nodes
  for (const edge of currentGraphData.value.edges) {
    if (edge.source === nodeId) {
      neighborhood.add(edge.target);
    } else if (edge.target === nodeId) {
      neighborhood.add(edge.source);
    }
  }
  
  return neighborhood;
}

// Expand graph by fetching and merging node's 1-hop neighborhood
async function expandNodeNeighborhood() {
  if (!selectedNode.value || !network) return;
  
  const nodeId = selectedNode.value.id;
  loading.value = true;
  
  try {
    // Fetch neighborhood from API
    const url = `/api/graph/node/${encodeURIComponent(nodeId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: GraphData = await res.json();
    
    // Track which nodes/edges are new for optional highlight
    const newNodeIds = new Set<string>();
    const newEdgeIds = new Set<string>();
    
    // Merge nodes into graph (dedupe by id)
    for (const node of data.nodes) {
      if (hiddenNodeIds.value.has(node.id)) {
        continue;
      }
      const existingNode = nodes.get(node.id);
      if (!existingNode) {
        // New node - add it
        nodes.add(buildVisNode(node));
        
        // Add to currentGraphData
        currentGraphData.value.nodes.push(node);
        newNodeIds.add(node.id);
      }
    }
    
    // Merge edges into graph (dedupe by id)
    for (const edge of data.edges) {
      if (
        hiddenNodeIds.value.has(edge.source) ||
        hiddenNodeIds.value.has(edge.target)
      ) {
        continue;
      }
      const existingEdge = edges.get(edge.id);
      if (!existingEdge) {
        // New edge - add it
        let label = edge.type;
        if (edge.properties?.role) {
          label = `${edge.type} (${edge.properties.role})`;
        } else if (edge.properties?.kind) {
          label = `${edge.type} (${edge.properties.kind})`;
        }
        
        edges.add({
          id: edge.id,
          from: edge.source,
          to: edge.target,
          label,
          arrows: "to",
        });
        
        // Add to currentGraphData
        currentGraphData.value.edges.push(edge);
        newEdgeIds.add(edge.id);
      }
    }
    
    // Optional: briefly highlight the newly added neighborhood
    if (newNodeIds.size > 0 || newEdgeIds.size > 0) {
      const neighborhood = getNeighborhoodNodeIds(nodeId);
      
      // Subtle highlight: brighten the expanded neighborhood
      const allNodes = nodes.get();
      const updatedNodes = allNodes.map(node => {
        const isInNeighborhood = neighborhood.has(node.id);
        const graphNode = currentGraphData.value.nodes.find(n => n.id === node.id);
        const base = graphNode ? buildVisNode(graphNode) : node;
        
        return {
          ...base,
          // Subtle fade for non-neighborhood nodes
          opacity: isInNeighborhood ? 1 : 0.6,
        };
      });
      nodes.update(updatedNodes);
      
      // Subtle highlight for neighborhood edges
      const allEdges = edges.get();
      const updatedEdges = allEdges.map(edge => {
        const isConnected = neighborhood.has(edge.from) && neighborhood.has(edge.to);
        
        return {
          ...edge,
          color: isConnected ? { color: "#4ecdc4" } : { color: "#999" },
          width: isConnected ? 2.5 : 1.5,
        };
      });
      edges.update(updatedEdges);
      
      neighborhoodMode.value = true;
      highlightedNodeId.value = nodeId;
    }
    
    // Don't call fit() - keep user's current view stable
    
  } catch (err) {
    console.error("[GraphViewer] Error expanding neighborhood:", err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function isUnfamiliarWord(node: GraphNode): boolean {
  return node.type === "Word" && node.properties.unfamiliar === true;
}

function wordPassesUnfamiliarFilter(node: GraphNode): boolean {
  if (!showUnfamiliarOnly.value) return true;
  if (node.type !== "Word") return true;
  return isUnfamiliarWord(node);
}

function buildVisNode(node: GraphNode): VisNode {
  const tooltip = Object.entries(node.properties)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const style = getNodeStyle(node);
  const hidden =
    hiddenNodeIds.value.has(node.id) || !wordPassesUnfamiliarFilter(node);

  return {
    id: node.id,
    label: style.label,
    color: style.color,
    shape: style.shape,
    title: tooltip,
    borderWidth: style.borderWidth,
    hidden,
  };
}

function syncGraphNodeInMemory(updated: GraphNode) {
  const idx = currentGraphData.value.nodes.findIndex(n => n.id === updated.id);
  if (idx >= 0) {
    currentGraphData.value.nodes[idx] = updated;
  }
  if (nodes.get(updated.id)) {
    nodes.update(buildVisNode(updated));
  }
  if (selectedNode.value?.id === updated.id) {
    selectedNode.value = updated;
    unfamiliarNoteDraft.value =
      typeof updated.properties.unfamiliar_note === "string"
        ? updated.properties.unfamiliar_note
        : "";
  }
}

function applyUnfamiliarFilterToCanvas() {
  for (const graphNode of currentGraphData.value.nodes) {
    if (!nodes.get(graphNode.id)) continue;
    nodes.update({
      id: graphNode.id,
      hidden:
        hiddenNodeIds.value.has(graphNode.id) ||
        !wordPassesUnfamiliarFilter(graphNode),
    });
  }

  const visibleIds = new Set(
    currentGraphData.value.nodes
      .filter(n => isNodeVisibleOnCanvas(n.id) && wordPassesUnfamiliarFilter(n))
      .map(n => n.id)
  );

  for (const edge of currentGraphData.value.edges) {
    const visEdge = edges.get(edge.id);
    if (!visEdge) continue;
    const show =
      visibleIds.has(edge.source) && visibleIds.has(edge.target);
    edges.update({ id: edge.id, hidden: !show });
  }
}

async function setWordUnfamiliar(unfamiliar: boolean) {
  if (!selectedWordLemma.value || !selectedNode.value) return;

  unfamiliarWriteLoading.value = true;
  unfamiliarWriteError.value = null;

  try {
    const payload: { unfamiliar: boolean; unfamiliar_note?: string } = {
      unfamiliar,
    };
    if (unfamiliar && unfamiliarNoteDraft.value.trim()) {
      payload.unfamiliar_note = unfamiliarNoteDraft.value.trim();
    }

    let res = await patchWordUnfamiliar(selectedWordLemma.value, payload);

    if (res.status === 401) {
      res = await patchWordUnfamiliar(selectedWordLemma.value, payload);
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      word?: { unfamiliar_note?: string };
    };

    const nextProps = { ...selectedNode.value.properties };
    if (unfamiliar) {
      nextProps.unfamiliar = true;
      if (data.word?.unfamiliar_note) {
        nextProps.unfamiliar_note = data.word.unfamiliar_note;
      } else if (payload.unfamiliar_note) {
        nextProps.unfamiliar_note = payload.unfamiliar_note;
      } else {
        delete nextProps.unfamiliar_note;
      }
    } else {
      delete nextProps.unfamiliar;
      delete nextProps.unfamiliar_note;
      unfamiliarNoteDraft.value = "";
    }

    syncGraphNodeInMemory({
      ...selectedNode.value,
      properties: nextProps,
    });
    applyUnfamiliarFilterToCanvas();
  } catch (err) {
    unfamiliarWriteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    unfamiliarWriteLoading.value = false;
  }
}

function buildVisEdge(edge: GraphEdge) {
  let label = edge.type;
  if (edge.properties?.role) {
    label = `${edge.type} (${edge.properties.role})`;
  } else if (edge.properties?.kind) {
    label = `${edge.type} (${edge.properties.kind})`;
  }

  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label,
    arrows: "to" as const,
  };
}

function isNodeVisibleOnCanvas(nodeId: string): boolean {
  return !hiddenNodeIds.value.has(nodeId);
}

function getEdgeIdsForNode(nodeId: string): string[] {
  return currentGraphData.value.edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .map(e => e.id);
}

function clearNodeSelection() {
  selectedNode.value = null;
  network?.unselectAll();
}

// Remove selected node from canvas (client-side only; graph data kept for restore)
function hideSelectedNode() {
  if (!selectedNode.value || !network) return;

  const nodeId = selectedNode.value.id;
  if (hiddenNodeIds.value.has(nodeId)) return;

  const nextHidden = new Set(hiddenNodeIds.value);
  nextHidden.add(nodeId);
  hiddenNodeIds.value = nextHidden;

  if (nodes.get(nodeId)) {
    nodes.remove(nodeId);
  }

  const edgeIdsToRemove = getEdgeIdsForNode(nodeId).filter(id => edges.get(id));
  if (edgeIdsToRemove.length > 0) {
    edges.remove(edgeIdsToRemove);
  }

  if (highlightedNodeId.value === nodeId) {
    neighborhoodMode.value = false;
    highlightedNodeId.value = null;
  }

  clearNodeSelection();
}

function restoreHiddenNodes() {
  if (!network || hiddenNodeIds.value.size === 0) return;

  const toRestore = [...hiddenNodeIds.value];
  hiddenNodeIds.value = new Set();

  for (const nodeId of toRestore) {
    const graphNode = currentGraphData.value.nodes.find(n => n.id === nodeId);
    if (graphNode && !nodes.get(nodeId)) {
      nodes.add(buildVisNode(graphNode));
    }
  }

  const visibleIds = new Set(
    currentGraphData.value.nodes
      .filter(n => isNodeVisibleOnCanvas(n.id))
      .map(n => n.id)
  );

  for (const edge of currentGraphData.value.edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    if (!edges.get(edge.id)) {
      edges.add(buildVisEdge(edge));
    }
  }

  neighborhoodMode.value = false;
  highlightedNodeId.value = null;
  clearNodeSelection();
}

// Cancel neighborhood highlight and restore full graph visibility
function cancelNeighborhoodHighlight() {
  if (!network) return;
  
  // Restore all nodes to full visibility
  const allNodes = nodes.get();
  const restoredNodes = allNodes.map(node => {
    const graphNode = currentGraphData.value.nodes.find(n => n.id === node.id);
    const base = graphNode ? buildVisNode(graphNode) : node;
    
    return {
      ...base,
      opacity: 1,
    };
  });
  nodes.update(restoredNodes);
  
  // Restore original edge colors
  const allEdges = edges.get();
  const restoredEdges = allEdges.map(edge => ({
    ...edge,
    color: { color: "#848484" },
    width: 2,
    opacity: 1,
  }));
  edges.update(restoredEdges);
  
  neighborhoodMode.value = false;
  highlightedNodeId.value = null;
}

// Color scheme based on node type
const nodeColors: Record<string, string> = {
  Root: "#ff6b6b",
  RootAffix: "#ff9f40",  // Orange for affix roots
  Unit: "#4ecdc4",
  Word: "#45b7d1",
  Form: "#96ceb4",
  Insight: "#ffeaa7",
  Example: "#9b59b6",
};

// Helper to determine node color and shape
function getNodeStyle(node: GraphNode): {
  color: string | { background: string; border: string };
  shape?: string;
  borderWidth?: number;
  label: string;
} {
  // Check if this is an affix root (Root with role = prefix or suffix)
  const isAffix = node.type === "Root" && (
    node.properties.role === "prefix" || node.properties.role === "suffix" ||
    node.isAffix
  );

  let label = node.label;
  if (isUnfamiliarWord(node)) {
    label = `★ ${label}`;
  }
  
  if (isAffix) {
    return { color: nodeColors.RootAffix, shape: "diamond", label };
  }

  const base = nodeColors[node.type] || "#95a5a6";
  if (isUnfamiliarWord(node)) {
    return {
      color: { background: base, border: "#e67e22" },
      borderWidth: 4,
      label,
    };
  }
  
  return { color: base, label };
}

// Load graph data
async function loadGraphData() {
  // Don't load if no unit or node is selected
  if (!props.unitId && !props.nodeId) {
    return;
  }

  loading.value = true;
  error.value = null;
  selectedNode.value = null;
  neighborhoodMode.value = false;
  highlightedNodeId.value = null;
  hiddenNodeIds.value = new Set();
  showUnfamiliarOnly.value = false;
  unfamiliarWriteError.value = null;

  try {
    let url: string;
    
    if (props.nodeId) {
      url = `/api/graph/node/${encodeURIComponent(props.nodeId)}`;
    } else if (props.unitId) {
      url = `/api/graph/unit/${encodeURIComponent(props.unitId)}`;
    } else {
      return; // Should never reach here due to early return above
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    const data: GraphData = await res.json();

    // Store current graph data
    currentGraphData.value = data;

    // Clear existing data
    nodes.clear();
    edges.clear();

    // Add nodes
    for (const node of data.nodes) {
      nodes.add(buildVisNode(node));
    }

    // Add edges
    for (const edge of data.edges) {
      // Include role property in label if present
      let label = edge.type;
      if (edge.properties?.role) {
        label = `${edge.type} (${edge.properties.role})`;
      } else if (edge.properties?.kind) {
        label = `${edge.type} (${edge.properties.kind})`;
      }
      
      edges.add({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        label,
        arrows: "to",
      });
    }

    // Fit network to screen after a short delay
    setTimeout(() => {
      network?.fit({ animation: true });
    }, 100);

  } catch (err) {
    console.error("[GraphViewer] Error loading graph:", err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

// Initialize vis-network
onMounted(() => {
  if (!container.value) return;

  const data = { nodes, edges };
  const options = {
    nodes: {
      shape: "dot",
      size: 16,
      font: {
        size: 14,
        color: "#333",
      },
      borderWidth: 2,
      borderWidthSelected: 4,
    },
    edges: {
      width: 2,
      color: { color: "#848484", highlight: "#4ecdc4" },
      smooth: { 
        enabled: true,
        type: "continuous",
        roundness: 0.5,
      },
      font: {
        size: 11,
        align: "top",
      },
    },
    physics: {
      stabilization: { iterations: 200 },
      barnesHut: {
        gravitationalConstant: -8000,
        springConstant: 0.04,
        springLength: 95,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
    },
  };

  network = new Network(container.value, data, options);

  // Handle node selection
  network.on("selectNode", (params) => {
    const nodeId = params.nodes[0];
    if (nodeId) {
      const nodeIdStr = String(nodeId);
      emit("nodeSelected", nodeIdStr);
      // Show node details from current graph data
      const graphNode = currentGraphData.value.nodes.find((n: GraphNode) => n.id === nodeIdStr);
      if (graphNode) {
        selectedNode.value = graphNode;
        unfamiliarWriteError.value = null;
        unfamiliarNoteDraft.value =
          typeof graphNode.properties.unfamiliar_note === "string"
            ? graphNode.properties.unfamiliar_note
            : "";
      }
    }
  });

  network.on("deselectNode", () => {
    selectedNode.value = null;
  });

  // Initial load only if props are set
  if (props.unitId || props.nodeId) {
    loadGraphData();
  }
});

// Watch for unit and node changes
watch(() => props.unitId, (newUnitId, oldUnitId) => {
  if (newUnitId !== oldUnitId) {
    loadGraphData();
  }
});

watch(() => props.nodeId, (newNodeId, oldNodeId) => {
  if (newNodeId !== oldNodeId) {
    loadGraphData();
  }
});

watch(showUnfamiliarOnly, () => {
  applyUnfamiliarFilterToCanvas();
});

// Expose method to load by unit
defineExpose({
  loadUnit: () => {
    loadGraphData();
  },
  loadNode: () => {
    loadGraphData();
  },
});
</script>

<template>
  <div class="graph-viewer">
    <div class="graph-header">
      <h3>词源图谱</h3>
      <div class="graph-status">
        <span v-if="loading" class="status-loading">加载中...</span>
        <span v-else-if="error" class="status-error">{{ error }}</span>
        <span v-else-if="nodes.length > 0" class="status-ok">
          已加载 {{ nodes.length }} 个节点
          <span v-if="hasHiddenNodes" class="status-hidden">（已隐藏 {{ hiddenNodeCount }}）</span>
        </span>
        <span v-else class="status-hint">请选择单元</span>
        <button
          v-if="hasHiddenNodes && !loading"
          type="button"
          class="btn-restore-hidden"
          @click="restoreHiddenNodes"
        >
          显示已隐藏
        </button>
        <label v-if="nodes.length > 0 && !loading" class="filter-unfamiliar">
          <input v-model="showUnfamiliarOnly" type="checkbox" />
          仅陌生词
        </label>
      </div>
    </div>

    <div ref="container" class="graph-container"></div>

    <div v-if="selectedNode" class="node-details">
      <div class="node-details-handle"></div>
      <button class="btn-close" @click="selectedNode = null" aria-label="关闭">×</button>
      
      <h4>{{ selectedNode.label }}</h4>
      <div class="node-type">类型: {{ selectedNode.type }}</div>
      
      <div class="node-props">
        <div v-for="(value, key) in selectedNode.properties" :key="key" class="prop-item">
          <strong>{{ key }}:</strong> {{ value }}
        </div>
      </div>
      
      <div v-if="getNodeEdges(selectedNode.id).length > 0" class="node-edges">
        <strong>关系:</strong>
        <div v-for="edge in getNodeEdges(selectedNode.id)" :key="edge.id" class="edge-item">
          {{ edge.type }}
          <span v-if="edge.properties?.role" class="edge-kind">({{ edge.properties.role }})</span>
          <span v-else-if="edge.properties?.kind" class="edge-kind">({{ edge.properties.kind }})</span>
        </div>
      </div>
      
      <div v-if="selectedWordLemma" class="unfamiliar-section">
        <div class="unfamiliar-header">
          <strong>陌生词标记</strong>
          <span v-if="selectedWordIsUnfamiliar" class="unfamiliar-badge">已标记</span>
        </div>
        <label v-if="!selectedWordIsUnfamiliar" class="unfamiliar-note-label">
          备注（可选）
          <input
            v-model="unfamiliarNoteDraft"
            type="text"
            maxlength="200"
            placeholder='例如：因为 -ion'
            :disabled="unfamiliarWriteLoading"
          />
        </label>
        <p v-if="unfamiliarWriteError" class="unfamiliar-error">{{ unfamiliarWriteError }}</p>
        <button
          v-if="!selectedWordIsUnfamiliar"
          type="button"
          class="btn-mark-unfamiliar"
          :disabled="loading || unfamiliarWriteLoading"
          @click="setWordUnfamiliar(true)"
        >
          {{ unfamiliarWriteLoading ? "保存中…" : "标记为陌生词" }}
        </button>
        <button
          v-else
          type="button"
          class="btn-unmark-unfamiliar"
          :disabled="loading || unfamiliarWriteLoading"
          @click="setWordUnfamiliar(false)"
        >
          {{ unfamiliarWriteLoading ? "保存中…" : "取消陌生词" }}
        </button>
      </div>

      <div class="node-actions">
        <button
          type="button"
          @click="expandNodeNeighborhood"
          :disabled="loading"
          class="btn-neighborhood"
        >
          {{ loading ? '加载中...' : '查看邻域' }}
        </button>
        <button
          type="button"
          @click="hideSelectedNode"
          :disabled="loading"
          class="btn-hide-node"
        >
          隐藏节点
        </button>
      </div>

      <button
        v-if="neighborhoodMode"
        type="button"
        @click="cancelNeighborhoodHighlight"
        class="btn-cancel-highlight"
      >
        显示全部
      </button>
    </div>

    <div class="legend">
      <div class="legend-item">
        <span class="legend-dot" style="background: #ff6b6b"></span>
        <span class="legend-label">主词根 Main Root</span>
      </div>
      <div class="legend-item">
        <span class="legend-diamond" style="background: #ff9f40"></span>
        <span class="legend-label">前缀 Prefix</span>
      </div>
      <div class="legend-item">
        <span class="legend-diamond" style="background: #ff9f40"></span>
        <span class="legend-label">后缀 Suffix</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #4ecdc4"></span>
        <span class="legend-label">单元 Unit</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot-unfamiliar" style="background: #45b7d1"></span>
        <span class="legend-label">单词 Word（★ 陌生）</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #96ceb4"></span>
        <span class="legend-label">形式 Form</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #ffeaa7"></span>
        <span class="legend-label">提示 Insight</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8f9fa;
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #ddd;
}

.graph-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c3e50;
}

.graph-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.status-hidden {
  color: #7f8c8d;
}

.btn-restore-hidden {
  padding: 0.375rem 0.75rem;
  min-height: 36px;
  background: #7f8c8d;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-restore-hidden:hover {
  background: #6c7a7b;
}

.status-loading {
  color: #4ecdc4;
}

.status-error {
  color: #e74c3c;
}

.status-ok {
  color: #27ae60;
}

.status-hint {
  color: #7f8c8d;
}

.filter-unfamiliar {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #34495e;
  cursor: pointer;
  user-select: none;
}

.filter-unfamiliar input {
  cursor: pointer;
}

.graph-container {
  flex: 1;
  min-height: 0;
  background: white;
  position: relative;
}

.node-details {
  position: absolute;
  top: 70px;
  right: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  max-width: 300px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.node-details-handle {
  display: none;
}

.btn-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  color: #7f8c8d;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
  display: none;
}

.btn-close:hover {
  background: #f0f0f0;
}

.node-details h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #2c3e50;
  padding-right: 2rem;
}

.node-type {
  color: #7f8c8d;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.node-props {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.prop-item {
  font-size: 0.875rem;
  line-height: 1.4;
}

.prop-item strong {
  color: #34495e;
}

.node-edges {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
}

.node-edges strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #34495e;
  font-size: 0.875rem;
}

.edge-item {
  font-size: 0.875rem;
  color: #555;
  padding: 0.25rem 0;
}

.edge-kind {
  color: #7f8c8d;
  font-size: 0.8rem;
}

.unfamiliar-section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
}

.unfamiliar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #34495e;
}

.unfamiliar-badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: #d35400;
  background: #fdebd0;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.unfamiliar-note-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #7f8c8d;
  margin-bottom: 0.5rem;
}

.unfamiliar-note-label input {
  padding: 0.45rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
}

.unfamiliar-error {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: #e74c3c;
}

.btn-mark-unfamiliar,
.btn-unmark-unfamiliar {
  width: 100%;
  padding: 0.625rem 1rem;
  min-height: 44px;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-mark-unfamiliar {
  background: #9b59b6;
  color: white;
}

.btn-mark-unfamiliar:hover:not(:disabled) {
  background: #8e44ad;
}

.btn-unmark-unfamiliar {
  background: #ecf0f1;
  color: #2c3e50;
}

.btn-unmark-unfamiliar:hover:not(:disabled) {
  background: #dde4e6;
}

.btn-mark-unfamiliar:disabled,
.btn-unmark-unfamiliar:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.node-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.node-actions .btn-neighborhood,
.node-actions .btn-hide-node {
  flex: 1;
  min-width: 0;
  margin-top: 0;
}

.btn-neighborhood {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.625rem 1rem;
  min-height: 44px;
  background: #4ecdc4;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-neighborhood:hover:not(:disabled) {
  background: #45b8af;
}

.btn-neighborhood:disabled {
  background: #a8d5d3;
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-hide-node {
  width: 100%;
  padding: 0.625rem 1rem;
  min-height: 44px;
  background: #e67e22;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-hide-node:hover:not(:disabled) {
  background: #d35400;
}

.btn-hide-node:disabled {
  background: #e8b88a;
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-cancel-highlight {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.625rem 1rem;
  min-height: 44px;
  background: #7f8c8d;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel-highlight:hover {
  background: #6c7a7b;
}

.legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #34495e;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.legend-dot-unfamiliar {
  box-shadow: 0 0 0 2px #e67e22;
}

.legend-diamond {
  width: 12px;
  height: 12px;
  display: inline-block;
  flex-shrink: 0;
  transform: rotate(45deg);
}

.legend-label {
  white-space: nowrap;
}

@media (max-width: 768px) {
  .graph-header {
    padding: 1rem;
  }

  .graph-header h3 {
    font-size: 1.1rem;
  }

  .node-details {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    max-width: none;
    border-radius: 16px 16px 0 0;
    max-height: 50vh;
    overflow-y: auto;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    padding: 1.5rem 1rem 1rem;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .node-details-handle {
    display: block;
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 4px;
    background: #ddd;
    border-radius: 2px;
  }

  .btn-close {
    display: block;
  }

  .legend {
    bottom: 10px;
    left: 10px;
    padding: 0.5rem 0.625rem;
    gap: 0.375rem;
  }

  .legend-item {
    font-size: 0.8rem;
  }

  .legend-dot,
  .legend-diamond {
    width: 10px;
    height: 10px;
  }
}

@media (max-width: 480px) {
  .graph-header {
    padding: 0.75rem 1rem;
  }

  .graph-header h3 {
    font-size: 1rem;
  }

  .graph-status {
    font-size: 0.8rem;
  }

  .legend {
    padding: 0.5rem;
    gap: 0.25rem;
  }

  .legend-item {
    font-size: 0.75rem;
  }

  .legend-label {
    display: none;
  }

  .node-details {
    padding: 1.25rem 1rem 1rem;
  }
}
</style>
