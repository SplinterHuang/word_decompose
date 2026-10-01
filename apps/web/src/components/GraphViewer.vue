<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Network } from "vis-network";
import { DataSet } from "vis-data";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
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

let network: Network | null = null;
const nodes = new DataSet<{ id: string; label: string; color?: string; title?: string }>();
const edges = new DataSet<{ id: string; from: string; to: string; label?: string; arrows?: string }>();

// Color scheme based on node type
const nodeColors: Record<string, string> = {
  Root: "#ff6b6b",
  Unit: "#4ecdc4",
  Word: "#45b7d1",
  Form: "#96ceb4",
  Insight: "#ffeaa7",
};

// Load graph data
async function loadGraphData() {
  loading.value = true;
  error.value = null;
  selectedNode.value = null;

  try {
    let url = "/api/graph/units";
    
    if (props.nodeId) {
      url = `/api/graph/node/${encodeURIComponent(props.nodeId)}`;
    } else if (props.unitId) {
      url = `/api/graph/unit/${encodeURIComponent(props.unitId)}`;
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
      const tooltip = Object.entries(node.properties)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      
      nodes.add({
        id: node.id,
        label: node.label,
        color: nodeColors[node.type] || "#95a5a6",
        title: tooltip,
      });
    }

    // Add edges
    for (const edge of data.edges) {
      const label = edge.properties?.kind ? `${edge.type} (${edge.properties.kind})` : edge.type;
      
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
      emit("nodeSelected", nodeId);
      // Show node details
      const graphNode = currentGraphData.value.nodes.find((n: GraphNode) => n.id === nodeId);
      if (graphNode) {
        selectedNode.value = graphNode;
      }
    }
  });

  network.on("deselectNode", () => {
    selectedNode.value = null;
  });

  // Initial load
  loadGraphData();
});

// Watch for prop changes
watch([() => props.unitId, () => props.nodeId], () => {
  loadGraphData();
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
        <span v-else class="status-ok">已加载 {{ nodes.length }} 个节点</span>
      </div>
    </div>

    <div ref="container" class="graph-container"></div>

    <div v-if="selectedNode" class="node-details">
      <h4>{{ selectedNode.label }}</h4>
      <div class="node-type">类型: {{ selectedNode.type }}</div>
      <div class="node-props">
        <div v-for="(value, key) in selectedNode.properties" :key="key" class="prop-item">
          <strong>{{ key }}:</strong> {{ value }}
        </div>
      </div>
    </div>

    <div class="legend">
      <div class="legend-item">
        <span class="legend-dot" style="background: #ff6b6b"></span>
        词根 Root
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #4ecdc4"></span>
        单元 Unit
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #45b7d1"></span>
        单词 Word
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #96ceb4"></span>
        形式 Form
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #ffeaa7"></span>
        提示 Insight
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
  font-size: 0.875rem;
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

.graph-container {
  flex: 1;
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

.node-details h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #2c3e50;
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
}

.prop-item {
  font-size: 0.875rem;
  line-height: 1.4;
}

.prop-item strong {
  color: #34495e;
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
}
</style>
