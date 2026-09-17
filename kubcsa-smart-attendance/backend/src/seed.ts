import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role, EventStatus } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const password = await bcrypt.hash("ChangeMe123!", 12);
  await prisma.user.upsert({ where: { email: "admin@kubcsa.org" }, update: { approved: true }, create: { name: "Admin Main", email: "admin@kubcsa.org", password, role: Role.SUPER_ADMIN, approved: true } });
  const now = Date.now();
  await prisma.event.upsert({ where: { qrCodeValue: "kubcsa-demo-2026" }, update: { startTime: new Date(now - 60 * 60 * 1000), endTime: new Date(now + 3 * 60 * 60 * 1000), status: EventStatus.ACTIVE }, create: { name: "Annual General Meeting", venueName: "Kisii University Main Hall", latitude: 0.7785, longitude: 34.7261, radiusMeters: 100, startTime: new Date(now - 60 * 60 * 1000), endTime: new Date(now + 3 * 60 * 60 * 1000), qrCodeValue: "kubcsa-demo-2026", status: EventStatus.ACTIVE } });
}
main().finally(() => prisma.$disconnect());
