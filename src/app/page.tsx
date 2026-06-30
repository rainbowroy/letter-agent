"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, getScenario } from "@/lib/scenarios";

type Stage = "pick" | "chatting" | "writing" | "polishing" | "rewriting" | "done";
type ChatMessage = { role: "user" | "assistant"; content: string };
type PolishResult = { score: number; issues: string[]; suggestions: string };

export default function Home() {
  const [stage, setStage] = useState<Stage>("pick");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [letter, setLetter] = useState("");
  const [polishHistory, setPolishHistory] = useState<PolishResult[]>([]);
  const [showThinking, setShowThinking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scenario = getScenario(scenarioId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, letter, stage, polishHistory]);

  function reset() {
    setStage("pick");
    setScenarioId("");
    setMessages([]);
    setInput("");
    setLetter("");
    setPolishHistory([]);
    setError("");
  }

  async function pickScenario(id: string) {
    setScenarioId(id);
    setStage("chatting");
    setMessages([]);
    setLetter("");
    setPolishHistory([]);
    setError("");
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
   * 解析自定义流协议：
   *   - 普通字符 → 当前阶段对应的"消息/信件"区
   *   - [[STAGE:writing|polishing|rewriting|done]] → 切阶段
   *   - [[POLISH:json]] + 后面那行 JSON → 加到评分历史
   */
  async function runConverse(sid: string, msgs: ChatMessage[]) {
    setLoading(true);
    setError("");

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
      let currentStage: Stage = "chatting";

      const consume = (text: string) => {
        if (currentStage === "chatting") {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: (copy[copy.length - 1]?.content || "") + text };
            return copy;
          });
        } else if (currentStage === "writing") {
          setLetter((prev) => prev + text);
        } else if (currentStage === "rewriting") {
          setLetter((prev) => prev + text);
        }
        // polishing 阶段的 JSON 通过 [[POLISH:json]] 标记单独处理
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 持续消费 buffer 中已可识别的标记，剩余文本作为普通输出
        // 思路：找到下一个 [[ 标记，把标记之前的纯文本输出，然后处理标记
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const idx = buffer.indexOf("[[");
          if (idx === -1) {
            // 没有标记 → 全部作为纯文本输出
            if (buffer) {
              consume(buffer);
              buffer = "";
            }
            break;
          }

          // 标记之前的纯文本先输出
          if (idx > 0) {
            consume(buffer.slice(0, idx));
            buffer = buffer.slice(idx);
          }

          // 现在 buffer 以 [[ 开头，尝试找到 ]] 结尾
          const end = buffer.indexOf("]]");
          if (end === -1) {
            // 标记还没完整，等下一块
            break;
          }
          const marker = buffer.slice(2, end);
          buffer = buffer.slice(end + 2);

          if (marker.startsWith("STAGE:")) {
            const next = marker.slice("STAGE:".length) as Stage;
            if (next === "rewriting") {
              setLetter(""); // 重写时清空信件区，从头开始流
            }
            currentStage = next;
            setStage(next);
          } else if (marker === "POLISH:json") {
            // 后续到下一个 \n 之前是 JSON
            const nl = buffer.indexOf("\n");
            if (nl === -1) {
              // 不完整，把 marker 还回去等下一块
              buffer = "[[POLISH:json]]" + buffer;
              break;
            }
            const jsonStr = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            try {
              const p = JSON.parse(jsonStr);
              setPolishHistory((prev) => [...prev, p]);
            } catch {
              /* ignore */
            }
          }
        }
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
            三角色 Agent：倾听 → 写作 → 自我评审 → 必要时重写
          </p>
        </header>

        {stage !== "pick" && <ProgressBar stage={stage} />}

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

        {stage !== "pick" && scenario && (
          <>
            {/* 对话区 */}
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
                {loading && stage === "chatting" && messages[messages.length - 1]?.content === "" && (
                  <div className="text-sm text-stone-400">AI 正在思考…</div>
                )}
              </div>

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

            {/* Agent 思考过程 */}
            {polishHistory.length > 0 && (
              <section className="mt-6">
                <button
                  onClick={() => setShowThinking((v) => !v)}
                  className="mb-2 text-xs text-stone-500 hover:text-rose-600"
                >
                  {showThinking ? "▾" : "▸"} Agent 思考过程（{polishHistory.length} 次评审）
                </button>
                {showThinking && (
                  <div className="space-y-2 rounded-xl border border-dashed border-stone-300 bg-white/60 p-4">
                    {polishHistory.map((p, i) => (
                      <PolishCard key={i} index={i + 1} polish={p} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 信件输出 */}
            {(stage === "writing" || stage === "polishing" || stage === "rewriting" || stage === "done") && (
              <section className="mt-6">
                <h2 className="mb-3 text-base font-medium text-stone-700">
                  ✍️ 你的信
                  {stage === "writing" && <StageHint text="写初稿…" />}
                  {stage === "polishing" && <StageHint text="评审中…" />}
                  {stage === "rewriting" && <StageHint text="根据反馈重写…" />}
                </h2>
                <div
                  className="min-h-[260px] whitespace-pre-wrap rounded-xl border border-stone-200 bg-white p-8 leading-loose text-stone-800 shadow-sm"
                  style={{ fontFamily: '"Songti SC", "STSong", "SimSun", serif' }}
                >
                  {letter}
                  {(stage === "writing" || stage === "rewriting") && (
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
          </>
        )}

        <div ref={bottomRef} />

        <footer className="mt-16 text-center text-xs text-stone-400">
          Week 4 · Self-Critique Agent · 倾听 → 写作 → 评审 → 重写
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
          isUser ? "bg-rose-500 text-white" : "bg-stone-100 text-stone-800"
        }`}
      >
        {content || (isUser ? "" : "…")}
      </div>
    </div>
  );
}

function StageHint({ text }: { text: string }) {
  return <span className="ml-2 text-sm text-rose-500">{text}</span>;
}

function PolishCard({ index, polish }: { index: number; polish: PolishResult }) {
  const color =
    polish.score >= 80 ? "text-emerald-600" : polish.score >= 60 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="rounded-lg bg-white p-3 text-xs text-stone-700 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-medium">第 {index} 版评审</span>
        <span className={`font-bold ${color}`}>{polish.score} 分</span>
      </div>
      {polish.issues.length > 0 && (
        <ul className="ml-4 list-disc space-y-0.5 text-stone-600">
          {polish.issues.map((iss, i) => (
            <li key={i}>{iss}</li>
          ))}
        </ul>
      )}
      {polish.suggestions && (
        <div className="mt-1.5 text-stone-500">💡 {polish.suggestions}</div>
      )}
    </div>
  );
}

function ProgressBar({ stage }: { stage: Stage }) {
  const order: Stage[] = ["chatting", "writing", "polishing", "rewriting", "done"];
  const labels: Record<Stage, string> = {
    pick: "选场景",
    chatting: "倾听",
    writing: "写作",
    polishing: "评审",
    rewriting: "重写",
    done: "完成",
  };
  const idx = order.indexOf(stage);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              i === idx
                ? "animate-pulse bg-rose-500"
                : i < idx
                ? "bg-rose-400"
                : "bg-stone-300"
            }`}
          />
          <span
            className={
              i === idx ? "text-rose-600" : i < idx ? "text-stone-600" : "text-stone-400"
            }
          >
            {labels[s]}
          </span>
          {i < order.length - 1 && <span className="h-px w-4 bg-stone-300" />}
        </div>
      ))}
    </div>
  );
}
