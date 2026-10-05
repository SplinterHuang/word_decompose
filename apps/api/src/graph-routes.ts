import { Router, Request, Response } from "express";
import { getSession, isAvailable, getConnectionError, GraphData, GraphNode, GraphEdge } from "./neo4j.js";
import { Record as Neo4jRecord, Integer, isInt } from "neo4j-driver";
import { requireGraphWritePassword } from "./write-auth.js";

const router = Router();

const SOURCE = "etymology-roots";
const MAX_UNFAMILIAR_NOTE_LENGTH = 200;

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
    label = node.properties.title; // Unit nodes
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
      { source: SOURCE }
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
    // Get node by either elementId or business properties (Unit.id, Root.id, Root.form, Word.lemma)
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

// List Word nodes marked unfamiliar (read-only)
router.get("/unfamiliar-words", async (_req: Request, res: Response) => {
  if (!requireNeo4j(res)) return;

  const session = getSession();
  if (!session) {
    res.status(503).json({ error: "Failed to create session" });
    return;
  }

  try {
    const result = await session.run(
      `MATCH (w:Word)
       WHERE (w.source = $source OR $source IN labels(w))
         AND w.unfamiliar = true
       RETURN w
       ORDER BY w.lemma`,
      { source: SOURCE }
    );

    const words = result.records.map(record => {
      const node = toGraphNode(record, "w");
      return {
        lemma: node.properties.lemma,
        unfamiliar_note:
          typeof node.properties.unfamiliar_note === "string"
            ? node.properties.unfamiliar_note
            : undefined,
        id: node.id,
      };
    });

    res.json({ words });
  } catch (err) {
    console.error("[graph] Error listing unfamiliar words:", err);
    res.status(500).json({ error: "Failed to list unfamiliar words", message: String(err) });
  } finally {
    await session.close();
  }
});

// Mark or unmark a Word as unfamiliar (Word nodes only; narrow write path)
router.patch(
  "/word/:lemma/unfamiliar",
  requireGraphWritePassword,
  async (req: Request, res: Response) => {
    if (!requireNeo4j(res)) return;

    const { lemma } = req.params;
    if (!lemma || typeof lemma !== "string") {
      res.status(400).json({ error: "lemma required" });
      return;
    }

    const body = req.body as { unfamiliar?: unknown; unfamiliar_note?: unknown };
    if (typeof body.unfamiliar !== "boolean") {
      res.status(400).json({ error: "Body field 'unfamiliar' (boolean) is required" });
      return;
    }

    let note: string | null = null;
    if (body.unfamiliar) {
      if (body.unfamiliar_note !== undefined && body.unfamiliar_note !== null) {
        if (typeof body.unfamiliar_note !== "string") {
          res.status(400).json({ error: "unfamiliar_note must be a string" });
          return;
        }
        const trimmed = body.unfamiliar_note.trim();
        if (trimmed.length > MAX_UNFAMILIAR_NOTE_LENGTH) {
          res.status(400).json({
            error: `unfamiliar_note must be at most ${MAX_UNFAMILIAR_NOTE_LENGTH} characters`,
          });
          return;
        }
        note = trimmed.length > 0 ? trimmed : null;
      }
    }

    const session = getSession();
    if (!session) {
      res.status(503).json({ error: "Failed to create session" });
      return;
    }

    try {
      if (body.unfamiliar) {
        const result = await session.run(
          `MATCH (w:Word {lemma: $lemma})
           WHERE (w.source = $source OR $source IN labels(w))
           SET w.unfamiliar = true
           FOREACH (_ IN CASE WHEN $note IS NULL THEN [] ELSE [1] END |
             SET w.unfamiliar_note = $note)
           RETURN w`,
          { lemma, source: SOURCE, note }
        );

        if (result.records.length === 0) {
          res.status(404).json({ error: "Word not found", lemma });
          return;
        }

        const node = toGraphNode(result.records[0], "w");
        res.json({
          ok: true,
          word: {
            lemma: node.properties.lemma,
            unfamiliar: true,
            unfamiliar_note:
              typeof node.properties.unfamiliar_note === "string"
                ? node.properties.unfamiliar_note
                : undefined,
            id: node.id,
          },
        });
      } else {
        const result = await session.run(
          `MATCH (w:Word {lemma: $lemma})
           WHERE (w.source = $source OR $source IN labels(w))
           REMOVE w.unfamiliar, w.unfamiliar_note
           RETURN w`,
          { lemma, source: SOURCE }
        );

        if (result.records.length === 0) {
          res.status(404).json({ error: "Word not found", lemma });
          return;
        }

        const node = toGraphNode(result.records[0], "w");
        res.json({
          ok: true,
          word: {
            lemma: node.properties.lemma,
            unfamiliar: false,
            id: node.id,
          },
        });
      }
    } catch (err) {
      console.error("[graph] Error updating unfamiliar flag:", err);
      res.status(500).json({ error: "Failed to update word", message: String(err) });
    } finally {
      await session.close();
    }
  }
);

export default router;
