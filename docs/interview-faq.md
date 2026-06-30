# 面试 FAQ · 这个项目你可能会被问到的

> 这份文档是项目交付的一部分。把"做"和"讲"打通 —— 让任何看完这份文档的人，都能像作者一样讲清楚 3 个核心设计决策。

---

## Q1：什么是 Self-Critique 模式？项目里怎么实现？

### 1 句话答案

让一个 LLM 评判另一个（或同一个）LLM 的输出，并基于评判结果决定是否重做。
理论出处：Reflexion (Shinn et al., 2023) 和 Constitutional AI (Anthropic)。

### 项目里的实现

`src/app/api/converse/route.ts` 中的 Agent Loop：

```typescript
// 1. Writer 出初稿
let draft = await streamWriter(...);

// 2. Polisher 评分
let polish = await runPolisher(model, scenarioId, draft, collected);
//    polish = { score: 75, issues: ["套路化开头"], suggestions: "..." }

// 3. 分数不够 → Rewriter 带反馈重写
while (polish.score < PASS_SCORE && rewrites < MAX_REWRITES) {
  draft = await streamRewriter(..., draft, polish, ...);
  polish = await runPolisher(...); // 再评一次
}
```

### 关键设计点

- **同一个 DeepSeek 模型 + 不同 system prompt** = "作家"和"严苛编辑"两个人格
- **Polisher 反馈作为 Rewriter 的输入条件**，让 Rewriter 完整重写而不是局部小修
- **MAX_REWRITES = 1** 限制循环次数，避免烧 token

### 面试官可能追问

| 问题 | 答案要点 |
|---|---|
| 模型自我袒护怎么办？ | 三招：严苛的 system prompt + 四维强制评分 + 评判温度 0.3 |
| 为啥不让 Polisher 直接改？ | "修改"会保留烂结构，"重写"会从全局规划（Reflexion 理论：reflection without rewriting is shallow） |
| Rewriter 重写后分数更低呢？ | 当前是简单交付。更好做法：保留两版让 LLM-as-Judge 做 pairwise comparison |
| 适合所有场景吗？ | 不适合。适合**主观质量**（写作/设计）；不适合**客观正确性**（数学/代码 → 用 test/tool-use） |
| 阈值 80 怎么定？ | 经验值，跑了 20+ 样本人工对齐。生产环境应该可配置 + A/B |

---

## Q2：为什么用 JSON Mode？

### 1 句话答案

因为后续代码用 `score < 80` 决定流程分支，必须保证 LLM 输出严格可解析的结构化数据。`response_format: { type: "json_object" }` 是模型级约束，比正则解析自然语言鲁棒 10 倍。

### 项目里的实现

`runPolisher` 函数：

```typescript
const resp = await client.chat.completions.create({
  model,
  temperature: 0.3,
  messages: [...],
  response_format: { type: "json_object" }, // ← 关键
});
const parsed = JSON.parse(resp.choices[0].message.content);
// 不会因为模型废话导致 JSON.parse 抛错
```

### 面试官可能追问

| 问题 | 答案要点 |
|---|---|
| 为啥不用正则抠 JSON？ | 三种翻车：模型加前缀废话 / 中文引号 / 字段缺失。JSON Mode 在模型层就解决了 |
| JSON Mode 会让质量下降吗？ | 会。所以只在「数据收集 / 评判」用，正文生成（Writer）绝对不用 |
| DeepSeek 和 OpenAI 的区别？ | 接口兼容。OpenAI 更严格（支持 json_schema），DeepSeek 偶尔字段缺失 → 我用 default value 兜底 |
| Fallback 的 70 分怎么来？ | 70 介于"触发重写"(<80) 和"明显不及格"(<60) 之间。让异常时初稿直接交付，不阻塞流程 |

---

## Q3：为什么用自定义 Stream Protocol？

### 1 句话答案

因为浏览器原生 EventSource 不支持 POST，而我需要单 endpoint 同时返回「聊天消息 / 信件正文 / 评审 JSON」三种语义的数据，所以发明了 `[[STAGE:*]]` 标记协议，让前端边收边切 UI 区域。

### 项目里的实现

**后端发标记**：

```typescript
send("\n[[STAGE:writing]]\n");
let draft = await streamWriter(...);           // 流式吐字
send("\n[[STAGE:polishing]]\n");
send(`[[POLISH:json]]${JSON.stringify(polish)}\n`);
if (polish.score < 80) send("\n[[STAGE:rewriting]]\n");
send("\n[[STAGE:done]]\n");
```

**前端增量解析**（`page.tsx` 中 `runConverse` 里的 `while (true)` 块）：

```typescript
while (true) {
  const idx = buffer.indexOf("[[");
  if (idx === -1) { consume(buffer); break; }   // 纯文本
  consume(buffer.slice(0, idx));
  const end = buffer.indexOf("]]");
  if (end === -1) break;                         // 标记不完整，等下一块
  const marker = buffer.slice(2, end);
  // 路由：STAGE: → 切阶段；POLISH:json → 解析评分
  buffer = buffer.slice(end + 2);
}
```

`consume(text)` 根据当前 stage 把字符路由到不同 React state。

### 面试官可能追问

| 问题 | 答案要点 |
|---|---|
| 为啥不用 SSE？ | 1) SSE 必须 GET；2) EventSource 不支持自定义 header；3) 我只需要标记，不需要 event-type |
| 为啥不用 WebSocket？ | 单向流不用双工。WS 在 Vercel Serverless 支持不好（10s-5min 硬超时） |
| 为啥不用 Vercel AI SDK 的 `useChat`？ | 我有 5 个状态切换，`useChat` 只支持普通 chat。且学习目的：自己手写一遍才知道在解决什么问题 |
| 标记和正文冲突怎么办？ | 1) prompt 禁止输出方括号；2) 更鲁棒：用罕见 Unicode 分隔符；3) 生产级：用 NDJSON |
| `if (end === -1) break;` 是干啥？ | 处理 HTTP chunked 分片。可能在 `[[STAG` 处断包 → 用 buffer 累积，等完整 `]]` 才解析 |

---

## 整体内核（如果让你一句话总结这三个设计）

> 这三个设计都在解决同一个问题：**LLM 输出的不可靠性**。
>
> - **Self-Critique** 解决「单次生成质量不稳定」 → 用第二轮评判过滤次品
> - **JSON Mode** 解决「自然语言输出无法被程序消费」 → 用模型级约束保证结构
> - **自定义 Stream Protocol** 解决「单次生成 = 单次响应这个抽象不够用」 → 让一次 HTTP 请求承载多阶段语义
>
> 做了 6 周这个项目最大的收获：**做 AI 应用，80% 的工程量在处理"模型不靠谱"** —— 不是写 LLM 调用，而是给 LLM 装"护栏"。
