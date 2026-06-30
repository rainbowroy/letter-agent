"use client";

import { useState } from "react";
import { SCENARIOS, getScenario } from "@/lib/scenarios";

type Step = "pick" | "form" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("pick");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scenario = getScenario(scenarioId);

  function pickScenario(id: string) {
    setScenarioId(id);
    // 默认填上 select 的第一项，避免用户必须每项都选
    const sc = getScenario(id);
    const initial: Record<string, string> = {};
    sc?.fields.forEach((f) => {
      if (f.type === "select" && f.options?.length) initial[f.key] = f.options[0];
    });
    setForm(initial);
    setStep("form");
  }

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function isFormReady(): boolean {
    if (!scenario) return false;
    return scenario.fields.every((f) => !f.required || (form[f.key] && form[f.key].trim()));
  }

  async function handleGenerate() {
    setStep("result");
    setLetter("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, form }),
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }

      // 关键：读取流式响应，文字一段段拼接
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setLetter((prev) => prev + chunk);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("pick");
    setScenarioId("");
    setForm({});
    setLetter("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-stone-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-stone-800">
            ✉️ 情感书信助手
          </h1>
          <p className="mt-3 text-stone-600">
            说出你想表达的，让 AI 帮你写出有温度、不套路的中文书信。
          </p>
        </header>

        {/* ============ 步骤 1：选场景 ============ */}
        {step === "pick" && (
          <section>
            <h2 className="mb-4 text-lg font-medium text-stone-700">想写哪种信？</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickScenario(s.id)}
                  className="group rounded-xl border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-rose-300 hover:shadow-md"
                >
                  <div className="mb-2 text-3xl">{s.emoji}</div>
                  <div className="text-lg font-semibold text-stone-800 group-hover:text-rose-600">
                    {s.title}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500">
                    {s.description}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ============ 步骤 2：填表单 ============ */}
        {step === "form" && scenario && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-medium text-stone-700">
                {scenario.emoji} {scenario.title} · 填写信息
              </h2>
              <button
                onClick={reset}
                className="text-sm text-stone-500 hover:text-rose-600"
              >
                ← 重新选择
              </button>
            </div>

            <div className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
              {scenario.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    {f.label}
                    {f.required && <span className="ml-1 text-rose-500">*</span>}
                  </label>
                  {f.type === "text" && (
                    <input
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-rose-400"
                      value={form[f.key] || ""}
                      placeholder={f.placeholder}
                      onChange={(e) => updateField(f.key, e.target.value)}
                    />
                  )}
                  {f.type === "textarea" && (
                    <textarea
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-rose-400"
                      rows={3}
                      value={form[f.key] || ""}
                      placeholder={f.placeholder}
                      onChange={(e) => updateField(f.key, e.target.value)}
                    />
                  )}
                  {f.type === "select" && (
                    <select
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800 outline-none focus:border-rose-400"
                      value={form[f.key] || ""}
                      onChange={(e) => updateField(f.key, e.target.value)}
                    >
                      {f.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              <button
                onClick={handleGenerate}
                disabled={!isFormReady()}
                className="w-full rounded-lg bg-rose-500 px-6 py-3 font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                生成这封信 ✨
              </button>
            </div>
          </section>
        )}

        {/* ============ 步骤 3：流式结果 ============ */}
        {step === "result" && scenario && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-medium text-stone-700">
                {scenario.emoji} 你的{scenario.title}
                {loading && (
                  <span className="ml-3 text-sm text-rose-500">AI 正在落笔…</span>
                )}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("form")}
                  className="text-sm text-stone-500 hover:text-rose-600"
                  disabled={loading}
                >
                  ← 修改信息
                </button>
                <button
                  onClick={reset}
                  className="text-sm text-stone-500 hover:text-rose-600"
                  disabled={loading}
                >
                  重新开始
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
                出错了：{error}
              </div>
            )}

            <div
              className="min-h-[300px] whitespace-pre-wrap rounded-xl border border-stone-200 bg-white p-8 font-serif leading-loose text-stone-800 shadow-sm"
              style={{ fontFamily: '"Songti SC", "STSong", "SimSun", serif' }}
            >
              {letter || (loading ? "" : "（暂无内容）")}
              {loading && <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-rose-400 align-middle" />}
            </div>

            {!loading && letter && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(letter)}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-rose-400 hover:text-rose-600"
                >
                  📋 复制全文
                </button>
                <button
                  onClick={handleGenerate}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600"
                >
                  🔄 再生成一版
                </button>
              </div>
            )}
          </section>
        )}

        <footer className="mt-16 text-center text-xs text-stone-400">
          Week 2 · MVP v0.1 · 表单 + 流式输出 · 由 DeepSeek 驱动
        </footer>
      </div>
    </main>
  );
}
