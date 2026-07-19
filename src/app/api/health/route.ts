import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Health check — ใช้กับ uptime monitoring / load balancer
 * เช็ค DB connection จริง ไม่ใช่แค่ตอบ 200 เฉยๆ
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", db: "disconnected", message: (error as Error).message },
      { status: 503 }
    );
  }
}
