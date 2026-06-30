/**
 * 本地历史记录：用 localStorage 存最近 N 封信。
 * 不需要后端，刷新页面/重开浏览器都还在。
 * 等 W6 之后再升级到 Supabase 云端存储（多端同步）。
 */

export interface HistoryItem {
  id: string; // 时间戳字符串
  createdAt: number;
  scenarioId: string;
  scenarioTitle: string;
  styleId: string;
  styleName: string;
  receiver: string;
  preview: string; // 前 40 字
  letter: string; // 完整信件
}

const KEY = "letter-agent.history";
const MAX = 10;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(item: Omit<HistoryItem, "id" | "createdAt" | "preview">): HistoryItem {
  const now = Date.now();
  const full: HistoryItem = {
    ...item,
    id: String(now),
    createdAt: now,
    preview: item.letter.replace(/\s+/g, " ").slice(0, 40),
  };
  const list = [full, ...loadHistory()].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded, ignore */
  }
  return full;
}

export function deleteHistory(id: string): HistoryItem[] {
  const list = loadHistory().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
