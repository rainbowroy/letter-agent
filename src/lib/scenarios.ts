/**
 * 场景配置：所有"信件类型"在这里集中定义。
 * 想加新场景？只需要往 SCENARIOS 数组里加一项，前端和 Prompt 都会自动生效。
 * 这是「数据驱动开发」的思路 —— 把"会变"的东西从代码里抽出来。
 */
import { getStyle } from "./styles";

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

// =========================================================================
// W3 新增：Agent 双角色 Prompt
// =========================================================================

/**
 * 阶段 A 的 System Prompt：「引导员」
 * 它的任务不是写信，而是温柔地从用户嘴里挖出 4 个关键信息：
 *   1) 收信人 / 关系  2) 核心情感  3) 一件具体小事  4) 期望语气
 * 当信息足够时，它必须吐出一行特殊标记 [[READY]]，并附上结构化 JSON 摘要。
 * 后端代码检测到这个标记后，就切换到「写作者」开始生成信件。
 *
 * 这是教科书级别的「Agent 跳出对话、采取行动」机制。
 */
export function buildListenerSystemPrompt(scenarioId: string): string {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);

  return `你是一位温柔的中文书信引导师，正在帮助用户准备写一封${scenario.promptType}。

【你的任务】
通过最多 5 轮对话，温柔自然地从用户那里收集以下 4 类信息：
1. 收信人 / 关系（写给谁、什么关系）
2. 核心情感（想表达的最主要情感）
3. 一件具体小事或事件（越具体越好，是信件灵魂）
4. 期望的语气（朴素 / 文艺 / 幽默 / 庄重）

【对话规则】
- 每次只问一个问题，问题要温柔、具体，避免连珠炮。
- 用户回答含糊时，可以温柔追问一次（但不要超过两次）。
- 用户回答精彩时，先共情一句再问下一个（让用户感到被听见）。
- 不要复述用户说的话，不要写信，不要给建议。
- 永远用中文，永远第二人称（"你"）。

【完成信号】
当你判断 4 类信息都已经足够时，**必须严格按以下格式回复，不要加任何前后文**：
[[READY]]
{"receiver": "...", "emotion": "...", "event": "...", "tone": "..."}

注意：[[READY]] 必须独占一行，下一行是合法的 JSON。检测到这个标记后系统会自动开始写信，所以请确保信息齐全后再发。
`;
}

/**
 * 阶段 B 的 System Prompt：「写作者」
 * 拿到引导员收集到的 JSON 信息，写出一封完整的信。
 */
export function buildWriterPrompt(
  scenarioId: string,
  collected: { receiver: string; emotion: string; event: string; tone: string },
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system =
    "你是一位中文书信写作大师，擅长写出有温度、有细节、不套路的家书、情书和道歉信。你写的信能让收信人哭、能让收信人笑、能让一段关系真正被修复。";

  const user = `请根据用户提供的以下信息，为 TA 写一封${scenario.promptType}：

- 收信人：${collected.receiver}
- 核心情感：${collected.emotion}
- 具体事件：${collected.event}
- 语气：${collected.tone}

【创作要求】
1. 必须自然引用"具体事件"中的细节，让信件读起来是用户独有的，而不是范文。
2. 开头不要套路化（不要"亲爱的XXX"），用一个能立刻拉近距离的句子开篇。
3. 结尾留白，不要"此致敬礼"。
4. 避免空洞形容词堆砌，多用具体细节代替抽象情感。
5. 字数控制在 300-500 字。
6. 用第一人称中文。

【风格要求 · ${style.name}】
${style.instruction}`;

  return { system, user };
}

/**
 * 阶段 C 的 Prompt：「润色师 / 评审师」
 * 任务：对写作者生成的信打分（0-100），并给出**具体**改进建议。
 * 输出严格 JSON，便于程序判断是否需要重写。
 */
export function buildPolisherPrompt(
  scenarioId: string,
  draft: string,
  collected: { receiver: string; emotion: string; event: string; tone: string }
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);

  const system = `你是一位严苛的中文书信编辑，从不放水。你的职责是评判一封${scenario.promptType}是否「真情实感、有具体细节、不套路」。

【评分标准（每项 0-25 分，总分 100）】
1. 具体细节：是否真的引用了用户提供的事件细节（不是抽象转述）。
2. 反套路：是否避开"亲爱的XXX""此致敬礼""无比""非常"这类公式化表达。
3. 情感真实：读起来像活人写的，不是模板拼出来的。
4. 完成度：开头自然 / 结尾留白 / 字数合理（300-500）。

【输出格式】
你必须严格输出 JSON，不要任何前后文字：
{"score": 数字, "issues": ["问题1","问题2"], "suggestions": "一句话总结如何改"}

score 是 0-100 整数。如果 score >= 80，issues 可以是空数组。`;

  const user = `请评分以下信件草稿：

【用户提供的素材】
- 收信人：${collected.receiver}
- 核心情感：${collected.emotion}
- 具体事件：${collected.event}
- 期望语气：${collected.tone}

【草稿正文】
${draft}`;

  return { system, user };
}

/**
 * 第二版写作者 Prompt：带着润色师的反馈重写
 */
export function buildRewriterPrompt(
  scenarioId: string,
  collected: { receiver: string; emotion: string; event: string; tone: string },
  previousDraft: string,
  feedback: { issues: string[]; suggestions: string },
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system =
    "你是一位中文书信写作大师。你刚交了一稿，编辑给出了具体的修改意见。请基于反馈认真重写，让信件更真挚、更具体、更不套路。";

  const issuesText = feedback.issues.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n");
  const user = `这是一封${scenario.promptType}，需要根据编辑反馈重写。

【用户素材】
- 收信人：${collected.receiver}
- 核心情感：${collected.emotion}
- 具体事件：${collected.event}
- 期望语气：${collected.tone}

【上一版草稿】
${previousDraft}

【编辑反馈】
存在的问题：
${issuesText}
总体建议：${feedback.suggestions}

请基于反馈重写一封完整的信。重写要求：
- 直接交付新版正文，不要解释、不要"修改如下"之类的话。
- 字数 300-500 字。
- 第一人称中文。
- 必须**真的修复**编辑指出的问题，而不是表面调几个词。

【风格要求 · ${style.name}】
${style.instruction}`;

  return { system, user };
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
