/**
 * Tool Use 工具箱：所有给 Writer / Rewriter 调用的工具在此集中定义。
 *
 * 设计原则：
 * 1. 每个工具一个 schema（给 LLM 看）+ 一个 handler（在服务器执行）
 * 2. handler 必须是同步或快速异步，避免阻塞流
 * 3. 入参用 zod-like 手工校验（这里项目无 zod，直接 try/catch + 默认值）
 * 4. 工具结果必须是可 JSON 序列化的纯对象
 */

import OpenAI from "openai";
import { searchQuotesByStyle } from "./quotes";

// =========================================================================
// 工具实现
// =========================================================================

// ----- 1. 节气表（公历近似日期，足够书信场景使用） -----
const SOLAR_TERMS_2024_2026: Array<{ name: string; month: number; day: number }> = [
  { name: "小寒", month: 1, day: 6 },
  { name: "大寒", month: 1, day: 20 },
  { name: "立春", month: 2, day: 4 },
  { name: "雨水", month: 2, day: 19 },
  { name: "惊蛰", month: 3, day: 6 },
  { name: "春分", month: 3, day: 21 },
  { name: "清明", month: 4, day: 5 },
  { name: "谷雨", month: 4, day: 20 },
  { name: "立夏", month: 5, day: 6 },
  { name: "小满", month: 5, day: 21 },
  { name: "芒种", month: 6, day: 6 },
  { name: "夏至", month: 6, day: 21 },
  { name: "小暑", month: 7, day: 7 },
  { name: "大暑", month: 7, day: 23 },
  { name: "立秋", month: 8, day: 8 },
  { name: "处暑", month: 8, day: 23 },
  { name: "白露", month: 9, day: 8 },
  { name: "秋分", month: 9, day: 23 },
  { name: "寒露", month: 10, day: 8 },
  { name: "霜降", month: 10, day: 24 },
  { name: "立冬", month: 11, day: 7 },
  { name: "小雪", month: 11, day: 22 },
  { name: "大雪", month: 12, day: 7 },
  { name: "冬至", month: 12, day: 22 },
];

// ----- 2. 常见节日（公历） -----
const HOLIDAYS: Array<{ name: string; month: number; day: number }> = [
  { name: "元旦", month: 1, day: 1 },
  { name: "情人节", month: 2, day: 14 },
  { name: "妇女节", month: 3, day: 8 },
  { name: "清明节", month: 4, day: 5 },
  { name: "劳动节", month: 5, day: 1 },
  { name: "母亲节", month: 5, day: 12 }, // 近似（5月第二个周日）
  { name: "儿童节", month: 6, day: 1 },
  { name: "父亲节", month: 6, day: 16 }, // 近似
  { name: "七夕", month: 8, day: 10 }, // 农历七月初七近似
  { name: "教师节", month: 9, day: 10 },
  { name: "中秋节", month: 9, day: 17 }, // 农历八月十五近似
  { name: "国庆节", month: 10, day: 1 },
  { name: "圣诞节", month: 12, day: 25 },
  { name: "除夕", month: 2, day: 9 }, // 农历近似
  { name: "春节", month: 2, day: 10 }, // 农历近似
];

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getNearestSolarTerm(now: Date): { name: string; daysAway: number } {
  const year = now.getFullYear();
  let best: { name: string; daysAway: number } | null = null;
  for (const t of SOLAR_TERMS_2024_2026) {
    const d = new Date(year, t.month - 1, t.day);
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (best === null || Math.abs(diff) < Math.abs(best.daysAway)) {
      best = { name: t.name, daysAway: diff };
    }
  }
  return best!;
}

function getNearestHoliday(now: Date): { name: string; daysAway: number } | null {
  const year = now.getFullYear();
  let best: { name: string; daysAway: number } | null = null;
  for (const h of HOLIDAYS) {
    const d = new Date(year, h.month - 1, h.day);
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    // 只看未来 60 天 / 过去 7 天内的
    if (diff < -7 || diff > 60) continue;
    if (best === null || Math.abs(diff) < Math.abs(best.daysAway)) {
      best = { name: h.name, daysAway: diff };
    }
  }
  return best;
}

