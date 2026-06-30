/**
 * 文学风格库：每种风格是一段「风格指令」+ 几句「示例片段」
 * 注入到 Writer / Rewriter 的 user prompt 末尾，让模型按风格写作。
 *
 * 这是 W5 的核心：用 Prompt 工程做"产品差异化"。
 * 同一段素材，不同风格，能写出 4 封气质完全不同的信 —— 这就是 AI 产品的"杀手锏"。
 */

export type StyleId = "default" | "zhuziqing" | "wangxiaobo" | "modern" | "hkmovie";

export interface LetterStyle {
  id: StyleId;
  name: string;
  emoji: string;
  description: string;
  /** 注入到 Writer/Rewriter Prompt 末尾的指令 */
  instruction: string;
}

export const LETTER_STYLES: LetterStyle[] = [
  {
    id: "default",
    name: "默认",
    emoji: "✉️",
    description: "自然书信体，最稳妥的选择",
    instruction: "用自然的书信体，不刻意模仿任何作家。",
  },
  {
    id: "zhuziqing",
    name: "朱自清式",
    emoji: "🌾",
    description: "温润内敛、含蓄克制",
    instruction: `请模仿朱自清《背影》《给亡妇》的笔调：
- 用具体的日常细节代替抒情（如"父亲的青布棉袍"代替"父亲很伟大"）
- 句子短，节奏慢，多用顿号和句号
- 情感深而不外露，常在最朴素的描述里突然停一下，让读者自己心碎
- 用词朴素口语，避免华丽形容词
- 偶尔有节制的旧时白话感（"罢了""倒也""着实"）`,
  },
  {
    id: "wangxiaobo",
    name: "王小波式",
    emoji: "🎭",
    description: "幽默自嘲、聪明又真诚",
    instruction: `请模仿王小波给李银河的情书笔调：
- 既深情又自嘲，用幽默化解郑重
- 时不时蹦出一个看似不正经、实则击中要害的比喻
- 用第一人称坦白自己的"傻""笨""糟糕"
- 句式灵活，长短交错，有时一句很长，有时只一个词
- 真挚但绝不煽情，绝不用"我爱你"这种直白话，要绕个弯说`,
  },
  {
    id: "modern",
    name: "现代口语",
    emoji: "💬",
    description: "像微信里和朋友说话",
    instruction: `请用 2024 年中国年轻人的微信口语写：
- 像在和好朋友讲话，不端着、不正式
- 可以有"其实""说真的""你懂的"这类口头禅
- 用"我""你"，不用"您"
- 偶尔有自嘲、有梗，但不要硬凹网络热词
- 像把酒倒满之后说的心里话，掏心窝但不矫情`,
  },
  {
    id: "hkmovie",
    name: "港片台词",
    emoji: "🎬",
    description: "王家卫式的独白",
    instruction: `请模仿王家卫电影旁白的味道（《重庆森林》《花样年华》《一代宗师》）：
- 短句独立成行，像电影旁白一样
- 充满时间和数字的细节（"那天下午 3 点 17 分""第 27 次"）
- 把抽象情感包装在具体画面里
- 有一种淡淡的宿命感和距离感
- 偶尔有金句，但不卖弄`,
  },
];

export function getStyle(id: string | undefined): LetterStyle {
  return LETTER_STYLES.find((s) => s.id === id) || LETTER_STYLES[0];
}
