/**
 * 场景配置：所有"信件类型"在这里集中定义。
 * 想加新场景？只需要往 SCENARIOS 数组里加一项，前端和 Prompt 都会自动生效。
 * 这是「数据驱动开发」的思路 —— 把"会变"的东西从代码里抽出来。
 */

export type FieldType = "text" | "textarea" | "select";

export interface ScenarioField {
  /** 字段在表单里的唯一 key，会传给后端 */
  key: string;
  /** 标签文字 */
  label: string;
  /** 输入控件类型 */
  type: FieldType;
  /** 占位提示 */
  placeholder?: string;
  /** select 类型的选项 */
  options?: string[];
  /** 是否必填 */
  required?: boolean;
}

export interface Scenario {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** 表单字段列表 */
  fields: ScenarioField[];
  /** 信件类型描述，注入到 Prompt 中 */
  promptType: string;
}

// 共享的"语气"选项
const TONE_OPTIONS = ["朴素真挚", "文艺细腻", "幽默轻松", "庄重正式"];
// 共享的"字数"选项
const LENGTH_OPTIONS = ["短（200 字内）", "中（300-500 字）", "长（600+ 字）"];

export const SCENARIOS: Scenario[] = [
  {
    id: "family",
    emoji: "👨‍👩‍👧",
    title: "家书",
    description: "写给爸妈、爷爷奶奶、兄弟姐妹，表达思念、感恩、关心",
    promptType: "家书",
    fields: [
      {
        key: "receiver",
        label: "写给谁",
        type: "text",
        placeholder: "例如：妈妈 / 爷爷 / 妹妹",
        required: true,
      },
      {
        key: "emotion",
        label: "你最想表达的情感",
        type: "text",
        placeholder: "例如：思念 / 感恩 / 愧疚 / 担心",
        required: true,
      },
      {
        key: "event",
        label: "最近想和 TA 说的一件具体小事",
        type: "textarea",
        placeholder: "越具体越好，例如：上次回家发现妈妈白头发又多了，但她还在帮我打包腊肉……",
        required: true,
      },
      { key: "tone", label: "语气", type: "select", options: TONE_OPTIONS, required: true },
      { key: "length", label: "字数", type: "select", options: LENGTH_OPTIONS, required: true },
    ],
  },
  {
    id: "love",
    emoji: "💌",
    title: "情书",
    description: "给爱人、暗恋对象、老伴写一封真诚的情书",
    promptType: "情书",
    fields: [
      {
        key: "receiver",
        label: "TA 是？",
        type: "text",
        placeholder: "例如：在一起 3 年的女朋友 / 暗恋半年的同事",
        required: true,
      },
      {
        key: "emotion",
        label: "你想表达什么",
        type: "text",
        placeholder: "例如：表白 / 周年纪念 / 异地的思念 / 求婚",
        required: true,
      },
      {
        key: "event",
        label: "你们之间一件难忘的小事",
        type: "textarea",
        placeholder: "例如：第一次约会下大雨，TA 把外套给了我；或者 TA 总记得我不吃香菜……",
        required: true,
      },
      { key: "tone", label: "语气", type: "select", options: TONE_OPTIONS, required: true },
      { key: "length", label: "字数", type: "select", options: LENGTH_OPTIONS, required: true },
    ],
  },
  {
    id: "apology",
    emoji: "🙏",
    title: "道歉信",
    description: "为某件事真诚地道歉，修复一段关系",
    promptType: "道歉信",
    fields: [
      {
        key: "receiver",
        label: "向谁道歉",
        type: "text",
        placeholder: "例如：妻子 / 朋友 / 同事",
        required: true,
      },
      {
        key: "event",
        label: "发生了什么",
        type: "textarea",
        placeholder: "客观陈述发生的事，不要为自己辩解",
        required: true,
      },
      {
        key: "reflection",
        label: "你的反思 / 你错在哪",
        type: "textarea",
        placeholder: "诚实写出你意识到的问题（这是道歉信能不能打动人的关键）",
        required: true,
      },
      {
        key: "emotion",
        label: "你希望对方感受到什么",
        type: "text",
        placeholder: "例如：我的真心、我的反省、我会改变",
        required: true,
      },
      { key: "tone", label: "语气", type: "select", options: TONE_OPTIONS, required: true },
      { key: "length", label: "字数", type: "select", options: LENGTH_OPTIONS, required: true },
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * 把表单数据组装成给 LLM 的 prompt。
 * 这是整个项目的「灵魂」，未来 Agent 化也都基于这套结构。
 */
export function buildPrompt(scenarioId: string, form: Record<string, string>): string {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);

  // 把表单字段一行行列出来，给模型看
  const userInfo = scenario.fields
    .map((f) => `- ${f.label}：${form[f.key] || "（未填写）"}`)
    .join("\n");

  return `请根据用户提供的以下信息，为 TA 写一封${scenario.promptType}。

【用户信息】
${userInfo}

【创作要求】
1. 必须自然引用用户提供的"具体小事"或"具体事件"，让信件读起来是 TA 独有的，而不是网上随便能搜到的范文。
2. 开头不要套路化（不要"亲爱的 XXX"这种万能开头），用一个能立刻拉近距离的句子开篇。
3. 结尾留白，不要总结陈词，不要"此致敬礼"这类公式化结尾，让情感自然落地。
4. 避免空洞的形容词堆砌（"无比""非常""特别"等少用），多用具体细节代替抽象情感。
5. 严格遵守字数要求，不要超字数也不要凑字数。
6. 用第一人称中文。
`;
}
