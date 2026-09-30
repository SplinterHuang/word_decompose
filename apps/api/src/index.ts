import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${port}`);
});
