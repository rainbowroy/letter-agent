# ✉️ Letter Agent · 情感书信助手

> 一个会**自我评审、必要时重写**的 4 角色 AI Agent。给一段真实素材，它会用你选择的文学风格，写出一封不套路的家书、情书或道歉信。

🔗 **在线体验**：[https://letter-agent.vercel.app](https://letter-agent.vercel.app)（手机端建议绑定自定义域名后访问，详见 `docs/DEPLOY.md`）
💻 **源码**：[https://github.com/rainbowroy/letter-agent](https://github.com/rainbowroy/letter-agent)

📚 **配套文档**：
- 📘 [docs/DEPLOY.md](./docs/DEPLOY.md) · 5 分钟 Vercel 上线 + 90 秒 Demo 录制脚本 + 简历项目经历模板
- 📕 [docs/blog.md](./docs/blog.md) · 技术博客《我用 6 周做了一个会自我评审的 Agent》（可直接发掘金/知乎/小红书）
- 📗 [docs/interview-faq.md](./docs/interview-faq.md) · 面试 FAQ（Self-Critique / JSON Mode / Stream Protocol 三大核心设计的深度问答）

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

## 📁 完整文件结构

> 用 `tree` 风格展示项目所有源文件（已排除 `node_modules`、`.next`、`.git`、`.vercel`）。
> 每个文件后面是它的职责说明 —— **新人接手的话，从 ★ 标记的文件开始读**。

```
letter-agent/
│
├── README.md                        ★ 你正在看的这份文档
├── package.json                     依赖清单（next / openai / html-to-image / tailwindcss）
├── package-lock.json                依赖版本锁定
├── tsconfig.json                    TypeScript 配置
├── next.config.ts                   Next.js 框架配置（目前空）
├── next-env.d.ts                    Next.js 类型声明（不要手改）
├── eslint.config.mjs                ESLint 规则
├── postcss.config.mjs               PostCSS（给 Tailwind 用）
├── .gitignore                       Git 忽略清单（含 .env.local、node_modules、.next）
├── .env.local                       ⚠️ 本地密钥，gitignored 永不上传
├── .env.local.example               环境变量样板（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）
│
├── AGENTS.md                        AI 助手协作约定（可选，给 Cursor/Codeflicker 看）
├── CLAUDE.md                        同上，给 Claude Code 看
│
├── docs/                            ★ 项目文档目录
│   ├── DEPLOY.md                    Vercel 部署 5 分钟清单 + Demo 视频脚本 + 简历模板
│   └── blog.md                      技术博客《我用 6 周做了一个会自我评审的 Agent》
│
├── public/                          静态资源（Next.js 自动以 / 开头托管）
│   ├── file.svg                     默认图标，未使用
│   ├── globe.svg                    默认图标，未使用
│   ├── next.svg                     默认图标，未使用
│   ├── vercel.svg                   默认图标，未使用
│   └── window.svg                   默认图标，未使用
│
└── src/                             ★ 所有源代码
    │
    ├── app/                         Next.js App Router 入口（约定大于配置）
    │   │
    │   ├── layout.tsx               根布局，HTML <head>、全局字体、lang="zh-CN"
    │   ├── page.tsx                 ★★★ 前端主界面（~530 行）
    │   │                              · 5 阶段状态机：pick → chatting → writing
    │   │                                            → polishing → rewriting → done
    │   │                              · 流式协议解析（[[STAGE:*]] / [[POLISH:json]]）
    │   │                              · 风格 Chip 选择器 / 历史抽屉 / 导出 PNG
    │   ├── globals.css              全局样式，含 Tailwind 指令
    │   └── favicon.ico              浏览器标签图标
    │   │
    │   └── api/                     后端 API 路由（Server-side）
    │       ├── chat/route.ts          W1 遗留：基础非流式接口（保留用于对比）
    │       ├── generate/route.ts      W2 遗留：表单 → 整封信流式接口
    │       └── converse/route.ts    ★★★ W3+W4+W5 的核心：4 角色 Agent Loop
    │                                  · 阶段 A：Listener 引导（检测 [[READY]]）
    │                                  · 阶段 B：Writer 流式出稿
    │                                  · 阶段 C：Polisher 评分（JSON Mode）
    │                                  · 阶段 D：score<80 → Rewriter 重写（最多 1 次）
    │
    └── lib/                         可复用的纯逻辑（无 React 依赖）
        ├── scenarios.ts             ★★★ 项目"心脏"：场景定义 + 4 个 Prompt 构造器
        │                              · SCENARIOS：3 个场景（家书/情书/道歉信）
        │                              · buildListenerSystemPrompt
        │                              · buildWriterPrompt（接收 styleId）
        │                              · buildPolisherPrompt（输出 JSON 评分）
        │                              · buildRewriterPrompt（带反馈重写）
        │                              · buildPrompt（W2 表单版本，保留）
        ├── styles.ts                 5 种文学风格（默认/朱自清/王小波/现代口语/港片）
        │                              · LETTER_STYLES：每种 = 50字风格指令
        │                              · getStyle(id)：取风格对象
        └── history.ts                localStorage 历史记录工具
                                       · loadHistory / saveHistory / deleteHistory
                                       · 最多存 10 条，超出自动淘汰最旧
```

## 🎯 新人 30 分钟读懂项目的路径

如果一个新工程师接手这个项目，按这个顺序读，30 分钟能完全掌握：

1. **5 分钟**：本文档（README）从头读到这里
2. **5 分钟**：<kbd>src/lib/scenarios.ts</kbd> — 4 个 Prompt 构造器，看懂"每个角色对模型说什么"
3. **5 分钟**：<kbd>src/lib/styles.ts</kbd> — 看懂"风格"如何用 Prompt 工程实现
4. **8 分钟**：<kbd>src/app/api/converse/route.ts</kbd> — 看 Agent Loop 编排逻辑
5. **7 分钟**：<kbd>src/app/page.tsx</kbd> — 看前端流协议解析（重点看 `runConverse` 函数里的 `while (true)` 块）

读完这 5 个文件，**剩下的都是脚手架**。

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
