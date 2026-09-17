import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"] as const;
const missingRequiredEnv = requiredEnvVars.filter((key) => !process.env[key] || process.env[key]?.includes("replace-with-"));

if (isProduction && missingRequiredEnv.length > 0) {
  console.error(`Missing required production environment variables: ${missingRequiredEnv.join(", ")}`);
  process.exit(1);
}

if (isProduction && (process.env.DATABASE_URL ?? "").startsWith("file:")) {
  console.error("Production deployments must use PostgreSQL, not SQLite.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? "development-secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "development-refresh-secret";

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later." } }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many authentication attempts, please try again later." } }));

const signTokens = (user: { id: string; role: Role }) => ({
  accessToken: jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "15m" }),
  refreshToken: jwt.sign({ sub: user.id }, refreshSecret, { expiresIn: "7d" }),
});
const auth = (roles?: Role[]) => (request: Request, response: Response, next: NextFunction) => {
  const token = request.headers.authorization?.replace("Bearer ", "");
  if (!token) return response.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string; role: Role };
    if (roles && !roles.includes(payload.role)) return response.status(403).json({ error: "Insufficient permissions" });
    request.user = payload;
    return next();
  } catch { return response.status(401).json({ error: "Invalid or expired token" }); }
};

app.get("/health", (_request, response) => response.json({ status: "ok", service: "kubcsa-attendance-api" }));

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.password))) return response.status(401).json({ error: "Invalid email or password" });
    if (!user.approved) return response.status(403).json({ error: "Your admin account is waiting for approval from an existing administrator." });
    const tokens = signTokens(user);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken } });
    return response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...tokens });
  } catch (error) { return next(error); }
});

app.post("/api/auth/register-admin", async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) }).parse(request.body);
    const password = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({ data: { name: input.name.trim(), email: input.email.toLowerCase(), password, role: Role.ADMIN } });
    return response.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, status: "PENDING_APPROVAL", message: "Account request submitted. An existing administrator must approve it before sign-in." });
  } catch (error: any) {
    if (error?.name === "ZodError") return response.status(400).json({ error: "Enter a valid name, email, and password of at least 8 characters." });
    if (error?.code === "P2002") return response.status(409).json({ error: "An account with this email already exists." });
    return next(error);
  }
});

app.post("/api/auth/refresh", async (request, response, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    const payload = jwt.verify(refreshToken, refreshSecret) as { sub: string };
    const user = await prisma.user.findFirst({ where: { id: payload.sub, refreshToken } });
    if (!user) return response.status(401).json({ error: "Invalid refresh token" });
    const tokens = signTokens(user);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken } });
    return response.json(tokens);
  } catch (error) { return next(error); }
});

app.get("/api/admins", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (_request, response, next) => { try { return response.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, approved: true, createdAt: true }, orderBy: { createdAt: "desc" } })); } catch (error) { return next(error); } });
app.patch("/api/admins/:id/approval", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => { try { const userId = String(request.params.id); const { approved } = z.object({ approved: z.boolean() }).parse(request.body); const user = await prisma.user.update({ where: { id: userId }, data: { approved, refreshToken: approved ? undefined : null }, select: { id: true, name: true, email: true, role: true, approved: true } }); return response.json(user); } catch (error: any) { if (error?.code === "P2025") return response.status(404).json({ error: "Admin account not found." }); return next(error); } });
app.delete("/api/admins/:id", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => { try { const userId = String(request.params.id); if (request.user?.sub === userId) return response.status(400).json({ error: "You cannot delete your own account." }); const approvedCount = await prisma.user.count({ where: { approved: true } }); if (approvedCount <= 1) return response.status(409).json({ error: "The last approved administrator cannot be deleted." }); await prisma.user.delete({ where: { id: userId } }); return response.status(204).send(); } catch (error: any) { if (error?.code === "P2025") return response.status(404).json({ error: "Admin account not found." }); return next(error); } });

