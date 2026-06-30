# 情感书信助手（开发中）

一个辅助普通人写好家书 / 情书 / 道歉信的 AI Agent。

> 这是一个零基础学习者的 6-8 周成长项目，记录从「Hello World」到「上线 Agent」的全过程。

## 当前进度

- [x] Week 1：Hello World —— Next.js + OpenAI 兼容 API 端到端跑通
- [ ] Week 2：MVP v0.1 —— 表单生成整封信（流式输出）
- [ ] Week 3：MVP v0.2 —— 多轮对话引导
- [ ] Week 4：三角色 Agent Loop（倾听者 / 写作者 / 润色师）
- [ ] Week 5：用户系统 + 历史记录 + 风格选择
- [ ] Week 6：上线 + Demo

## 本地运行

```bash
cp .env.local.example .env.local   # 然后在 .env.local 中填入你的 API Key
npm install
npm run dev
```

打开 http://localhost:3000

## 技术栈

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- OpenAI SDK（兼容 DeepSeek）
- 部署：Vercel（TBD）
