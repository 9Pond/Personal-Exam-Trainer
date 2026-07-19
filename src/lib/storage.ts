import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "exam-uploads";

/**
 * Storage layer แยกจาก business logic โดยเจตนา — ถ้าจะเปลี่ยนไปใช้
 * Cloudflare R2 แทน Supabase Storage ในอนาคต แก้แค่ไฟล์นี้ไฟล์เดียว
 * ส่วนที่เหลือของระบบเรียกผ่าน uploadFile()/getPublicUrl() เท่านั้น
 */
export async function uploadFile(params: {
  path: string; // เช่น `${userId}/${examId}/page-1.png`
  buffer: Buffer;
  contentType: string;
}): Promise<{ path: string; url: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(params.path, params.buffer, {
      contentType: params.contentType,
      upsert: false, // ห้ามเขียนทับ — ถ้าซ้ำ path แสดงว่ามี bug ที่อื่น
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(params.path);

  return { path: params.path, url: data.publicUrl };
}

export async function getSignedDownloadUrl(path: string, expiresInSec = 3600) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}
