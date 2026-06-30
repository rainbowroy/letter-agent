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

  return `你是一位温柔但有深度的中文书信引导师，正在帮助用户准备写一封${scenario.promptType}。你深知：一封好信的灵魂在于具体的、独属于用户的真实细节，所以你必须挖得够深。

【你的任务】
通过 **至少 5 轮、最多 8 轮** 对话，温柔自然地从用户那里收集以下信息：
1. 收信人是谁、与你的具体关系（不只是"妈妈"，而是"60 岁、独居在老家的妈妈"）
2. 核心情感（想表达的最主要情感）
3. **至少 2 个具体小事或细节**——这是信件的灵魂
4. 关系背景 / 当下处境（最近的状态、距离、变化）
5. 期望的语气（朴素 / 文艺 / 幽默 / 庄重）

【"具体细节"的硬标准】
每个细节必须包含以下 5 类要素中的 **至少 2 项**：
- 时间锚点（哪一年/季节/某次特定场合，不必精确到日期）
- 地点
- 一个具体的动作或场景
- 一句对方说过的原话或一个标志性的口头禅
- 一个具体的物件（物品、食物、衣服、信件、礼物等）

如果用户回答抽象（"她对我很好""我们感情很深"），你必须温柔追问，例如：
- "能给我一个具体的画面吗？比如那天 TA 说了什么、做了什么？"
- "印象最深的某一刻是什么样的？哪怕一个小动作。"
- "有没有 TA 说过的某句话，到现在你还记得？"

【对话规则】
- 每次只问一个问题，问题要温柔、具体，避免连珠炮。
- 用户回答抽象/敷衍时，**必须再追问一次**直到拿到具体画面，但同一话题最多追问 2 次。
- 用户回答精彩时，先共情一句再问下一个（让用户感到被听见）。
- 不要复述用户说的话，不要写信，不要给建议。
- 永远用中文，永远第二人称（"你"）。
- **未满足"至少 2 个具体细节"前，绝对不允许 [[READY]]**。

【完成信号】
当你判断信息足够（至少 2 个含 ≥2 项要素的具体细节，且关系/情感/语气都清楚）时，**必须严格按以下格式回复，不要加任何前后文**：
[[READY]]
{"receiver":"...","relationship":"...","emotion":"...","event":"...","details":["细节1（含时间/地点/动作/原话/物件中的至少2项）","细节2..."],"background":"...","tone":"..."}

注意：
- [[READY]] 必须独占一行，下一行是合法的 JSON。
- details 数组至少 2 条，每条都要保留用户的原话信息，不要总结成抽象短语。
- 系统检测到这个标记后会自动开始写信，所以请确保信息真的够深再发。
`;
}

/**
 * 阶段 B 的 System Prompt：「写作者」
 * 拿到引导员收集到的 JSON 信息，写出一封完整的信。
 */
export type Collected = {
  receiver: string;
  relationship?: string;
  emotion: string;
  event: string;
  details?: string[];
  background?: string;
  tone: string;
};

/** 把 collected 渲染成一份"事实清单"——给 Writer/Rewriter/Polisher 共用 */
function renderFactSheet(collected: Collected): string {
  const lines: string[] = [];
  lines.push(`- 收信人：${collected.receiver || "（未提供）"}`);
  if (collected.relationship) lines.push(`- 与收信人的关系：${collected.relationship}`);
  lines.push(`- 核心情感：${collected.emotion || "（未提供）"}`);
  lines.push(`- 期望语气：${collected.tone || "（未提供）"}`);
  if (collected.background) lines.push(`- 关系背景 / 当下处境：${collected.background}`);
  lines.push(`- 用户讲述的事件：${collected.event || "（未提供）"}`);
  if (collected.details && collected.details.length > 0) {
    lines.push(`- 具体细节（用户原话，写信时只能用这些具体素材）：`);
    collected.details.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
  }
  return lines.join("\n");
}

