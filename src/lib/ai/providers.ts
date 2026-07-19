/**
 * Provider adapters — เรียกผ่าน fetch ตรงๆ (ไม่พึ่ง SDK) เพื่อควบคุม
 * request/response ได้เต็มที่ และลด dependency ของโปรเจกต์
 *
 * ทุกฟังก์ชันคืนค่า { text, inputTokens, outputTokens } เป็นรูปแบบเดียวกัน
 * เพื่อให้ gateway.ts เรียกใช้แบบ provider-agnostic ได้
 */

export type LlmResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export async function callAnthropic(
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const textBlock = data.content.find((b: { type: string }) => b.type === "text");

  return {
    text: textBlock?.text ?? "",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<LlmResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    text: data.candidates[0].content.parts[0].text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** OCR: Gemini Vision รับรูปภาพ/PDF โดยตรงเป็น base64 inline data */
export async function ocrWithGeminiVision(
  fileBuffer: Buffer,
  mimeType: string
): Promise<LlmResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "ถอดข้อความทั้งหมดในเอกสารนี้ออกมาแบบคำต่อคำ รวมตาราง สูตร " +
                  "และตัวเลือก A B C D ถ้ามี ตอบเป็นข้อความล้วน ไม่ต้องจัด " +
                  "รูปแบบ markdown ไม่ต้องสรุปหรือตีความ",
              },
              { inline_data: { mime_type: mimeType, data: fileBuffer.toString("base64") } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini Vision OCR error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    text: data.candidates[0].content.parts[0].text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** OCR: Mistral OCR API รองรับ PDF/รูปภาพโดยตรง คืนผลเป็น markdown ต่อหน้า */
export async function ocrWithMistral(
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ pages: string[]; inputTokens: number; outputTokens: number }> {
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: mimeType === "application/pdf" ? "document_url" : "image_url",
        // NOTE: ในการใช้งานจริง ควรส่ง signed URL ของไฟล์ที่อัปโหลดแล้ว
        // แทนการฝัง base64 ตรงนี้ เพื่อลด payload — ดู getSignedDownloadUrl()
        [mimeType === "application/pdf" ? "document_url" : "image_url"]:
          `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Mistral OCR error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const pages: string[] = (data.pages ?? []).map((p: { markdown: string }) => p.markdown);

  return {
    pages,
    inputTokens: data.usage_info?.pages_processed ?? 0,
    outputTokens: 0,
  };
}
