# AI Quiz Platform — Project Scaffold

Scaffold นี้ครอบคลุม: โครงโปรเจกต์ Next.js (App Router + TypeScript + Tailwind),
Prisma schema เต็มรูปแบบ, และระบบ Auth ผ่าน Supabase (Email + Google/GitHub/Apple)

> ⚠️ โค้ดชุดนี้เขียนและตรวจสอบความถูกต้องทาง syntax แล้ว แต่ **ยังไม่ได้รัน
> `npm install` / `npm run build` จริง** เนื่องจาก sandbox ที่ใช้สร้างไฟล์นี้
> ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณารันตามขั้นตอนด้านล่างในเครื่องของคุณ
> เพื่อดาวน์โหลด dependency และตรวจสอบว่า build ผ่านจริง

---

## 1. ติดตั้ง Dependencies

```bash
npm install
```

## 2. ตั้งค่า Supabase Project

1. สร้างโปรเจกต์ที่ https://supabase.com
2. ไปที่ **Authentication → Providers** เปิดใช้ Email, Google, GitHub, Apple
   ตามที่ต้องการ (แต่ละตัวต้องตั้งค่า OAuth credentials ของตัวเอง)
3. ไปที่ **Authentication → URL Configuration** เพิ่ม Redirect URL:
   `http://localhost:3000/api/auth/callback` (และ production URL ภายหลัง)
4. คัดลอกค่าจาก **Project Settings → API**: `Project URL`, `anon public key`,
   `service_role key`
5. คัดลอกค่าจาก **Project Settings → Database**: connection string ทั้งแบบ
   pooled (สำหรับ `DATABASE_URL`) และ direct (สำหรับ `DIRECT_URL`)
6. เปิด extension `vector` ใน **Database → Extensions** (สำหรับ pgvector /
   semantic search)

## 3. ตั้งค่า Environment Variables

```bash
cp .env.example .env
# แล้วกรอกค่าจริงทั้งหมดใน .env
```

## 4. Migrate Database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

## 5. (แนะนำ) เพิ่ม Postgres Trigger ให้ sync auth.users → public."User" อัตโนมัติ

ปัจจุบัน scaffold นี้ sync user ผ่านฟังก์ชัน `getOrCreateAppUser()` แบบ
lazy (เช็คตอนเข้า dashboard) ซึ่งใช้งานได้ทันทีไม่ต้องตั้งค่าเพิ่ม
แต่เมื่อระบบโตขึ้น แนะนำให้ย้ายไปใช้ Postgres trigger แทน เพื่อไม่ต้อง
เช็คทุก request สร้างไฟล์ migration แยกที่มีเนื้อหาประมาณนี้:

```sql
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public."User" (id, email, "displayName", "avatarUrl", "authProvider")
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'EMAIL'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
```

## 6. Seed ข้อมูลเริ่มต้น (Topics)

```bash
npm run prisma:seed
```

## 7. สร้าง Storage Bucket

ไปที่ Supabase Dashboard → **Storage** → สร้าง bucket ชื่อ `exam-uploads`
ตั้งเป็น **public** (เพื่อให้ `getPublicUrl()` ใช้งานได้ตามที่โค้ดเขียนไว้)
หรือถ้าต้องการ private ให้เปลี่ยนไปใช้ `getSignedDownloadUrl()` แทนทุกจุดที่
เรียก `uploadFile()` อยู่ตอนนี้

## 8. รัน Redis (สำหรับ Queue)

```bash
# ถ้ามี Docker
docker run -d -p 6379:6379 redis:7-alpine
```

## 9. รัน Dev Server + Worker (ต้องรันคู่กัน คนละ terminal)

```bash
# Terminal 1
npm run dev

# Terminal 2 — worker ประมวลผล OCR + Extraction
npm run worker

# Terminal 3 — worker วิเคราะห์ผลการทำ Quiz (Performance Analysis)
npm run worker:analysis
```

เปิด http://localhost:3000 — ควร redirect ไปหน้า `/login` อัตโนมัติ
(เพราะยังไม่ login) ทดสอบ login ด้วย email/password หรือ OAuth ที่ตั้งค่าไว้
เมื่อ login สำเร็จควรเข้าหน้า `/dashboard` และเห็นชื่อผู้ใช้ที่ sync มาจาก DB แล้ว
ลองไปที่ `/upload` เพื่อทดสอบอัปโหลด PDF/รูปภาพและติดตามสถานะ OCR + Extraction
แบบ real-time (polling ทุก 2.5 วินาที)

## 10. ตรวจสอบ Health Check

```bash
curl http://localhost:3000/api/health
# ควรได้ {"status":"ok","db":"connected"}
```

---

## โครงสร้างโฟลเดอร์

