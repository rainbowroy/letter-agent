import OpenAI from "openai";
import { NextRequest } from "next/server";
import {
  buildListenerSystemPrompt,
  buildWriterPrompt,
} from "@/lib/scenarios";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

// 浏览器和后端共享的消息类型
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * POST /api/converse
 * 入参：{ scenarioId, messages: ChatMessage[] }
 * 出参：流式 text/plain
 *
 * 流式协议（自定义）：
 *   - 普通对话内容：直接吐字
 *   - 阶段切换信号：吐一行 \n[[STAGE:writing]]\n （前端遇到这个就知道引导员阶段结束，开始进入写信）
 *   - 写完后：吐一行 \n[[DONE]]\n
 *
 * 内部 Agent Loop 思路：
 *   1. 先用「引导员 System Prompt」+ messages 调一次模型（非流式，一次性拿完整回复）
 *   2. 检查回复里是否包含 [[READY]] 标记：
 *      - 没有 → 把回复流式吐给前端，结束
 *      - 有   → 解析出 JSON，切换到「写作者 Prompt」流式生成信件，吐给前端
 */
export async function POST(req: NextRequest) {
  try {
    const { scenarioId, messages } = (await req.json()) as {
      scenarioId: string;
      messages: ChatMessage[];
    };

    if (!scenarioId || !Array.isArray(messages)) {
      return new Response("缺少 scenarioId 或 messages", { status: 400 });
    }

    const encoder = new TextEncoder();
    const model = process.env.LLM_MODEL || "deepseek-chat";

    // ====== 阶段 A：调用引导员 ======
    const listenerSystem = buildListenerSystemPrompt(scenarioId);
    const listenerResp = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [{ role: "system", content: listenerSystem }, ...messages],
    });
    const listenerText = listenerResp.choices[0]?.message?.content ?? "";

    // 检测 [[READY]] 信号
    const readyMatch = listenerText.match(/\[\[READY\]\]\s*([\s\S]+)/);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!readyMatch) {
            // 还在引导阶段，把引导员的回复直接流式发回
            controller.enqueue(encoder.encode(listenerText));
            controller.close();
            return;
          }

          // 信息够了：解析 JSON
          let collected: { receiver: string; emotion: string; event: string; tone: string };
          try {
            const jsonStr = readyMatch[1].trim();
            collected = JSON.parse(jsonStr);
          } catch (err) {
            console.error("[converse] JSON 解析失败：", readyMatch[1], err);
            controller.enqueue(
              encoder.encode("（信息收集完毕，但格式解析失败。请重新开始一次。）")
            );
            controller.close();
            return;
          }

          // ====== 阶段切换信号 ======
          controller.enqueue(encoder.encode("\n[[STAGE:writing]]\n"));

          // ====== 阶段 B：调用写作者（流式） ======
          const { system, user } = buildWriterPrompt(scenarioId, collected);
          const writerStream = await client.chat.completions.create({
            model,
            temperature: 0.85,
            stream: true,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          });
          for await (const chunk of writerStream) {
            const t = chunk.choices[0]?.delta?.content || "";
            if (t) controller.enqueue(encoder.encode(t));
          }
          controller.close();
        } catch (err) {
          console.error("[converse stream] error:", err);
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
    console.error("[/api/converse] error:", err);
    return new Response(message, { status: 500 });
  }
}
