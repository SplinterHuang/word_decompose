import cors from "cors";
import express from "express";

const app = express();
const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.API_PORT || process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
