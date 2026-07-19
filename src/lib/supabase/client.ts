import { createBrowserClient } from "@supabase/ssr";

/**
 * ใช้ใน Client Components เท่านั้น (มี "use client")
 * เช่น ปุ่ม Login, Signup form, การเช็ค session ฝั่ง client
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
