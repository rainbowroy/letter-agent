"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState(
    "帮我写一句给妈妈的简短问候，提一下她最近腰疼。"
  );
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setReply("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      setReply(data.reply);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-stone-800">
          情感书信助手 · Hello World
        </h1>
        <p className="mb-6 text-stone-600">
          这是 Week 1 的最小可用版本：输入一句话 → 调用大模型 → 显示回复。
        </p>

        <textarea
          className="w-full rounded-lg border border-stone-300 bg-white p-4 text-stone-800 focus:border-rose-400 focus:outline-none"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="说说你想表达的情感…"
        />

        <button
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="mt-4 rounded-lg bg-rose-500 px-6 py-2 font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {loading ? "AI 正在落笔…" : "生成"}
        </button>

        {error && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            出错了：{error}
          </div>
        )}

        {reply && (
          <div className="mt-6 whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-6 leading-relaxed text-stone-800 shadow-sm">
            {reply}
          </div>
        )}
      </div>
    </main>
  );
}
