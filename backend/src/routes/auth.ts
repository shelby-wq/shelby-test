import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signToken } from "../middleware/auth";
import { logAudit } from "../services/audit";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, password, name, organizationName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const org = await prisma.organization.create({
    data: { name: organizationName },
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  await logAudit({
    actorId: user.id,
    action: "user.register",
    entity: "User",
    entityId: user.id,
    after: { email, organizationId: org.id },
  });

  const token = signToken({
    userId: user.id,
    organizationId: org.id,
    role: user.role,
  });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: org.id, name: org.name },
  });
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed" });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  });

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: user.organization.id, name: user.organization.name },
  });
});

// GET /api/auth/me
router.get("/me", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: user.organization.id, name: user.organization.name },
  });
});

export default router;
