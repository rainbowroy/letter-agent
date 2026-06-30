import OpenAI from "openai";
import { NextRequest } from "next/server";
import {
  buildListenerSystemPrompt,
  buildWriterPrompt,
  buildPolisherPrompt,
  buildRewriterPrompt,
} from "@/lib/scenarios";
import { TOOL_SCHEMAS, executeTool } from "@/lib/tools";

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
 *   [[TOOL:json]]        → 紧跟一行 JSON，前端展示 Agent 工具调用
 */
export async function POST(req: NextRequest) {
  try {
    const { scenarioId, messages, styleId } = (await req.json()) as {
      scenarioId: string;
      messages: ChatMessage[];
      styleId?: string;
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
          let draft = await streamWriter(controller, encoder, model, collected, scenarioId, styleId);

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
              polish,
              styleId
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
  scenarioId: string,
  styleId?: string
): Promise<string> {
  const { system, user } = buildWriterPrompt(scenarioId, collected, styleId);
  return runWriterWithTools(controller, encoder, model, system, user);
}

async function streamRewriter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
  collected: Collected,
  scenarioId: string,
  prevDraft: string,
  feedback: PolishResult,
  styleId?: string
): Promise<string> {
  const { system, user } = buildRewriterPrompt(scenarioId, collected, prevDraft, feedback, styleId);
  return runWriterWithTools(controller, encoder, model, system, user);
}

/**
 * Tool-Use Loop：
 *   先用 non-stream 让模型决定是否调工具；
 *   每轮把工具结果反馈给前端（[[TOOL:json]] 协议）+ 喂回模型；
 *   最多 3 轮；最后一轮拿到的助手消息文本既转发为流（伪流式：分块发）也作为 draft 返回。
 */
const MAX_TOOL_ROUNDS = 3;

async function runWriterWithTools(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  model: string,
  system: string,
  user: string
): Promise<string> {
  const send = (s: string) => controller.enqueue(encoder.encode(s));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.85,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
    });
    const msg = resp.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      // 没有工具调用 → 这就是最终回答，流式回放（按字符分块）
      const finalText = msg.content || "";
      await streamReplay(controller, encoder, finalText);
      return finalText.trim();
    }

    // 把 assistant 这条带 tool_calls 的消息放回上下文
    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    // 逐个执行工具并把结果回灌
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsed = {};
      }
      const result = executeTool(call.function.name, parsed);
      send(
        `\n[[TOOL:json]]${JSON.stringify({
          name: call.function.name,
          args: parsed,
          result,
        })}\n`
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    // 进入下一轮：模型可能继续调工具，也可能给出最终文本
  }

  // 工具轮次用尽 → 强制要一次最终文本（不再允许调工具）
  const finalResp = await client.chat.completions.create({
    model,
    temperature: 0.85,
    stream: true,
    messages,
  });
  let buffer = "";
  for await (const chunk of finalResp) {
    const t = chunk.choices[0]?.delta?.content || "";
    if (t) {
      buffer += t;
      controller.enqueue(encoder.encode(t));
    }
  }
  return buffer.trim();
}

/** 把已得到的完整文本伪流式回放，保持前端打字机体验 */
async function streamReplay(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  text: string
): Promise<void> {
  const CHUNK = 4;
  for (let i = 0; i < text.length; i += CHUNK) {
    controller.enqueue(encoder.encode(text.slice(i, i + CHUNK)));
    // 轻微 yield，让前端有节奏感（生产环境可关掉）
    await new Promise((r) => setTimeout(r, 8));
  }
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
