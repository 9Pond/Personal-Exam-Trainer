import { PrismaClient } from "@prisma/client";

// ป้องกันการสร้าง PrismaClient instance ใหม่ทุกครั้งที่ hot-reload ตอน dev
// (Next.js dev mode reload module บ่อย ถ้าไม่ทำแบบนี้จะเปิด connection ค้างจำนวนมาก)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