app.post("/api/events", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => {
  try {
    const input = z.object({ name: z.string().min(2), venueName: z.string().min(2), latitude: z.number(), longitude: z.number(), radiusMeters: z.number().int().positive(), startTime: z.coerce.date(), endTime: z.coerce.date(), qrCodeValue: z.string().trim().min(4).max(120).optional() }).parse(request.body);
    if (input.endTime <= input.startTime) return response.status(400).json({ error: "Event end time must be after the start time." });
    const event = await prisma.event.create({ data: { ...input, qrCodeValue: input.qrCodeValue || crypto.randomUUID() } });
    return response.status(201).json(event);
  } catch (error: any) {
    if (error?.name === "ZodError") return response.status(400).json({ error: "Check the event details and try again." });
    if (error?.code === "P2002") return response.status(409).json({ error: "That manual QR code is already in use. Enter a different code." });
    return next(error);
  }
});
app.get("/api/events", auth(), async (_request, response, next) => { try { return response.json(await prisma.event.findMany({ orderBy: { startTime: "desc" } })); } catch (error) { return next(error); } });
app.get("/api/events/active", async (_request, response, next) => { try { const now = new Date(); const event = await prisma.event.findFirst({ where: { status: "ACTIVE", startTime: { lte: now }, endTime: { gte: now } }, orderBy: { startTime: "asc" } }); if (!event) return response.status(404).json({ error: "No active attendance event" }); return response.json(event); } catch (error) { return next(error); } });
app.get("/api/dashboard/summary", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (_request, response, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const [students, activeEvents, totalCheckIns, todayCheckIns, recentAttendance, activeEvent] = await Promise.all([
      prisma.student.count(),
      prisma.event.count({ where: { status: "ACTIVE", endTime: { gte: now } } }),
      prisma.attendance.count(),
      prisma.attendance.count({ where: { checkedInAt: { gte: todayStart } } }),
      prisma.attendance.findMany({ orderBy: { checkedInAt: "desc" }, take: 6, include: { event: { select: { name: true } } } }),
      prisma.event.findFirst({ where: { status: "ACTIVE", startTime: { lte: now }, endTime: { gte: now } }, orderBy: { startTime: "asc" } }),
    ]);
    const grouped = await prisma.attendance.groupBy({ by: ["subCounty"], _count: { _all: true }, orderBy: { _count: { subCounty: "desc" } }, take: 6 });
    return response.json({ students, activeEvents, totalCheckIns, todayCheckIns, attendanceRate: students ? Math.round((todayCheckIns / students) * 1000) / 10 : 0, activeEvent, recentAttendance, bySubCounty: grouped.map((item) => ({ name: item.subCounty, value: item._count._all })) });
  } catch (error) { return next(error); }
});
app.patch("/api/events/:id/status", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => { try { const { status } = z.object({ status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]) }).parse(request.body); const eventId = String(request.params.id); if (status === "ACTIVE") { await prisma.event.updateMany({ where: { status: "ACTIVE", id: { not: eventId } }, data: { status: "CLOSED" } }); } return response.json(await prisma.event.update({ where: { id: eventId }, data: { status } })); } catch (error) { return next(error); } });
app.patch("/api/events/:id", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => {
  try {
    const eventId = String(request.params.id);
    const input = z.object({ name: z.string().min(2), venueName: z.string().min(2), latitude: z.number(), longitude: z.number(), radiusMeters: z.number().int().positive(), startTime: z.coerce.date(), endTime: z.coerce.date(), qrCodeValue: z.string().trim().min(4).max(120) }).parse(request.body);
    if (input.endTime <= input.startTime) return response.status(400).json({ error: "Event end time must be after the start time." });
    return response.json(await prisma.event.update({ where: { id: eventId }, data: input }));
  } catch (error: any) { if (error?.name === "ZodError") return response.status(400).json({ error: "Check the event details and try again." }); if (error?.code === "P2002") return response.status(409).json({ error: "That manual QR code is already in use. Enter a different code." }); return next(error); }
});
app.delete("/api/events/:id", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => {
  try {
    const eventId = String(request.params.id);
    const attendanceCount = await prisma.attendance.count({ where: { eventId } });
    if (attendanceCount) return response.status(409).json({ error: "Events with attendance records cannot be deleted. Close the event instead." });
    try { await prisma.event.delete({ where: { id: eventId } }); } catch (error: any) { if (error?.code === "P2025") return response.status(404).json({ error: "Event not found." }); throw error; }
    return response.status(204).send();
  } catch (error) { return next(error); }
});

