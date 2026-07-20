import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ message: "API ทำงานได้แล้ว!" });
}