```
prisma/
  schema.prisma       ← Database schema เต็มรูปแบบ (อ้างอิง Architecture Doc)
  seed.ts             ← Seed ข้อมูล Topics เริ่มต้น
worker/
  ocr-extract.worker.ts        ← Background worker: OCR + Question Extraction
  performance-analysis.worker.ts ← Background worker: วิเคราะห์ผลหลังจบ Quiz
src/
  app/
    layout.tsx        ← Root layout
    page.tsx          ← Redirect ตาม auth state
    login/page.tsx     ← หน้า login (Email + OAuth)
    dashboard/page.tsx  ← หน้าแรกหลัง login
    upload/page.tsx     ← อัปโหลดข้อสอบ + ติดตามสถานะ OCR/Extraction
    quiz/
      new/page.tsx           ← ฟอร์ม Generate Quiz (Infinite Quiz)
      [quizId]/take/page.tsx  ← หน้าทำข้อสอบ
    attempt/
      [attemptId]/result/page.tsx ← ผลคะแนน + เฉลย + AI analysis
    api/
      auth/callback/route.ts  ← OAuth callback handler
      health/route.ts          ← Health check endpoint
      exams/upload/route.ts    ← รับอัปโหลด PDF/รูปภาพ, กัน re-process ซ้ำ, enqueue job
      exams/status/route.ts    ← Polling endpoint สำหรับดูสถานะประมวลผล
      quizzes/generate/route.ts        ← Infinite Quiz: สุ่มจาก DB เท่านั้น ไม่เรียก AI
      quizzes/[quizId]/route.ts         ← ดึงคำถามสำหรับทำ Quiz (ไม่มีเฉลย)
      quizzes/[quizId]/attempts/route.ts ← เริ่ม Attempt ใหม่
      attempts/[attemptId]/route.ts      ← ดึงผลคะแนน+เฉลย+analysis
      attempts/[attemptId]/submit/route.ts ← ตรวจข้อสอบ + Wrong Question + Spaced Repetition
  lib/
    prisma.ts          ← Prisma client singleton
    auth.ts            ← Sync Supabase auth user ↔ Prisma User table
    utils.ts           ← cn() className helper
    storage.ts          ← Upload/signed-URL abstraction (Supabase Storage)
    hash.ts              ← sha256 สำหรับ idempotency
    spaced-repetition.ts  ← Interval schedule (1,3,7,14,30 วัน)
    supabase/
      client.ts         ← Supabase client (Client Components)
      server.ts         ← Supabase client (Server Components/Route Handlers)
    queue/
      connection.ts      ← Redis connection สำหรับ BullMQ
      queues.ts           ← Queue definitions
    ai/
      providers.ts        ← Provider adapters (OpenAI/Anthropic/Gemini/Mistral OCR) ผ่าน fetch ตรง
      prompts.ts           ← Prompt templates (ตรงกับ ai-prompt-templates.md)
      schemas.ts           ← Zod schemas สำหรับ validate ผล AI
      gateway.ts            ← Orchestrator: fallback chain, retry, cost logging, performance analysis
  middleware.ts         ← Refresh session + protect routes
```

## สิ่งที่ยังไม่ได้ทำใน scaffold นี้ (ขั้นต่อไป)

- Wrong Question Review UI (list + practice) — backend logic (WrongQuestion tracking) ทำงานแล้ว
- Flashcards, Library, Folder management UI
- Share Link + Community (Like/Save/Report) + Semantic Search (ต้องเพิ่ม embedding-generation worker)
- Dashboard analytics UI แบบเต็ม (ตอนนี้มี `DashboardStat` อัปเดตอัตโนมัติหลังทำ Quiz แล้ว แต่ยังไม่มีหน้าแสดงผล)
- Cloudflare R2 เป็นทางเลือกแทน Supabase Storage — ถ้าจะเปลี่ยน แก้แค่ `src/lib/storage.ts`
- Cron job สำหรับดึงข้อที่ถึงกำหนด `nextReviewAt` มาแจ้งเตือนผู้ใช้ (ตอนนี้ query ตรงได้ผ่าน mode WRONG_ONLY อยู่แล้ว แต่ยังไม่มี proactive notification)

## หมายเหตุสำคัญเกี่ยวกับ AI Gateway

- `src/lib/ai/providers.ts` เรียก API ตรงผ่าน `fetch` (ไม่พึ่ง SDK) — ต้องมี
  API key ของอย่างน้อย 1 provider ใน `.env` งานถึงจะรันผ่าน (fallback chain
  จะลองทีละตัว: GPT-5 → Claude → Gemini สำหรับ extraction, Mistral OCR →
  Gemini Vision สำหรับ OCR)
- ราคาต่อ token ใน `gateway.ts` เป็นค่าประมาณสำหรับ log/monitor เท่านั้น
  ควรอัปเดตให้ตรงกับราคาจริงของแต่ละ provider ณ เวลาที่ deploy
- Mistral OCR ในโค้ดปัจจุบันส่งไฟล์เป็น base64 inline — ใน production ควร
  เปลี่ยนไปส่ง signed URL แทน (ดูฟังก์ชัน `getSignedDownloadUrl()` ใน
  `storage.ts`) เพื่อลด payload size ของ request
"# Personal-Exam-Trainer" 