export function handleGetCurrentDate(): Record<string, unknown> {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const weekday = WEEKDAY_CN[now.getDay()];
  const term = getNearestSolarTerm(now);
  const holiday = getNearestHoliday(now);
  return {
    iso,
    weekday,
    chineseDate: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    nearestSolarTerm: term.daysAway === 0
      ? `今天就是${term.name}`
      : term.daysAway > 0
        ? `距${term.name}还有 ${term.daysAway} 天`
        : `${term.name}已过 ${-term.daysAway} 天`,
    nearestHoliday: holiday
      ? holiday.daysAway === 0
        ? `今天是${holiday.name}`
        : holiday.daysAway > 0
          ? `距${holiday.name}还有 ${holiday.daysAway} 天`
          : `${holiday.name}刚过 ${-holiday.daysAway} 天`
      : null,
  };
}

export function handleCalculateDaysBetween(args: {
  from: string;
  to?: string;
}): Record<string, unknown> {
  const from = new Date(args.from);
  const to = args.to ? new Date(args.to) : new Date();
  if (isNaN(from.getTime())) {
    return { error: `无法解析日期：${args.from}` };
  }
  if (isNaN(to.getTime())) {
    return { error: `无法解析日期：${args.to}` };
  }
  const days = Math.abs(Math.round((to.getTime() - from.getTime()) / 86400000));
  const years = Math.floor(days / 365);
  const remainderDays = days - years * 365;
  let description: string;
  if (years === 0) {
    description = `${days} 天`;
  } else if (remainderDays === 0) {
    description = `整整 ${years} 年（${days} 天）`;
  } else {
    description = `${years} 年零 ${remainderDays} 天（共 ${days} 天）`;
  }
  return { days, years, description, from: args.from, to: to.toISOString().slice(0, 10) };
}

export function handleSearchQuotes(args: {
  styleId: string;
  theme?: string;
}): Record<string, unknown> {
  const quotes = searchQuotesByStyle(args.styleId, args.theme);
  return {
    styleId: args.styleId,
    theme: args.theme || null,
    count: quotes.length,
    quotes,
  };
}

// =========================================================================
// OpenAI Tool Schema
// =========================================================================

export const TOOL_SCHEMAS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_current_date",
      description:
        "获取今天的日期信息，包括公历日期、星期几、最近的节气、最近的节日。当用户提到天气/季节/节日/最近时，调用此工具能让信件更有时间感（例如把'最近天冷'写成'立冬这天'）。无需参数。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_days_between",
      description:
        "计算两个日期之间的天数。当用户提到'在一起 X 年'、'分别多久'、'认识 X 年'等表达时，调用此工具能给出精确数字（例如'我们在一起 1825 天'比'5 年'更动人）。",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "起始日期，ISO 格式（YYYY-MM-DD）。例如恋爱开始日、上次见面日。",
          },
          to: {
            type: "string",
            description: "结束日期，ISO 格式。可选，默认今天。",
          },
        },
        required: ["from"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_quotes",
      description:
        "按文学风格检索真实存在的金句（朱自清/王小波/王家卫/现代口语等），用于在信中自然引用。比'凭印象编一句话'安全得多，避免出现伪造名言。",
      parameters: {
        type: "object",
        properties: {
          styleId: {
            type: "string",
            enum: ["zhuziqing", "wangxiaobo", "hkmovie", "modern", "default"],
            description: "风格 ID，应与当前写作风格一致。",
          },
          theme: {
            type: "string",
            description:
              "主题标签，可选。例如'思念''情书''道歉''陪伴''时间''父亲'。会按 tag 过滤。",
          },
        },
        required: ["styleId"],
      },
    },
  },
];

// =========================================================================
// 工具调度
// =========================================================================

export type ToolResult = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

export function executeTool(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  try {
    switch (name) {
      case "get_current_date":
        return handleGetCurrentDate();
      case "calculate_days_between":
        return handleCalculateDaysBetween(args as { from: string; to?: string });
      case "search_quotes":
        return handleSearchQuotes(args as { styleId: string; theme?: string });
      default:
        return { error: `未知工具：${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `工具执行失败：${msg}` };
  }
}
