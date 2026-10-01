import cors from "cors";
import express from "express";
import { initNeo4j, isAvailable, getConnectionError } from "./neo4j.js";
import graphRoutes from "./graph-routes.js";

const app = express();
const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.API_PORT || process.env.PORT || 4000);

// Initialize Neo4j connection (soft-fail if not configured)
initNeo4j();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const neo4jStatus = isAvailable()
    ? { available: true }
    : { available: false, error: getConnectionError() };
  
  res.json({ 
    ok: true, 
    service: "api",
    neo4j: neo4jStatus,
  });
});

// Mount graph routes
app.use("/api/graph", graphRoutes);

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
