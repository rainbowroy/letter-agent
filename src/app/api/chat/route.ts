import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

// 1. 用环境变量初始化客户端（兼容 OpenAI / DeepSeek 等所有 OpenAI 兼容 API）
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

// 2. POST /api/chat —— 接收 { prompt: string }，返回 { reply: string }
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "请在请求体中提供 prompt 字符串" },
        { status: 400 }
      );
    }

    // 3. 调用大模型（这是整个 Agent 的"大脑接口"）
    const completion = await client.chat.completions.create({
      model: process.env.LLM_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是一位温柔细腻的中文书信写作助手，擅长帮人表达真实情感。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[/api/chat] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
