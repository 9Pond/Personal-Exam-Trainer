/**
 * Spaced Repetition — fixed interval schedule ตาม PRD: 1, 3, 7, 14, 30 วัน
 * ตอบถูก → เลื่อนไป stage ถัดไป, ตอบผิด → รีเซ็ตกลับ stage แรก
 */
export const INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export function nextReviewDate(stage: number): Date {
  const clampedStage = Math.min(stage, INTERVAL_DAYS.length - 1);
  const days = INTERVAL_DAYS[clampedStage];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function isFullyResolved(stage: number): boolean {
  // ผ่านครบทุก interval แล้ว (ตอบถูกต่อเนื่องจนถึง stage สุดท้าย + ตอบถูกอีกครั้ง)
  return stage >= INTERVAL_DAYS.length;
}
