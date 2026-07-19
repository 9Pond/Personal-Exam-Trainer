import { prisma } from "@/lib/prisma";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/**
 * Supabase Auth เป็นเจ้าของ table `auth.users` (identity/credential)
 * ส่วน Prisma `User` model คือ table แยกใน public schema สำหรับข้อมูล
 * เชิง business ของแอป (avatar, displayName, สถิติต่างๆ)
 *
 * ฟังก์ชันนี้ผูกสอง table เข้าด้วยกันโดยใช้ authUser.id เป็น primary key
 * ร่วมกัน (Prisma User.id == Supabase auth.users.id) — เรียกทุกครั้งที่
 * ต้องใช้ appUser เพื่อรับประกันว่า record ฝั่ง public schema มีอยู่จริง
 *
 * ทางเลือกที่ scale ได้ดีกว่าใน production: ใช้ Postgres trigger บน
 * `auth.users` (on insert) ให้สร้าง row ใน `public."User"` อัตโนมัติแทน
 * การเช็คทุก request แบบนี้ — ดู supabase/migrations สำหรับตัวอย่าง trigger
 */
export async function getOrCreateAppUser(authUser: SupabaseUser) {
  return prisma.user.upsert({
    where: { id: authUser.id },
    update: {
      email: authUser.email ?? "",
    },
    create: {
      id: authUser.id,
      email: authUser.email ?? "",
      displayName: authUser.user_metadata?.full_name ?? authUser.email?.split("@")[0],
      avatarUrl: authUser.user_metadata?.avatar_url ?? null,
      authProvider: mapProvider(authUser.app_metadata?.provider),
    },
  });
}

function mapProvider(provider?: string): "EMAIL" | "GOOGLE" | "GITHUB" | "APPLE" {
  switch (provider) {
    case "google":
      return "GOOGLE";
    case "github":
      return "GITHUB";
    case "apple":
      return "APPLE";
    default:
      return "EMAIL";
  }
}