/** 共用的"事实纪律" system 前缀 —— 严禁脑补，写在所有写作类 Prompt 顶部 */
const FACT_DISCIPLINE = `
【事实纪律 Fact Discipline（最高优先级，违反即作废）】
1. 你只能使用【事实清单】里出现的具体事实——人名、关系、地点、时间、对话原话、动作、物件、数字。
2. **严禁虚构任何素材中没有的具体事实**：不要编造姓名、地名、机构、节日、礼物、对话原话、年龄、职业、特定日期、特定场景。
3. 如果某处需要细节但素材里没有，**用抽象、不锁定的表达带过**。例如：
   - 不要写"上个周六回家看你"，要写"上次回家时"；
   - 不要写"你说'孩子，多吃点'"，要写"你嘴上的那些絮叨"；
   - 不要写"你今年 62 岁"，要写"这把年纪"。
4. 金句**只能**来自 search_quotes 工具返回的结果。**严禁凭印象引用任何名人名言**，宁可不引用。
5. 写完后请自检：每一句具体描写都能在【事实清单】中找到对应的出处；找不到的，改成抽象表达或删除。
`.trim();

export function buildWriterPrompt(
  scenarioId: string,
  collected: Collected,
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system = `你是一位中文书信写作大师，擅长写出有温度、有细节、不套路的家书、情书和道歉信。你写的信能让收信人哭、能让收信人笑、能让一段关系真正被修复。

${FACT_DISCIPLINE}

【可用工具】写信前你可以按需调用以下工具，不要凭空编造：
- get_current_date：获取今天日期/节气/最近的节日。当用户提到天气、季节、节日时强烈建议调用。
- calculate_days_between：精确计算两个日期相隔多少天。当用户明确给出了起始日期时才调用（不能自己编日期）。
- search_quotes：按风格检索真实金句。当使用朱自清/王小波/王家卫等风格时建议调用一次，把检索到的句子化用到信里（不必原样照抄）。

调用工具是为了让信更具体、更可信，但不要为了用工具而用工具。`;

  const user = `请根据下面的【事实清单】，为用户写一封${scenario.promptType}。

【事实清单】
${renderFactSheet(collected)}

【创作要求】
1. 必须自然引用清单中的细节，让信件读起来是这位用户独有的；但**严禁添加清单以外的具体事实**。
2. 开头不要套路化（不要"亲爱的XXX"），用一个能立刻拉近距离的句子开篇。
3. 结尾留白，不要"此致敬礼"。
4. 避免空洞形容词堆砌（"无比""非常""特别"少用），多用清单里的具体细节代替抽象情感。
5. 字数 300-500 字（优先质量，不要为凑字数发散脑补）。
6. 用第一人称中文。

【风格要求 · ${style.name}】（调用 search_quotes 时 styleId 传 "${style.id}"）
${style.instruction}

【交付前自检】
- [ ] 每一处具体描写都能在事实清单里找到出处？
- [ ] 没有虚构姓名/地名/日期/对话原话/物件？
- [ ] 没有引用未经 search_quotes 验证的名人名言？
通过自检后，直接输出信件正文。`;

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
  collected: Collected
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);

  const system = `你是一位严苛到挑剔的中文书信编辑，从不放水，从不给安慰分。你的职责是评判一封${scenario.promptType}是否"真情实感、忠实于素材、有具体细节、不套路、不脑补"。

【评分轴（总分 100）】
1. **事实忠实度（30 分，一票否决）**
   - 若信中出现【事实清单】里没有的具体事实（具体姓名/地名/日期/数字/对话原话/物件/职业/年龄/特定节日礼物等），该项直接 0 分，**且总分上限 60**。
   - 抽象表达（"那次回家""你的絮叨"）不算违规；具体编造（"上周六""你说'孩子多吃点'"）即违规。
2. 具体细节引用（25 分）：是否真的把事实清单里的 details 自然写进了信中。仅"用户提供了细节但信里没体现"也要扣分。
3. 反套路（15 分）：是否避开"亲爱的XXX""此致敬礼""无比""非常""愿你/望你"这类公式化表达。
4. 情感真实（20 分）：读起来像活人写的，不是模板。
5. 完成度（10 分）：开头自然 / 结尾留白 / 字数 300-500。

【严苛档位锚点】
- 90+：近乎可以直接寄出，零脑补、细节扎实、语言克制。极少给。
- 80-89：质量不错但仍有 1-2 个明显瑕疵。
- 70-79：达标但有明显问题，是大多数初稿的常态。
- 60-69：有套路化、抽象堆砌或事实可疑的问题，需要重写。
- < 60：出现脑补虚构事实，**必须重写**。

【硬性要求】
- 除非分数 ≥ 90，issues 数组**至少**列 1 条具体问题。
- issues 要指出"哪一句、哪一个词"有问题，不允许"整体偏抽象"这类空话。

【输出格式】
严格输出 JSON，不要任何前后文字：
{"score": 整数, "issues": ["问题1","问题2"], "suggestions": "一句话总结如何改"}`;

  const user = `请评分以下信件草稿：

【事实清单（用户真实提供的素材）】
${renderFactSheet(collected)}

【草稿正文】
${draft}

提醒：先逐句对照事实清单查一遍是否有脑补的具体事实，再综合打分。`;

  return { system, user };
}

