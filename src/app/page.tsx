"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import { LETTER_STYLES, getStyle, type StyleId } from "@/lib/styles";
import {
  loadHistory,
  saveHistory,
  deleteHistory,
  formatDate,
  type HistoryItem,
} from "@/lib/history";

type Stage = "pick" | "chatting" | "writing" | "polishing" | "rewriting" | "done";
type ChatMessage = { role: "user" | "assistant"; content: string };
type PolishResult = { score: number; issues: string[]; suggestions: string };

export default function Home() {
  const [stage, setStage] = useState<Stage>("pick");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [styleId, setStyleId] = useState<StyleId>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [letter, setLetter] = useState("");
  const [polishHistory, setPolishHistory] = useState<PolishResult[]>([]);
  const [showThinking, setShowThinking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false); // 避免重复保存
  const [collectedSnapshot, setCollectedSnapshot] = useState<{ receiver: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLDivElement>(null);

  const scenario = getScenario(scenarioId);
  const currentStyle = getStyle(styleId);

  // 首次加载从 localStorage 读历史
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, letter, stage, polishHistory]);

  // stage 变 done 且尚未保存 → 自动入库
  useEffect(() => {
    if (stage === "done" && letter && !savedOnce && scenario) {
      const item = saveHistory({
        scenarioId,
        scenarioTitle: scenario.title,
        styleId,
        styleName: currentStyle.name,
        receiver: collectedSnapshot?.receiver || "",
        letter,
      });
      setHistory((prev) => [item, ...prev.filter((p) => p.id !== item.id)].slice(0, 10));
      setSavedOnce(true);
    }
  }, [stage, letter, savedOnce, scenario, scenarioId, styleId, currentStyle.name, collectedSnapshot]);

  function reset() {
    setStage("pick");
    setScenarioId("");
    setStyleId("default");
    setMessages([]);
    setInput("");
    setLetter("");
    setPolishHistory([]);
    setError("");
    setSavedOnce(false);
    setCollectedSnapshot(null);
  }

  async function pickScenario(id: string) {
    setScenarioId(id);
    setStage("chatting");
    setMessages([]);
    setLetter("");
    setPolishHistory([]);
    setError("");
    setSavedOnce(false);
    setCollectedSnapshot(null);
    await runConverse(id, [], styleId);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    // 简单提取一下"收信人"作为历史 preview（最早一条用户消息常包含）
    if (!collectedSnapshot && /给|写给/.test(text)) {
      setCollectedSnapshot({ receiver: text.slice(0, 12) });
    }
    await runConverse(scenarioId, newMessages, styleId);
  }

  async function runConverse(sid: string, msgs: ChatMessage[], sty: StyleId) {
    setLoading(true);
    setError("");
    setMessages([...msgs, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: sid, messages: msgs, styleId: sty }),
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
            copy[copy.length - 1] = {
              role: "assistant",
              content: (copy[copy.length - 1]?.content || "") + text,
            };
            return copy;
          });
        } else if (currentStage === "writing" || currentStage === "rewriting") {
          setLetter((prev) => prev + text);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const idx = buffer.indexOf("[[");
          if (idx === -1) {
            if (buffer) {
              consume(buffer);
              buffer = "";
            }
            break;
          }
          if (idx > 0) {
            consume(buffer.slice(0, idx));
            buffer = buffer.slice(idx);
          }
          const end = buffer.indexOf("]]");
          if (end === -1) break;
          const marker = buffer.slice(2, end);
          buffer = buffer.slice(end + 2);

          if (marker.startsWith("STAGE:")) {
            const next = marker.slice("STAGE:".length) as Stage;
            if (next === "rewriting") setLetter("");
            currentStage = next;
            setStage(next);
          } else if (marker === "POLISH:json") {
            const nl = buffer.indexOf("\n");
            if (nl === -1) {
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

  async function exportPng() {
    if (!letterRef.current) return;
    try {
      const dataUrl = await toPng(letterRef.current, {
        pixelRatio: 2,
        backgroundColor: "#fffaf3",
      });
      const link = document.createElement("a");
      link.download = `letter-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("[exportPng]", e);
      setError("导出图片失败：" + (e instanceof Error ? e.message : "未知错误"));
    }
  }

  function openHistory(item: HistoryItem) {
    setLetter(item.letter);
    setScenarioId(item.scenarioId);
    setStyleId(item.styleId as StyleId);
    setStage("done");
    setSavedOnce(true);
    setPolishHistory([]);
    setShowHistory(false);
  }

  function removeHistory(id: string) {
    setHistory(deleteHistory(id));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-stone-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-stone-800">✉️ 情感书信助手</h1>
            <p className="mt-2 text-sm text-stone-600">
              倾听 → 写作 → 评审 → 必要时重写 · 4 角色 Agent
            </p>
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="ml-4 rounded-full border border-stone-300 bg-white/70 px-3 py-1.5 text-xs text-stone-600 transition hover:border-rose-400 hover:text-rose-600"
            title="历史记录"
          >
            📚 历史 {history.length > 0 && `(${history.length})`}
          </button>
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
                  <p className="mt-2 text-sm leading-relaxed text-stone-500">{s.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-10 rounded-xl border border-dashed border-stone-300 bg-white/60 p-5">
              <h3 className="mb-3 text-sm font-medium text-stone-700">🎨 文学风格（任意时刻可改）</h3>
              <div className="flex flex-wrap gap-2">
                {LETTER_STYLES.map((s) => (
                  <StyleChip
                    key={s.id}
                    style={s}
                    active={styleId === s.id}
                    onClick={() => setStyleId(s.id)}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-500">
                当前：<span className="font-medium text-rose-600">{currentStyle.name}</span> ·{" "}
                {currentStyle.description}
              </p>
            </div>
          </section>
        )}

        {stage !== "pick" && scenario && (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-medium text-stone-700">
                  {scenario.emoji} {scenario.title} · {currentStyle.emoji} {currentStyle.name}
                </h2>
                <button
                  onClick={reset}
                  className="text-xs text-stone-500 hover:text-rose-600"
                >
                  重新开始
                </button>
              </div>

              {/* 对话区（done 状态隐藏，腾出空间给信件） */}
              {stage !== "done" && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-white/70 p-5 shadow-sm">
                  {messages.map((m, i) => (
                    <Bubble key={i} role={m.role} content={m.content} />
                  ))}
                  {loading &&
                    stage === "chatting" &&
                    messages[messages.length - 1]?.content === "" && (
                      <div className="text-sm text-stone-400">AI 正在思考…</div>
                    )}
                </div>
              )}

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

            {(stage === "writing" ||
              stage === "polishing" ||
              stage === "rewriting" ||
              stage === "done") && (
              <section className="mt-6">
                <h2 className="mb-3 text-base font-medium text-stone-700">
                  ✍️ 你的信
                  {stage === "writing" && <StageHint text="写初稿…" />}
                  {stage === "polishing" && <StageHint text="评审中…" />}
                  {stage === "rewriting" && <StageHint text="根据反馈重写…" />}
                </h2>

                <div
                  ref={letterRef}
                  className="rounded-xl border border-stone-200 bg-[#fffaf3] p-10 shadow-sm"
                  style={{ fontFamily: '"Songti SC", "STSong", "SimSun", serif' }}
                >
                  <div className="whitespace-pre-wrap leading-loose text-stone-800">
                    {letter}
                    {(stage === "writing" || stage === "rewriting") && (
                      <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-rose-400 align-middle" />
                    )}
                  </div>
                  {stage === "done" && (
                    <div className="mt-8 border-t border-stone-200 pt-4 text-right text-xs text-stone-400">
                      —— 由 letter.agent 辅助写作 ·{" "}
                      {currentStyle.name !== "默认" && `${currentStyle.name} 风格`}
                    </div>
                  )}
                </div>

                {stage === "done" && letter && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(letter)}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-rose-400 hover:text-rose-600"
                    >
                      📋 复制全文
                    </button>
                    <button
                      onClick={exportPng}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-rose-400 hover:text-rose-600"
                    >
                      🖼️ 导出图片
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
          Week 5 · 4 风格 · 本地历史 · 导出图片
        </footer>
      </div>

      {/* 历史抽屉 */}
      {showHistory && (
        <HistoryDrawer
          history={history}
          onClose={() => setShowHistory(false)}
          onOpen={openHistory}
          onDelete={removeHistory}
        />
      )}
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
    polish.score >= 80
      ? "text-emerald-600"
      : polish.score >= 60
      ? "text-amber-600"
      : "text-rose-600";
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

function StyleChip({
  style,
  active,
  onClick,
}: {
  style: (typeof LETTER_STYLES)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-rose-500 bg-rose-500 text-white shadow-sm"
          : "border-stone-300 bg-white text-stone-700 hover:border-rose-400 hover:text-rose-600"
      }`}
      title={style.description}
    >
      {style.emoji} {style.name}
    </button>
  );
}

function HistoryDrawer({
  history,
  onClose,
  onOpen,
  onDelete,
}: {
  history: HistoryItem[];
  onClose: () => void;
  onOpen: (h: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-stone-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-stone-50 shadow-xl">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h2 className="text-base font-medium text-stone-800">📚 历史记录（最近 10 封）</h2>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-rose-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="mt-20 text-center text-sm text-stone-400">
              还没有写过信。
              <br />
              写完一封后，会自动保存在这里。
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="group rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:border-rose-300"
                >
                  <button
                    onClick={() => onOpen(h)}
                    className="block w-full text-left"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs text-stone-500">
                      <span className="rounded bg-stone-100 px-1.5 py-0.5">{h.scenarioTitle}</span>
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600">
                        {h.styleName}
                      </span>
                      <span className="ml-auto">{formatDate(h.createdAt)}</span>
                    </div>
                    <div className="text-sm leading-relaxed text-stone-700 line-clamp-2">
                      {h.preview}…
                    </div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => onDelete(h.id)}
                      className="text-xs text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
