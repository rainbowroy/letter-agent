# ✉️ Letter Agent · 情感书信助手

> 一个会**自我评审、必要时重写**的 4 角色 AI Agent。给一段真实素材，它会用你选择的文学风格，写出一封不套路的家书、情书或道歉信。

🔗 **在线体验**：[https://letter-agent.vercel.app](https://letter-agent.vercel.app)（请替换为你的实际域名）
💻 **源码**：[https://github.com/rainbowroy/letter-agent](https://github.com/rainbowroy/letter-agent)

---

## ✨ 它能做什么

- **3 个场景** × **5 种文学风格** = 15 种信件气质（家书 / 情书 / 道歉信 × 默认 / 朱自清 / 王小波 / 现代口语 / 港片台词）
- **4 角色 Agent Loop**：Listener 引导你说出真实素材 → Writer 写初稿 → Polisher 按 4 维度打分 → 分数 <80 自动 Rewriter 重写
- **流式输出**：信件像被人手写一样一字字浮现
- **思考过程可视化**：能看到评审师的评分卡（分数 / 问题 / 建议）
- **本地历史**：自动保存最近 10 封信，关掉浏览器也在
- **导出为图片**：一键生成带水印的信纸 PNG，发朋友圈不丢人

---

## 🏗️ 架构

### 整体流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Listener   │───>│   Writer    │───>│  Polisher   │──┐ │  Rewriter   │
│ 多轮引导    │    │ 写作者      │    │ JSON 评分   │  │ │ 带反馈重写  │
│ 收集结构化  │    │ 流式出稿    │    │ 4 维 0-100  │  │ │ 流式覆盖    │
│ JSON 素材   │    │             │    │             │  └>│             │
└─────────────┘    └─────────────┘    └──────┬──────┘    └─────────────┘
                                              │ score>=80
                                              ▼
                                          完成 ✅
```

### 自定义流协议

为了让前端能边看边切阶段（聊天框 → 评分卡 → 信纸），前端和后端约定了一套轻量协议：

```
[[STAGE:writing]]       → 切换到"写初稿"，后续字符进入信纸区
[[STAGE:polishing]]     → 进入"评审"阶段
[[POLISH:json]]{score:92,issues:[],suggestions:""}  → 评分卡数据
[[STAGE:rewriting]]     → 评分不够，开始重写（清空信纸重来）
[[STAGE:done]]          → 全流程结束
```

---

## 🎯 核心设计决策

### 1. 为什么是 Multi-Agent 而不是一个大 Prompt？

**单 Prompt 写信** = 模型"猜"用户要什么，输出常常套路化。
**4 角色编排**：
- Listener 强制收集 4 个结构化字段（receiver / emotion / event / tone），避免模型自由发挥
- Polisher 用**独立视角**审视 Writer 的输出，是 Self-Critique 的关键 —— 同一个模型扮演评审，能跳出"作者偏好"
- Rewriter 把反馈作为**输入**重新写，而不是"基于上一版小修小补"，避免局部最优

### 2. 为什么用自定义流协议而不是 SSE？

SSE（`text/event-stream`）需要前端用 `EventSource`，但 `EventSource` **不支持 POST**。
我们用普通 `ReadableStream` + 自定义 `[[STAGE:*]]` 标记，前端 `reader.read()` 增量解析，**简单 / 通用 / 兼容浏览器**。

### 3. 为什么 Polisher 输出 JSON 不输出自然语言？

JSON 让程序能**判断 score 是否 < 80**，从而决定是否触发 Rewriter。
用 `response_format: { type: "json_object" }` 强制 OpenAI / DeepSeek 严格 JSON，比文本解析正则鲁棒 10 倍。

### 4. 为什么风格是 Prompt 注入而不是另开一个模型？

每种风格 ≈ 50 字的"风格指令" + 模仿对象描述，作为 user prompt 的尾巴注入。
- 零部署成本：增加风格只需改 `src/lib/styles.ts`
- 跨场景生效：朱自清式既能写家书也能写道歉信
- 实测效果：同一段素材，王小波风格和朱自清风格的输出**完全像两个人写的**

---

## 🛠️ 技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 框架 | Next.js 16 (App Router) | 前后端一体，Vercel 一键部署 |
| 语言 | TypeScript | 类型安全，重构无负担 |
| 样式 | Tailwind CSS 4 | 无 className 摩擦，所见即所得 |
| LLM | DeepSeek (OpenAI 兼容) | 中文好 + 便宜 |
| SDK | `openai` 官方包 | 切换 OpenAI 只需改 baseURL |
| 流 | Web ReadableStream | 原生 API，无三方依赖 |
| 导出 | `html-to-image` | DOM 转 PNG，不需要后端 |
| 持久化 | `localStorage` | 零成本，后续会升级 Supabase |

---

## 🚀 本地运行

```bash
git clone https://github.com/rainbowroy/letter-agent.git
cd letter-agent
npm install
cp .env.local.example .env.local
# 在 .env.local 填入 LLM_API_KEY（DeepSeek 或 OpenAI）
npm run dev
# 访问 http://localhost:3000
```

`.env.local` 示例：

```
LLM_API_KEY=sk-xxxxxxxxxxxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

---

## 📁 关键代码

```
letter-agent/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 前端主界面（5 阶段状态机 + 流协议解析）
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── chat/route.ts     # W1: Hello World 接口
│   │       ├── generate/route.ts # W2: 表单 → 整封信（流式）
│   │       └── converse/route.ts # W3+W4: 多轮对话 + Agent Loop ★
│   └── lib/
│       ├── scenarios.ts          # ★ 4 个 Prompt 构造器（Listener/Writer/Polisher/Rewriter）
│       ├── styles.ts             # 5 种文学风格定义
│       └── history.ts            # localStorage 历史
└── .env.local                    # gitignored
```

打 ★ 的两个文件是这个项目的"心脏"。

---

## 🧭 开发心路

这个项目是我从 0 开始用 6 周做的，**完全 vibe coding**（没系统学过前端）。重点不是代码本身，而是**逐周升级 Agent 思维**：

- **Week 1**：Hello World — 第一次让浏览器和 LLM 通话
- **Week 2**：MVP v0.1 — 表单 → 流式信件
- **Week 3**：MVP v0.2 — 多轮对话引导，Agent 雏形（Listener + Writer）
- **Week 4**：Self-Critique Loop — 加入 Polisher + Rewriter，**真正意义的 Agent 编排**
- **Week 5**：5 种文学风格、本地历史、信件导出图片
- **Week 6**：上线 Vercel + 包装

下一步规划：
- 🚧 Tool Use（让模型自己调用诗词搜索 / 关系记忆等工具）
- 🚧 Long-term Memory（写多了之后 Agent "记得"你和收信人的关系）
- 🚧 Supabase 登录 + 云端历史

---

## 📜 License

MIT
