import { createHash } from "crypto";

/** ใช้ตรวจว่าไฟล์นี้เคยอัปโหลด/ประมวลผลแล้วหรือยัง (กัน OCR ซ้ำ) */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
