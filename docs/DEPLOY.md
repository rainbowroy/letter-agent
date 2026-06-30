# 🚀 上线手册（5 分钟）

> 看完这一份就够了。下面每一步都给了截图位和**踩坑点**。

---

## Part 1 · Vercel 部署（5 分钟，全部点击操作）

### Step 1：注册 Vercel（如果还没有）

打开 [https://vercel.com/signup](https://vercel.com/signup)

选 **「Continue with GitHub」**（最方便，授权一次以后都不用配 SSH）。

### Step 2：导入项目

1. 登录后点击右上角 **「Add New」→「Project」**
2. 列表里找到 `rainbowroy/letter-agent`
3. 点击 **「Import」**

### Step 3：配置项目（关键 - 别点 Deploy 太快）

在配置页面，**找到 "Environment Variables" 区域**，添加 3 个变量：

| Name | Value |
|---|---|
| `LLM_API_KEY` | `sk-92c1f3e169b648e2b945de2acbeaeecf`（你 DeepSeek 的 key） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | `deepseek-chat` |

⚠️ **踩坑警告**：
- 默认 Vercel 会扫描 `.env.local`，但**这个文件在 gitignore 里没推到 GitHub**，所以 Vercel 拿不到。必须**手动加**。
- Framework Preset 应该自动识别为 **Next.js**，不用动。
- Root Directory 是 `letter-agent`（如果你的仓库根目录就是它，留空）。**这是最常出问题的地方**：如果你的 GitHub 仓库结构是 `letter-agent/letter-agent/...` 这种嵌套，需要把 Root Directory 设成 `letter-agent`。

### Step 4：点 Deploy

等待 60-90 秒。完成后 Vercel 会给你一个 URL，类似：

```
https://letter-agent-xxxxx.vercel.app
```

**立刻点开试一下**！

### Step 5：自定义子域名（可选，30 秒）

1. 进 Project Settings → Domains
2. 把默认域名改成 `letter-agent` 或你喜欢的（最终是 `letter-agent.vercel.app`）

如果被占用了，可以加个后缀：`letter-by-bw.vercel.app`

---

## Part 2 · 上线后 5 件事

### ① 真的发给一个朋友试用

不要发到群里。找一个**和你关系很好、最近你又有点话想说的朋友**。让 TA 试用，然后**写一封信发给你**。

这个反馈比任何"演示效果"都重要。

### ② 在 README 顶部把链接换成真实地址

打开 `README.md`，把：

```
🔗 **在线体验**：[https://letter-agent.vercel.app](...)（请替换为你的实际域名）
```

换成 Vercel 给你的真实地址，提交 push。

### ③ 同步更新 `docs/blog.md` 里的链接

同样把博客末尾的 `[letter-agent.vercel.app](...)（待替换为实际域名）` 换成真实地址。

### ④ 把 README 在线版本截图，存到桌面

GitHub 上自己仓库的 README 渲染出来很好看 —— 这是你以后简历、博客、自我介绍的**官方配图**。

### ⑤ 把这个项目加到 GitHub Profile 置顶

Profile 页面 → Customize your pins → 勾选 `letter-agent`。

让 HR 第一眼就看到。

---

## Part 3 · 录制 90 秒 Demo 视频脚本

工具：**QuickTime Player**（Mac 自带，免费） / **Loom**（更专业，免费版水印可接受）

### 录制建议
- 关掉所有通知（iMessage / 微信 / 钉钉）
- 浏览器开**无痕窗口**，让页面是干净的（没有书签栏、没有插件按钮）
- 缩放到 110-120%，文字更清楚
- **录之前先打几遍腹稿**，第一遍录不好就重来，不要剪辑（剪辑只会让你卡在剪辑里）

### 90 秒分镜

| 时间 | 画面 | 旁白（中文） |
|---|---|---|
| 0:00–0:08 | 首页加载 | "市面上的 AI 写作工具都让你填表单。我做了一个让你聊天的。" |
| 0:08–0:15 | 点击"家书"卡片，看到风格选择 | "选场景，选风格 —— 朱自清、王小波、还是港片台词式。" |
| 0:15–0:35 | AI 提问，用户回答 4 轮 | "它会像一个朋友一样问你：信给谁、想说什么情感、具体发生了什么。" |
| 0:35–0:50 | 进入流式写作，信件浮现 | "收齐信息后，4 个 AI 角色接力工作：写作者出初稿。" |
| 0:50–1:05 | Polisher 评分卡弹出（如果分高就略过；分低就重写） | "评审师严格打分。低于 80 分自动重写。" |
| 1:05–1:20 | 信件完成，鼠标滑过 Agent 思考过程面板 | "你能看到 Agent 的全部思考路径 —— 不是黑箱。" |
| 1:20–1:30 | 点击"导出图片"，截图弹出 | "一键导出信纸图片，发朋友圈。" |
| 1:30 结尾 | 静帧显示域名 | "letter-agent.vercel.app · 用 6 周用 vibe coding 做的 AI Agent" |

### 上传到哪里
- **B 站**：搜索友好，简历可附链接（"我用 6 周做了一个 AI Agent"）
- **小红书**：截图风格的版本（写作的过程截图）容易爆
- **Twitter**：英文 AI 圈关注度高
- **个人博客**：嵌入 YouTube/Bilibili

---

## Part 4 · 简历怎么写这个项目

在简历"项目经历"栏写成下面这样（直接复制改改就能用）：

```
情感书信助手（Letter Agent） · 个人项目 · 2026.6
项目地址：https://letter-agent.vercel.app
源码：https://github.com/rainbowroy/letter-agent

一个基于 4 角色 Self-Critique Loop 的中文情感书信生成 Agent。
用 6 周从 0 实现，包含 3 个场景 × 5 种文学风格 = 15 种信件配置。

技术亮点：
• 设计 Listener-Writer-Polisher-Rewriter 4 角色 Agent 编排，
  实现"模型评判模型 + 自动重写"的 Self-Critique 模式
• 自定义 Stream Protocol 实现单 endpoint 多阶段流式输出，
  前端通过 [[STAGE:*]] 标记增量解析切换 UI
• Polisher 使用 response_format: json_object 强制结构化输出，
  保证 score < 80 触发 Rewriter 的判断鲁棒性
• Prompt 工程实现 5 种文学风格（朱自清/王小波/港片台词等），
  同一素材输出气质完全不同的信件

技术栈：Next.js 16 · TypeScript · Tailwind · DeepSeek API ·
ReadableStream · localStorage · html-to-image

延伸阅读：详细技术博客见仓库 docs/blog.md
```

---

## Part 5 · 接下来 3 件可选的事

按"省力 → 费力"排：

1. **把链接同步给 3-5 个真朋友试用**（10 分钟）
2. **在掘金 / 知乎 / 小红书各发一篇 blog.md**（30 分钟）
3. **加 Tool Use（W7 增量）**（一周，可大幅提升简历亮点）

不急着马上做。**先睡一觉，明天看朋友的反馈再说。**
