import OpenAI from "openai";
import { NextRequest } from "next/server";
import { buildPrompt } from "@/lib/scenarios";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

/**
 * POST /api/generate
 * 入参：{ scenarioId: string, form: Record<string,string> }
 * 出参：流式 text/plain 响应 —— 文字一段段蹦出来，前端用 ReadableStream 读取。
 *
 * 为什么用流式？
 *  - 一封 500 字的信生成需要 8-15 秒，一次性返回用户会以为页面卡死。
 *  - 流式输出让用户在第 1 秒就能看到字，体验从"等待"变成"沉浸"。
 */
export async function POST(req: NextRequest) {
  try {
    const { scenarioId, form } = await req.json();
    if (!scenarioId || !form) {
      return new Response("缺少 scenarioId 或 form 参数", { status: 400 });
    }

    const userPrompt = buildPrompt(scenarioId, form);

    // 关键：stream: true
    const completion = await client.chat.completions.create({
      model: process.env.LLM_MODEL || "deepseek-chat",
      stream: true,
      temperature: 0.85,
      messages: [
        {
          role: "system",
          content:
            "你是一位中文书信写作大师，擅长写出有温度、有细节、不套路的家书、情书和道歉信。你写的信能让收信人哭、能让收信人笑、能让一段关系真正被修复。",
        },
        { role: "user", content: userPrompt },
      ],
    });

    // 把 OpenAI 的流转换成浏览器能读的流
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          console.error("[stream] error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[/api/generate] error:", err);
    return new Response(message, { status: 500 });
  }
}
