import { createClient } from "@/lib/supabase/server";
import { getOrCreateAppUser } from "@/lib/auth";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // authUser ไม่ควรเป็น null ตรงนี้ เพราะ middleware กันไว้แล้ว
  const appUser = authUser ? await getOrCreateAppUser(authUser) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">
        สวัสดี, {appUser?.displayName ?? authUser?.email}
      </h1>
      <p className="text-muted-foreground text-sm">
        Auth + Database sync ทำงานแล้ว ✅ — พร้อมต่อ feature ถัดไป
        (Upload → OCR → Extraction pipeline)
      </p>
      <div className="flex gap-3">
        <a href="/upload" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
          อัปโหลดข้อสอบ
        </a>
        <a href="/quiz/new" className="rounded-lg border px-4 py-2 text-sm">
          สร้าง Quiz
        </a>
      </div>
    </main>
  );
}
