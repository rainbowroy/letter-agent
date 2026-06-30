import OpenAI from "openai";
import { NextRequest } from "next/server";
import {
  buildFullRewriterPrompt,
  buildSegmentRewriterPrompt,
  type Collected,
} from "@/lib/scenarios";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

type RewriteRequest = {
  mode: "full" | "segment";
  scenarioId: string;
  collected: Collected;
  styleId?: string;
  letter: string;
  selection?: string;
  userInstruction?: string;
};

/**
 * POST /api/rewrite
 *   mode=full    → 重写整封；返回流式纯文本（信件正文）
 *   mode=segment → 重写选段；返回流式纯文本（仅新片段）
 *
 * 两种模式都严格遵守事实纪律（在 Prompt 里强约束）。
 * 不再调用 polisher / tool loop，保持简单可控。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RewriteRequest;
    const { mode, scenarioId, collected, styleId, letter, selection, userInstruction } = body;

    if (!scenarioId || !collected || !letter) {
      return new Response("缺少必要参数：scenarioId / collected / letter", { status: 400 });
    }
    if (mode === "segment" && !selection) {
      return new Response("选段重写需要 selection 字段", { status: 400 });
    }

    const { system, user } =
      mode === "segment"
        ? buildSegmentRewriterPrompt(scenarioId, collected, letter, selection!, userInstruction, styleId)
        : buildFullRewriterPrompt(scenarioId, collected, letter, userInstruction, styleId);

    const model = process.env.LLM_MODEL || "deepseek-chat";
    const completion = await client.chat.completions.create({
      model,
      temperature: mode === "segment" ? 0.7 : 0.85,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const t = chunk.choices[0]?.delta?.content || "";
            if (t) controller.enqueue(encoder.encode(t));
          }
          controller.close();
        } catch (err) {
          console.error("[rewrite stream]", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[/api/rewrite] error:", err);
    return new Response(message, { status: 500 });
  }
}
