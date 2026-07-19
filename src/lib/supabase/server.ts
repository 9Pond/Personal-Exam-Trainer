import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * ใช้ใน Server Components, Route Handlers, Server Actions
 * อ่าน/เขียน session ผ่าน Next.js cookies() API
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // เรียกจาก Server Component (read-only) — middleware จะ refresh session แทน
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // เช่นเดียวกับด้านบน
          }
        },
      },
    }
  );
}

/**
 * Admin client — ใช้ Service Role Key
 * ⚠️ ใช้เฉพาะฝั่ง server สำหรับงานที่ต้อง bypass RLS เท่านั้น
 * (เช่น background job, admin operation) ห้าม import เข้า client component เด็ดขาด
 */
export function createAdminClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