const attendanceInput = z.object({ firstName: z.string().min(2), secondName: z.string().min(2), regNo: z.string().min(3), phoneNumber: z.string().min(7), subCounty: z.string().min(2), eventId: z.string(), qrCodeValue: z.string(), latitude: z.number(), longitude: z.number(), deviceInfo: z.string().optional() });
const distanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => { const earthRadius = 6371000; const radians = (value: number) => value * Math.PI / 180; const dLat = radians(lat2 - lat1); const dLon = radians(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2; return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };
app.post("/api/attendance", async (request, response, next) => {
  try {
    const input = attendanceInput.parse(request.body);
    const event = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!event || event.qrCodeValue !== input.qrCodeValue) return response.status(400).json({ error: "Invalid QR Code." });
    const now = new Date();
    if (event.status !== "ACTIVE" || now < event.startTime || now > event.endTime) return response.status(400).json({ error: "Attendance window has closed." });
    const distance = distanceInMeters(input.latitude, input.longitude, event.latitude, event.longitude);
    if (distance > event.radiusMeters) return response.status(400).json({ error: "Attendance not allowed at this location." });
    const student = await prisma.student.upsert({ where: { regNo: input.regNo }, update: { firstName: input.firstName, secondName: input.secondName, phoneNumber: input.phoneNumber, subCounty: input.subCounty }, create: { firstName: input.firstName, secondName: input.secondName, regNo: input.regNo, phoneNumber: input.phoneNumber, subCounty: input.subCounty } });
    const record = await prisma.attendance.create({ data: { studentId: student.id, eventId: event.id, firstName: student.firstName, secondName: student.secondName, regNo: student.regNo, phoneNumber: student.phoneNumber, subCounty: student.subCounty, latitude: input.latitude, longitude: input.longitude, distanceFromVenue: Math.round(distance), deviceInfo: input.deviceInfo } });
    return response.status(201).json(record);
  } catch (error: any) {
    if (error?.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
      if (target.includes("phoneNumber")) return response.status(409).json({ error: "This phone number has already been used." });
      return response.status(409).json({ error: "Attendance already recorded for this registration number." });
    }
    return next(error);
  }
});
app.get("/api/attendance", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => { try { const eventId = typeof request.query.eventId === "string" ? request.query.eventId : undefined; return response.json(await prisma.attendance.findMany({ where: { eventId }, orderBy: { checkedInAt: "desc" }, include: { event: true } })); } catch (error) { return next(error); } });
app.get("/api/reports/attendance", auth([Role.ADMIN, Role.SUPER_ADMIN]), async (request, response, next) => {
  try {
    const eventId = typeof request.query.eventId === "string" ? request.query.eventId : undefined;
    const records = await prisma.attendance.findMany({ where: { eventId }, orderBy: { checkedInAt: "desc" }, include: { event: { select: { name: true } } } });
    return response.json(records.map((record) => ({ firstName: record.firstName, secondName: record.secondName, registrationNumber: record.regNo, phoneNumber: record.phoneNumber, subCounty: record.subCounty, event: record.event.name, checkInTime: record.checkedInAt, latitude: record.latitude, longitude: record.longitude, distanceFromVenue: record.distanceFromVenue })));
  } catch (error) { return next(error); }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof Error && error.message === "Origin not allowed by CORS") {
    return response.status(403).json({ error: "Origin not allowed by CORS" });
  }
  console.error(error);
  return response.status(500).json({ error: "Internal server error" });
});
app.listen(port, () => console.log(`KUBCSA API listening on http://localhost:${port}`));

declare global { namespace Express { interface Request { user?: { sub: string; role: Role }; } } }
