import { Router, Request, Response } from "express";
import { getSession, isAvailable, getConnectionError, GraphData, GraphNode, GraphEdge } from "./neo4j.js";
import { Record as Neo4jRecord } from "neo4j-driver";

const router = Router();

// Helper to handle unavailable Neo4j
function requireNeo4j(res: Response): boolean {
  if (!isAvailable()) {
    res.status(503).json({
      error: "Neo4j not available",
      message: getConnectionError() || "Database not configured",
    });
    return false;
  }
  return true;
}

// Helper to convert Neo4j node to GraphNode
function toGraphNode(record: Neo4jRecord, key: string): GraphNode {
  const node = record.get(key);
  const labels = node.labels || [];
  const type = labels[0] || "Unknown";
  
  return {
    id: node.elementId || node.identity?.toString() || "",
    label: node.properties.form || node.properties.lemma || node.properties.title || node.properties.id || "?",
    type: type as GraphNode["type"],
    properties: node.properties || {},
  };
}

// Helper to convert Neo4j relationship to GraphEdge
function toGraphEdge(record: Neo4jRecord, key: string, sourceKey: string, targetKey: string): GraphEdge {
  const rel = record.get(key);
  const source = record.get(sourceKey);
  const target = record.get(targetKey);
  
  return {
    id: rel.elementId || rel.identity?.toString() || "",
    source: source.elementId || source.identity?.toString() || "",
    target: target.elementId || target.identity?.toString() || "",
    type: rel.type || "UNKNOWN",
    properties: rel.properties || {},
  };
}

// List all units
router.get("/units", async (_req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    const result = await session.run(
      `MATCH (u:Unit)
       WHERE u.source = $source OR $source IN labels(u)
       RETURN u
       ORDER BY u.order`,
      { source: "etymology-roots" }
    );

    const units = result.records.map(record => {
      const node = toGraphNode(record, "u");
      return {
        id: node.properties.id || node.id,
        order: node.properties.order,
        title: node.properties.title,
      };
    });

    res.json({ units });
  } catch (err) {
    console.error("[graph] Error listing units:", err);
    res.status(500).json({ error: "Failed to list units", message: String(err) });
  } finally {
    await session.close();
  }
});

// Get unit subgraph
router.get("/unit/:unitId", async (req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const { unitId } = req.params;
  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    // Get unit and all connected roots and words
    const result = await session.run(
      `MATCH (u:Unit {id: $unitId})
       WHERE u.source = $source OR $source IN labels(u)
       OPTIONAL MATCH (u)<-[r1:IN_UNIT]-(n)
       WHERE n.source = $source OR $source IN labels(n)
       OPTIONAL MATCH (n)-[r2]-(connected)
       WHERE (connected.source = $source OR $source IN labels(connected))
         AND type(r2) IN ['DERIVES_FROM', 'SYNONYM_OF', 'CONFUSABLE_WITH', 'MISSPELLING_OF', 'ABOUT']
       RETURN u, r1, n, r2, connected`,
      { unitId, source: "etymology-roots" }
    );

    const nodesMap = new Map<string, GraphNode>();
    const edgesMap = new Map<string, GraphEdge>();

    for (const record of result.records) {
      // Add unit
      if (record.get("u")) {
        const unit = toGraphNode(record, "u");
        nodesMap.set(unit.id, unit);
      }

      // Add main node (root/word)
      if (record.get("n")) {
        const node = toGraphNode(record, "n");
        nodesMap.set(node.id, node);
        
        // Add IN_UNIT relationship
        if (record.get("r1")) {
          const edge = toGraphEdge(record, "r1", "n", "u");
          edgesMap.set(edge.id, edge);
        }
      }

      // Add connected node
      if (record.get("connected")) {
        const connected = toGraphNode(record, "connected");
        nodesMap.set(connected.id, connected);
        
        // Add relationship
        if (record.get("r2")) {
          const edge = toGraphEdge(record, "r2", "n", "connected");
          edgesMap.set(edge.id, edge);
        }
      }
    }

    const graphData: GraphData = {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };

    res.json(graphData);
  } catch (err) {
    console.error("[graph] Error getting unit subgraph:", err);
    res.status(500).json({ error: "Failed to get unit subgraph", message: String(err) });
  } finally {
    await session.close();
  }
});

// Get neighborhood of a root or word
router.get("/node/:nodeId", async (req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const { nodeId } = req.params;
  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    // Get node and its immediate neighborhood
    const result = await session.run(
      `MATCH (n)
       WHERE elementId(n) = $nodeId AND (n.source = $source OR $source IN labels(n))
       OPTIONAL MATCH (n)-[r]-(connected)
       WHERE connected.source = $source OR $source IN labels(connected)
       RETURN n, r, connected`,
      { nodeId, source: "etymology-roots" }
    );

    const nodesMap = new Map<string, GraphNode>();
    const edgesMap = new Map<string, GraphEdge>();

    for (const record of result.records) {
      // Add central node
      if (record.get("n")) {
        const node = toGraphNode(record, "n");
        nodesMap.set(node.id, node);
      }

      // Add connected node
      if (record.get("connected")) {
        const connected = toGraphNode(record, "connected");
        nodesMap.set(connected.id, connected);
        
        // Add relationship
        if (record.get("r")) {
          const edge = toGraphEdge(record, "r", "n", "connected");
          edgesMap.set(edge.id, edge);
        }
      }
    }

    const graphData: GraphData = {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };

    res.json(graphData);
  } catch (err) {
    console.error("[graph] Error getting node neighborhood:", err);
    res.status(500).json({ error: "Failed to get node neighborhood", message: String(err) });
  } finally {
    await session.close();
  }
});

// Search for words or roots
router.get("/search", async (req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const { q } = req.query;
  if (!q || typeof q !== "string") {
    res.status(400).json({ error: "Query parameter 'q' required" });
    return;
  }

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    // Search in form, lemma, gloss_zh, title
    const result = await session.run(
      `MATCH (n)
       WHERE (n.source = $source OR $source IN labels(n))
         AND (n.form CONTAINS $query 
           OR n.lemma CONTAINS $query 
           OR n.gloss_zh CONTAINS $query
           OR n.title CONTAINS $query)
       RETURN n
       LIMIT 20`,
      { query: q, source: "etymology-roots" }
    );

    const nodes = result.records.map(record => toGraphNode(record, "n"));

    res.json({ nodes });
  } catch (err) {
    console.error("[graph] Error searching:", err);
    res.status(500).json({ error: "Failed to search", message: String(err) });
  } finally {
    await session.close();
  }
});

export default router;
