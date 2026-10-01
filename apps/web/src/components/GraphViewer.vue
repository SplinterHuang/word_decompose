<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Network } from "vis-network";
import { DataSet } from "vis-data";

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

let network: Network | null = null;
const nodes = new DataSet<{ id: string; label: string; color?: string; shape?: string; title?: string }>();
const edges = new DataSet<{ id: string; from: string; to: string; label?: string; arrows?: string }>();

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
      const existingNode = nodes.get(node.id);
      if (!existingNode) {
        // New node - add it
        const tooltip = Object.entries(node.properties)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        
        const style = getNodeStyle(node);
        
        nodes.add({
          id: node.id,
          label: node.label,
          color: style.color,
          shape: style.shape,
          title: tooltip,
        });
        
        // Add to currentGraphData
        currentGraphData.value.nodes.push(node);
        newNodeIds.add(node.id);
      }
    }
    
    // Merge edges into graph (dedupe by id)
    for (const edge of data.edges) {
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
        const style = graphNode ? getNodeStyle(graphNode) : { color: "#95a5a6" };
        
        return {
          ...node,
          color: style.color,
          shape: style.shape,
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

// Cancel neighborhood highlight and restore full graph visibility
function cancelNeighborhoodHighlight() {
  if (!network) return;
  
  // Restore all nodes to full visibility
  const allNodes = nodes.get();
  const restoredNodes = allNodes.map(node => {
    const graphNode = currentGraphData.value.nodes.find(n => n.id === node.id);
    const style = graphNode ? getNodeStyle(graphNode) : { color: "#95a5a6" };
    
    return {
      ...node,
      color: style.color,
      shape: style.shape,
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
};

// Helper to determine node color and shape
function getNodeStyle(node: GraphNode): { color: string; shape?: string } {
  // Check if this is an affix root (Root with role = prefix or suffix)
  const isAffix = node.type === "Root" && (
    node.properties.role === "prefix" || node.properties.role === "suffix" ||
    node.isAffix
  );
  
  if (isAffix) {
    return { color: nodeColors.RootAffix, shape: "diamond" };
  }
  
  return { color: nodeColors[node.type] || "#95a5a6" };
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
      const tooltip = Object.entries(node.properties)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      
      const style = getNodeStyle(node);
      
      nodes.add({
        id: node.id,
        label: node.label,
        color: style.color,
        shape: style.shape,
        title: tooltip,
      });
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
        <span v-else-if="nodes.length > 0" class="status-ok">已加载 {{ nodes.length }} 个节点</span>
        <span v-else class="status-hint">请选择单元</span>
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
      
      <button 
        @click="expandNodeNeighborhood" 
        :disabled="loading"
        class="btn-neighborhood"
      >
        {{ loading ? '加载中...' : '查看邻域' }}
      </button>
      
      <button 
        v-if="neighborhoodMode"
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
        <span class="legend-dot" style="background: #45b7d1"></span>
        <span class="legend-label">单词 Word</span>
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

.status-hint {
  color: #7f8c8d;
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
