import { Router, Request, Response } from "express";
import { getSession, isAvailable, getConnectionError, GraphData, GraphNode, GraphEdge } from "./neo4j.js";
import { Record as Neo4jRecord, Integer, isInt } from "neo4j-driver";

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

// Helper to convert Neo4j Integer types to JavaScript numbers
function convertNeo4jIntegers(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (isInt(obj)) {
    return (obj as Integer).toNumber();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertNeo4jIntegers(item));
  }
  
  if (typeof obj === "object") {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertNeo4jIntegers(value);
    }
    return converted;
  }
  
  return obj;
}

// Helper to convert Neo4j node to GraphNode
function toGraphNode(record: Neo4jRecord, key: string): GraphNode {
  const node = record.get(key);
  const labels = node.labels || [];
  const type = labels[0] || "Unknown";
  
  // Select label based on node type
  let label = "?";
  if (type === "Example") {
    const title = node.properties.title;
    const text = node.properties.text;
    if (typeof title === "string" && title) {
      label = title;
    } else if (typeof text === "string" && text) {
      label = text.length > 48 ? `${text.slice(0, 48)}…` : text;
    } else if (node.properties.id) {
      label = String(node.properties.id);
    }
  } else if (node.properties.spell) {
    label = node.properties.spell; // Form nodes
  } else if (node.properties.form) {
    label = node.properties.form; // Root nodes
  } else if (node.properties.lemma) {
    label = node.properties.lemma; // Word nodes
  } else if (node.properties.title) {
    label = node.properties.title;
  } else if (node.properties.id) {
    label = node.properties.id; // Fallback to id
  }
  
  return {
    id: node.elementId || node.identity?.toString() || "",
    label,
    type: type as GraphNode["type"],
    properties: convertNeo4jIntegers(node.properties || {}) as Record<string, unknown>,
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
    properties: convertNeo4jIntegers(rel.properties || {}) as Record<string, unknown>,
  };
}

const GRAPH_NEIGHBOR_REL_TYPES = [
  "DERIVES_FROM",
  "SYNONYM_OF",
  "CONFUSABLE_WITH",
  "MISSPELLING_OF",
  "ABOUT",
  "ILLUSTRATES",
] as const;

function courseRootTitle(node: GraphNode): string {
  if (typeof node.properties.gloss_zh === "string" && node.properties.gloss_zh) {
    return node.properties.gloss_zh;
  }
  if (typeof node.properties.form === "string" && node.properties.form) {
    return node.properties.form;
  }
  return node.label;
}

function collectTwoHopSubgraph(
  records: Neo4jRecord[],
  opts: {
    centerKey: string;
    hop1NodeKey: string;
    hop1RelKey: string;
    hop1SourceKey: string;
    hop1TargetKey: string;
    hop2NodeKey: string;
    hop2RelKey: string;
    hop2SourceKey: string;
    hop2TargetKey: string;
  }
): GraphData {
  const nodesMap = new Map<string, GraphNode>();
  const edgesMap = new Map<string, GraphEdge>();

  for (const record of records) {
    if (record.get(opts.centerKey)) {
      const center = toGraphNode(record, opts.centerKey);
      nodesMap.set(center.id, center);
    }

    if (record.get(opts.hop1NodeKey)) {
      const hop1 = toGraphNode(record, opts.hop1NodeKey);
      nodesMap.set(hop1.id, hop1);

      if (record.get(opts.hop1RelKey)) {
        const edge = toGraphEdge(
          record,
          opts.hop1RelKey,
          opts.hop1SourceKey,
          opts.hop1TargetKey
        );
        edgesMap.set(edge.id, edge);
      }
    }

    if (record.get(opts.hop2NodeKey)) {
      const hop2 = toGraphNode(record, opts.hop2NodeKey);
      nodesMap.set(hop2.id, hop2);

      if (record.get(opts.hop2RelKey)) {
        const edge = toGraphEdge(
          record,
          opts.hop2RelKey,
          opts.hop2SourceKey,
          opts.hop2TargetKey
        );
        edgesMap.set(edge.id, edge);
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
  };
}

// List main course roots (sidebar 「单元」): Root nodes with unit_order, no Unit nodes
router.get("/course-roots", async (_req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    const result = await session.run(
      `MATCH (r:Root)
       WHERE (r.source = $source OR $source IN labels(r))
         AND r.unit_order IS NOT NULL
         AND (r.role IS NULL OR NOT r.role IN ['prefix', 'suffix'])
       RETURN r
       ORDER BY r.unit_order`,
      { source: "etymology-roots" }
    );

    const courseRoots = result.records.map(record => {
      const node = toGraphNode(record, "r");
      return {
        id: node.properties.id || node.id,
        unit_order: node.properties.unit_order,
        form: node.properties.form,
        gloss_zh: node.properties.gloss_zh,
        title: courseRootTitle(node),
      };
    });

    res.json({ courseRoots });
  } catch (err) {
    console.error("[graph] Error listing course roots:", err);
    res.status(500).json({ error: "Failed to list course roots", message: String(err) });
  } finally {
    await session.close();
  }
});

/** @deprecated Use GET /course-roots — Unit nodes removed from Neo4j */
router.get("/units", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "Gone",
    message: "Unit nodes were removed from the graph. Use GET /api/graph/course-roots instead.",
  });
});

