import "express-async-errors";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { prisma } from "./db";

// Routes
import authRoutes from "./routes/auth";
import leadRoutes from "./routes/leads";
import importRoutes from "./routes/import";
import enrichmentRoutes from "./routes/enrichment";
import communicationRoutes from "./routes/communications";
import dashboardRoutes from "./routes/dashboard";
import settingsRoutes from "./routes/settings";
import contactPointRoutes from "./routes/contact-points";
import { authMiddleware } from "./middleware/auth";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/leads", leadRoutes);
app.use("/api/import", importRoutes);
app.use("/api/enrichment", enrichmentRoutes);
app.use("/api/communications", communicationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/contact-points", contactPointRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = config.BACKEND_PORT;

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
