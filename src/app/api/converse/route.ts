import OpenAI from "openai";
import { NextRequest } from "next/server";
import {
  buildListenerSystemPrompt,
  buildWriterPrompt,
  buildPolisherPrompt,
  buildRewriterPrompt,
} from "@/lib/scenarios";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Collected = {
  receiver: string;
  emotion: string;
  event: string;
  tone: string;
};

type PolishResult = {
  score: number;
  issues: string[];
  suggestions: string;
};

const PASS_SCORE = 80;
const MAX_REWRITES = 1; // 最多重写一次（即第二版即终稿）

/**
 * POST /api/converse
 * 多角色 Agent Loop：
 *   1) 引导员：收集信息（[[READY]] 信号触发切换）
 *   2) 写作者：流式出初稿
 *   3) 润色师：对初稿打分 + 给反馈（JSON）
 *   4) 若分数低，写作者重写一次（流式覆盖）
 *
 * 自定义流协议（前端按这些标记切 UI）：
 *   [[STAGE:writing]]    → 进入"写初稿"
 *   [[STAGE:polishing]]  → 进入"润色评分"
 *   [[POLISH:json]]      → 紧跟一行 JSON，前端展示评分卡
 *   [[STAGE:rewriting]]  → 进入"重写"，需要清空前面的信件区
 *   [[STAGE:done]]       → 全部完成
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

    // ====== 阶段 A：引导员 ======
    const listenerResp = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildListenerSystemPrompt(scenarioId) },
        ...messages,
      ],
    });
    const listenerText = listenerResp.choices[0]?.message?.content ?? "";
    const readyMatch = listenerText.match(/\[\[READY\]\]\s*([\s\S]+)/);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (s: string) => controller.enqueue(encoder.encode(s));
        try {
          if (!readyMatch) {
            send(listenerText);
            controller.close();
            return;
          }

          // 解析收集到的结构化信息
          let collected: Collected;
          try {
            collected = JSON.parse(readyMatch[1].trim());
          } catch (err) {
            console.error("[converse] JSON 解析失败：", readyMatch[1], err);
            send("（信息收集完毕，但格式解析失败。请重新开始一次。）");
            controller.close();
            return;
          }

          // ====== 阶段 B：写作者出初稿（流式，但同时累积成字符串以便后续润色） ======
          send("\n[[STAGE:writing]]\n");
          let draft = await streamWriter(controller, encoder, model, collected, scenarioId);

          // ====== 阶段 C：润色师评分 ======
          send("\n[[STAGE:polishing]]\n");
          let polish = await runPolisher(model, scenarioId, draft, collected);
          send(`[[POLISH:json]]${JSON.stringify(polish)}\n`);

          // ====== 阶段 D：如果分数不够，重写一次 ======
          let rewrites = 0;
          while (polish.score < PASS_SCORE && rewrites < MAX_REWRITES) {
            rewrites += 1;
            send("\n[[STAGE:rewriting]]\n");
            draft = await streamRewriter(
              controller,
              encoder,
              model,
              collected,
              scenarioId,
              draft,
              polish
            );

            send("\n[[STAGE:polishing]]\n");
            polish = await runPolisher(model, scenarioId, draft, collected);
            send(`[[POLISH:json]]${JSON.stringify(polish)}\n`);
          }

          send("\n[[STAGE:done]]\n");
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

// =========================================================================
// 子流程
// =========================================================================

async function streamWriter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
  collected: Collected,
  scenarioId: string
): Promise<string> {
  const { system, user } = buildWriterPrompt(scenarioId, collected);
  let buffer = "";
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
    if (t) {
      buffer += t;
      controller.enqueue(encoder.encode(t));
    }
  }
  return buffer.trim();
}

async function streamRewriter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
  collected: Collected,
  scenarioId: string,
  prevDraft: string,
  feedback: PolishResult
): Promise<string> {
  const { system, user } = buildRewriterPrompt(scenarioId, collected, prevDraft, feedback);
  let buffer = "";
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
    if (t) {
      buffer += t;
      controller.enqueue(encoder.encode(t));
    }
  }
  return buffer.trim();
}

async function runPolisher(
  model: string,
  scenarioId: string,
  draft: string,
  collected: Collected
): Promise<PolishResult> {
  const { system, user } = buildPolisherPrompt(scenarioId, draft, collected);
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" }, // DeepSeek / OpenAI 都支持
  });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      score: typeof parsed.score === "number" ? parsed.score : 70,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: typeof parsed.suggestions === "string" ? parsed.suggestions : "",
    };
  } catch (err) {
    console.error("[polisher] JSON 解析失败：", raw, err);
    return { score: 70, issues: [], suggestions: "" };
  }
}
