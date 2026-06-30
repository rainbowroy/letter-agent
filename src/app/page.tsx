"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, getScenario } from "@/lib/scenarios";

type Stage = "pick" | "chatting" | "writing" | "done";
type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [stage, setStage] = useState<Stage>("pick");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scenario = getScenario(scenarioId);

  // 自动滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, letter, stage]);

  function reset() {
    setStage("pick");
    setScenarioId("");
    setMessages([]);
    setInput("");
    setLetter("");
    setError("");
  }

  async function pickScenario(id: string) {
    setScenarioId(id);
    setStage("chatting");
    setMessages([]);
    setLetter("");
    setError("");
    // 让 AI 主动开场
    await runConverse(id, []);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    await runConverse(scenarioId, newMessages);
  }

  /**
   * 调用 /api/converse 并解析流：
   * - 常规文本 → 拼接到当前 assistant 消息
   * - 遇到 [[STAGE:writing]] → 切阶段，开始往 letter 写
   */
  async function runConverse(sid: string, msgs: ChatMessage[]) {
    setLoading(true);
    setError("");

    // 预先放一个空的 assistant 占位
    setMessages([...msgs, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: sid, messages: msgs }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let switched = false; // 是否已切到 writing 阶段

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!switched) {
          const idx = buffer.indexOf("[[STAGE:writing]]");
          if (idx >= 0) {
            // 阶段切换：buffer 前半部分作为引导员收尾（其实是空），后半部分作为信件起点
            const beforeStage = buffer.slice(0, idx);
            const afterStage = buffer.slice(idx + "[[STAGE:writing]]".length);
            // 把残留的引导员文字（通常是 [[READY]] + JSON）丢掉，不显示给用户
            void beforeStage;
            switched = true;
            buffer = afterStage.replace(/^\s+/, "");
            setStage("writing");
            setLetter(buffer);
          } else {
            // 还是引导员阶段：实时更新最后一条 assistant
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: buffer };
              return copy;
            });
          }
        } else {
          setLetter((prev) => prev + decoder.decode(value, { stream: true }));
        }
      }

      // 结束时根据是否切换过判断终态
      if (switched) {
        setStage("done");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-stone-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">
            ✉️ 情感书信助手
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            和 AI 聊几句，让 TA 帮你写一封不套路的中文书信。
          </p>
        </header>

        {/* 进度指示 */}
        {stage !== "pick" && (
          <div className="mb-6 flex items-center justify-center gap-3 text-xs">
            <StageDot label="选场景" active={false} done />
            <Bar />
            <StageDot label="倾听引导" active={stage === "chatting"} done={stage !== "chatting"} />
            <Bar />
            <StageDot label="落笔写信" active={stage === "writing"} done={stage === "done"} />
          </div>
        )}

        {/* ===== Step 1: 选场景 ===== */}
        {stage === "pick" && (
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

        {/* ===== Step 2: 聊天引导 ===== */}
        {(stage === "chatting" || stage === "writing" || stage === "done") && scenario && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium text-stone-700">
                {scenario.emoji} {scenario.title}
              </h2>
              <button onClick={reset} className="text-xs text-stone-500 hover:text-rose-600">
                重新开始
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-stone-200 bg-white/70 p-5 shadow-sm">
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}

              {/* 加载点点 */}
              {loading && stage === "chatting" && (
                <div className="text-sm text-stone-400">AI 正在思考…</div>
              )}
            </div>

            {/* 输入框 */}
            {stage === "chatting" && (
              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800 outline-none focus:border-rose-400"
                  placeholder="说出你的想法…"
                  value={input}
                  disabled={loading}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-rose-500 px-5 py-2 font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  发送
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                出错了：{error}
              </div>
            )}
          </section>
        )}

        {/* ===== Step 3: 信件输出 ===== */}
        {(stage === "writing" || stage === "done") && (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-medium text-stone-700">
              ✍️ 你的信
              {stage === "writing" && (
                <span className="ml-2 text-sm text-rose-500">AI 正在落笔…</span>
              )}
            </h2>
            <div
              className="min-h-[260px] whitespace-pre-wrap rounded-xl border border-stone-200 bg-white p-8 leading-loose text-stone-800 shadow-sm"
              style={{ fontFamily: '"Songti SC", "STSong", "SimSun", serif' }}
            >
              {letter}
              {stage === "writing" && (
                <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-rose-400 align-middle" />
              )}
            </div>
            {stage === "done" && letter && (
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(letter)}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-rose-400 hover:text-rose-600"
                >
                  📋 复制全文
                </button>
                <button
                  onClick={reset}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600"
                >
                  ✨ 写下一封
                </button>
              </div>
            )}
          </section>
        )}

        <div ref={bottomRef} />

        <footer className="mt-16 text-center text-xs text-stone-400">
          Week 3 · MVP v0.2 · Agent 雏形：引导员 + 写作者双角色
        </footer>
      </div>
    </main>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-rose-500 text-white"
            : "bg-stone-100 text-stone-800"
        }`}
      >
        {content || (isUser ? "" : "…")}
      </div>
    </div>
  );
}

function StageDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          active ? "animate-pulse bg-rose-500" : done ? "bg-rose-400" : "bg-stone-300"
        }`}
      />
      <span className={active ? "text-rose-600" : done ? "text-stone-600" : "text-stone-400"}>
        {label}
      </span>
    </div>
  );
}

function Bar() {
  return <span className="h-px w-6 bg-stone-300" />;
}
