import "dotenv/config";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { pool } from "./db.js";
import { buildSpec } from "./swagger.js";
import customerRoutes from "./routes/customers.js";
import agentRoutes from "./routes/agent.js";
import authRoutes from "./routes/auth.js";

const PORT = Number(process.env.PORT) || 4000;
const app = express();

const origins = (process.env.CORS_ORIGIN || "*").split(",").map((o) => o.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));
app.use(express.json());

const spec = buildSpec();
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Customer API" }));
app.get("/swagger.json", (req, res) => res.json(spec));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", database: err.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/agent", agentRoutes);

app.get("/", (req, res) => res.redirect("/swagger"));
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// On Vercel the app is exported and run as a serverless function instead of listening on a port
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
    console.log(`Swagger UI at http://localhost:${PORT}/swagger`);
  });
}

export default app;
