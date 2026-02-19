import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";
import { parseCsvHeaders } from "../utils/csv-parser";
import { importQueue } from "../jobs/queue";
import { logAudit } from "../services/audit";
import fs from "fs";

const router = Router();
router.use(authMiddleware);

// Ensure upload directory exists
const uploadDir = path.resolve(config.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// POST /api/import/upload — upload CSV and get headers for mapping
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileBuffer = fs.readFileSync(req.file.path);
  const headers = await parseCsvHeaders(fileBuffer);

  const importJob = await prisma.importJob.create({
    data: {
      organizationId: req.user!.organizationId,
      userId: req.user!.userId,
      fileName: req.file.originalname,
      status: "MAPPING",
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "import.upload",
    entity: "ImportJob",
    entityId: importJob.id,
    metadata: { fileName: req.file.originalname, headers },
  });

  res.json({
    importJobId: importJob.id,
    headers,
    filePath: req.file.path,
  });
});

const mappingSchema = z.object({
  importJobId: z.string(),
  filePath: z.string(),
  mapping: z.object({
    owner_name: z.string(),
    property_address: z.string(),
    mailing_address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    parcel_id: z.string().optional(),
  }),
});

// POST /api/import/start — start import with column mapping
router.post("/start", async (req: Request, res: Response) => {
  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { importJobId, filePath, mapping } = parsed.data;

  const importJob = await prisma.importJob.findFirst({
    where: { id: importJobId, userId: req.user!.userId },
  });

  if (!importJob) {
    return res.status(404).json({ error: "Import job not found" });
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { columnMapping: mapping as any, status: "PROCESSING" },
  });

  await importQueue.add("process-import", {
    importJobId,
    filePath,
    mapping,
    organizationId: req.user!.organizationId,
    userId: req.user!.userId,
  });

  res.json({ importJobId, status: "PROCESSING" });
});

// GET /api/import/:id — get import status and results
router.get("/:id", async (req: Request, res: Response) => {
  const importJob = await prisma.importJob.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });

  if (!importJob) {
    return res.status(404).json({ error: "Import job not found" });
  }

  res.json(importJob);
});

// GET /api/import — list all imports
router.get("/", async (req: Request, res: Response) => {
  const imports = await prisma.importJob.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(imports);
});

export default router;
