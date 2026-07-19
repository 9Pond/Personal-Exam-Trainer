import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Callback ที่ Supabase จะ redirect กลับมาหลัง OAuth login สำเร็จ
 * (Google / GitHub / Apple) — แลก "code" เป็น session
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectedFrom") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // แลก session ไม่สำเร็จ → กลับไปหน้า login พร้อม error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