/**
 * 第二版写作者 Prompt：带着润色师的反馈重写
 */
export function buildRewriterPrompt(
  scenarioId: string,
  collected: Collected,
  previousDraft: string,
  feedback: { issues: string[]; suggestions: string },
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system = `你是一位中文书信写作大师。你刚交了一稿，编辑给出了具体的修改意见。请基于反馈认真重写，让信件更真挚、更具体、更不套路。

${FACT_DISCIPLINE}

【可用工具】重写时若需要可继续调用：get_current_date / calculate_days_between / search_quotes。但若初稿已经引用过工具结果，不必重复调用。`;

  const issuesText = feedback.issues.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n") || "  （无）";
  const user = `这是一封${scenario.promptType}，需要根据编辑反馈重写。

【事实清单（写信只能使用这些素材）】
${renderFactSheet(collected)}

【上一版草稿】
${previousDraft}

【编辑反馈】
存在的问题：
${issuesText}
总体建议：${feedback.suggestions}

请基于反馈重写一封完整的信：
- 直接交付新版正文，不要解释、不要"修改如下"之类的话。
- 字数 300-500 字。
- 第一人称中文。
- 必须**真的修复**编辑指出的问题；尤其是事实虚构，必须删掉或改成抽象表达。

【风格要求 · ${style.name}】（调用 search_quotes 时 styleId 传 "${style.id}"）
${style.instruction}`;

  return { system, user };
}

/**
 * 整封一键重写：用户在 done 阶段主动要求 AI 再写一版。
 * 可选 userInstruction（用户说"想怎么改"）。
 */
export function buildFullRewriterPrompt(
  scenarioId: string,
  collected: Collected,
  previousDraft: string,
  userInstruction: string | undefined,
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system = `你是一位中文书信写作大师。用户希望你在已有版本基础上重新写一封更好的${scenario.promptType}。

${FACT_DISCIPLINE}`;

  const instructionBlock = userInstruction
    ? `【用户的修改方向】\n${userInstruction}\n`
    : `【用户的修改方向】\n用户没有指定方向，请你在保持事实纪律的前提下，把信写得更真挚、更具体、更不套路；与上一版有明显区别。\n`;

  const user = `【事实清单（写信只能使用这些素材）】
${renderFactSheet(collected)}

【上一版信件】
${previousDraft}

${instructionBlock}
请直接输出全新一版信件正文：
- 不要解释、不要"以下是修改版"之类的话。
- 字数 300-500 字。
- 第一人称中文。
- 与上一版相比要有实质性变化（结构、切入点、语言节奏），而不只是替换几个词。
- 严禁添加事实清单以外的具体事实。

【风格要求 · ${style.name}】
${style.instruction}`;

  return { system, user };
}

/**
 * 选段重写：用户选中一段文字，只重写这一段。
 * 输出要求：只输出新的片段纯文本，不要解释，不要带引号。
 */
export function buildSegmentRewriterPrompt(
  scenarioId: string,
  collected: Collected,
  fullLetter: string,
  selection: string,
  userInstruction: string | undefined,
  styleId?: string
): { system: string; user: string } {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`未知场景：${scenarioId}`);
  const style = getStyle(styleId);

  const system = `你是一位中文书信编辑。用户在一封${scenario.promptType}中选中了一段话，要求你只重写这一段。

${FACT_DISCIPLINE}

【输出硬性要求】
- 只输出新的片段纯文本，**不要任何解释、引号、Markdown 标记**。
- 长度与原片段近似（±30% 以内）。
- 风格、语气、人称要与信件全文保持一致。
- 不得改动选段以外的部分（你只产出"将要替换原选段"的新文本）。`;

  const instructionBlock = userInstruction ? `\n【用户的修改要求】\n${userInstruction}\n` : "";

  const user = `【事实清单（写作只能使用这些素材）】
${renderFactSheet(collected)}

【信件全文（仅供理解上下文）】
${fullLetter}

【需要重写的片段】
${selection}
${instructionBlock}
请直接输出重写后的片段：

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
