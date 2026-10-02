import neo4j, { Driver, Session } from "neo4j-driver";

let driver: Driver | null = null;
let connectionError: string | null = null;

const NEO4J_URI = process.env.NEO4J_URI || "bolt://127.0.0.1:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || "neo4j";

export function initNeo4j(): void {
  if (!NEO4J_PASSWORD) {
    connectionError = "NEO4J_PASSWORD not configured";
    console.warn(`[neo4j] ${connectionError} — graph endpoints will return errors`);
    return;
  }

  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    console.log(`[neo4j] Driver created for ${NEO4J_URI}`);
  } catch (err) {
    connectionError = `Failed to create Neo4j driver: ${err}`;
    console.error(`[neo4j] ${connectionError}`);
  }
}

export function getSession(): Session | null {
  if (!driver) {
    return null;
  }
  return driver.session({ database: NEO4J_DATABASE });
}

export function isAvailable(): boolean {
  return driver !== null && connectionError === null;
}

export function getConnectionError(): string | null {
  return connectionError;
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// Type definitions for graph data
export interface GraphNode {
  id: string;
  label: string;
  type: "Root" | "Unit" | "Word" | "Form" | "Insight" | "Example";
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