// List all affixes (roots that are prefix/suffix)
// Schema contract (verified in production Neo4j):
// - Root nodes: property `role` = "prefix" | "suffix" for affixes, null/absent for main roots
// - Root label text: property `form` (not `spell`)
// - DERIVES_FROM edges: property `role` = "prefix" | "suffix" when present
router.get("/affixes", async (_req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    // Query for Root nodes that have role = 'prefix' or 'suffix'
    const result = await session.run(
      `MATCH (r:Root)
       WHERE (r.source = $source OR $source IN labels(r))
         AND r.role IN ['prefix', 'suffix']
       RETURN r
       ORDER BY r.form`,
      { source: "etymology-roots" }
    );

    const affixes = result.records.map(record => {
      const node = toGraphNode(record, "r");
      
      return {
        id: node.properties.id || node.id,
        form: node.properties.form,
        role: node.properties.role || "affix",
        gloss_zh: node.properties.gloss_zh,
      };
    });

    res.json({ affixes });
  } catch (err) {
    console.error("[graph] Error listing affixes:", err);
    res.status(500).json({ error: "Failed to list affixes", message: String(err) });
  } finally {
    await session.close();
  }
});

// List Example nodes (dialogue / usage illustrations linked to Words)
router.get("/examples", async (_req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    const result = await session.run(
      `MATCH (e:Example)
       WHERE e.source = $source OR $source IN labels(e)
       OPTIONAL MATCH (e)-[:ILLUSTRATES]->(w:Word)
       WHERE w.source = $source OR $source IN labels(w)
       WITH e, head(collect(DISTINCT w.lemma)) AS word_lemma
       RETURN e, word_lemma
       ORDER BY coalesce(e.kind, ''), coalesce(e.title, e.id)`,
      { source: "etymology-roots" }
    );

    const examples = result.records.map(record => {
      const node = toGraphNode(record, "e");
      const wordLemma = record.get("word_lemma");

      return {
        id: node.properties.id || node.id,
        kind: node.properties.kind || "example",
        title:
          (typeof node.properties.title === "string" && node.properties.title) ||
          node.label,
        word_lemma: wordLemma ?? undefined,
      };
    });

    res.json({ examples });
  } catch (err) {
    console.error("[graph] Error listing examples:", err);
    res.status(500).json({ error: "Failed to list examples", message: String(err) });
  } finally {
    await session.close();
  }
});

// Course-root subgraph: main Root (unit_order) + 2-hop neighborhood (replaces Unit + IN_UNIT)
router.get("/course-root/:rootId", async (req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const { rootId } = req.params;
  const unitOrderParam = /^\d+$/.test(rootId) ? parseInt(rootId, 10) : null;
  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  const relTypes = [...GRAPH_NEIGHBOR_REL_TYPES];

  try {
    const result = await session.run(
      `MATCH (r:Root)
       WHERE (r.source = $source OR $source IN labels(r))
         AND r.unit_order IS NOT NULL
         AND (elementId(r) = $rootId OR r.id = $rootId
           OR ($unitOrder IS NOT NULL AND r.unit_order = $unitOrder))
       OPTIONAL MATCH (r)-[r1]-(n)
       WHERE (n.source = $source OR $source IN labels(n))
         AND type(r1) IN $relTypes
       OPTIONAL MATCH (n)-[r2]-(connected)
       WHERE (connected.source = $source OR $source IN labels(connected))
         AND type(r2) IN $relTypes
       RETURN r, r1, n, r2, connected`,
      { rootId, unitOrder: unitOrderParam, source: "etymology-roots", relTypes }
    );

    if (result.records.length === 0) {
      res.status(404).json({ error: "Course root not found", rootId });
      return;
    }

    const graphData = collectTwoHopSubgraph(result.records, {
      centerKey: "r",
      hop1NodeKey: "n",
      hop1RelKey: "r1",
      hop1SourceKey: "r",
      hop1TargetKey: "n",
      hop2NodeKey: "connected",
      hop2RelKey: "r2",
      hop2SourceKey: "n",
      hop2TargetKey: "connected",
    });

    res.json(graphData);
  } catch (err) {
    console.error("[graph] Error getting course-root subgraph:", err);
    res.status(500).json({ error: "Failed to get course-root subgraph", message: String(err) });
  } finally {
    await session.close();
  }
});

/** @deprecated Use GET /course-root/:rootId — Unit nodes and IN_UNIT removed from Neo4j */
router.get("/unit/:unitId", (req: Request, res: Response) => {
  res.status(410).json({
    error: "Gone",
    message: "Unit subgraph was removed. Use GET /api/graph/course-root/:rootId instead.",
    unitId: req.params.unitId,
  });
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
    // Get node by elementId or business properties (Root.id, Root.form, Word.lemma, Example.id)
    const result = await session.run(
      `MATCH (n)
       WHERE (n.source = $source OR $source IN labels(n))
         AND (elementId(n) = $nodeId 
           OR n.id = $nodeId 
           OR n.form = $nodeId
           OR n.lemma = $nodeId)
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
        
        // Add relationship (now includes role property if present)
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
    // Annotate results with isAffix flag for affixes
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

    const nodes = result.records.map(record => {
      const node = toGraphNode(record, "n");
      
      // Determine if this is an affix root based on role property
      const isAffix = node.type === "Root" && (
        node.properties.role === "prefix" || node.properties.role === "suffix"
      );
      
      return {
        ...node,
        isAffix,
      };
    });

    res.json({ nodes });
  } catch (err) {
    console.error("[graph] Error searching:", err);
    res.status(500).json({ error: "Failed to search", message: String(err) });
  } finally {
    await session.close();
  }
});

export default router;
