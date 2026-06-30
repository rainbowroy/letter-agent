/**
 * 风格化金句库：按 styleId 分类，供 Writer Agent 通过 search_quotes 工具检索。
 *
 * 设计原则：
 * - 每条 quote 必须真实可考（避免"伪造名人名言"翻车）
 * - 控制规模（5-8 条/风格），不要让模型迷失在海量选项里
 * - 优先收录"具象画面 + 情感留白"的句子，最适合书信引用
 */

export interface Quote {
  text: string;
  author: string;
  source: string;
  /** 主题标签，方便按 theme 过滤（家书/情书/道歉/思念/陪伴等） */
  tags: string[];
}

export const QUOTES: Record<string, Quote[]> = {
  zhuziqing: [
    {
      text: "我与父亲不相见已二年余了，我最不能忘记的是他的背影。",
      author: "朱自清",
      source: "《背影》",
      tags: ["家书", "思念", "父亲"],
    },
    {
      text: "热闹是他们的，我什么也没有。",
      author: "朱自清",
      source: "《荷塘月色》",
      tags: ["孤独", "情书"],
    },
    {
      text: "燕子去了，有再来的时候；杨柳枯了，有再青的时候；桃花谢了，有再开的时候。",
      author: "朱自清",
      source: "《匆匆》",
      tags: ["时间", "思念"],
    },
    {
      text: "这几年来，我们东奔西走，居无定所，苦的总是你。",
      author: "朱自清",
      source: "《给亡妇》",
      tags: ["情书", "愧疚", "妻子"],
    },
    {
      text: "我心里颇不宁静。",
      author: "朱自清",
      source: "《荷塘月色》",
      tags: ["心境", "开篇"],
    },
  ],
  wangxiaobo: [
    {
      text: "你好哇，李银河。",
      author: "王小波",
      source: "《爱你就像爱生命》",
      tags: ["情书", "开篇"],
    },
    {
      text: "一想到你，我这张丑脸上就泛起微笑。",
      author: "王小波",
      source: "《爱你就像爱生命》",
      tags: ["情书", "幽默"],
    },
    {
      text: "我把我整个的灵魂都给你，连同它的怪癖、耍小脾气、忽明忽暗、一千八百种坏毛病。",
      author: "王小波",
      source: "《爱你就像爱生命》",
      tags: ["情书", "表白"],
    },
    {
      text: "似水流年才是一个人的一切，其余的全是片刻的欢娱和不幸。",
      author: "王小波",
      source: "《似水流年》",
      tags: ["时间", "感悟"],
    },
    {
      text: "我和你好像一条河里的两条鱼，不管碰到什么浊浪，我们都不会分散。",
      author: "王小波",
      source: "《爱你就像爱生命》",
      tags: ["情书", "陪伴"],
    },
  ],
  hkmovie: [
    {
      text: "如果记忆是一个罐头，我希望这罐罐头不会过期。",
      author: "王家卫",
      source: "《重庆森林》",
      tags: ["思念", "时间"],
    },
    {
      text: "有些事情不告诉别人，是因为不能说；有些事情不告诉别人，是因为说出来你也未必会懂。",
      author: "王家卫",
      source: "《2046》",
      tags: ["道歉", "遗憾"],
    },
    {
      text: "见自己，见天地，见众生。",
      author: "王家卫",
      source: "《一代宗师》",
      tags: ["感悟", "成长"],
    },
    {
      text: "我们之间的距离，只有 0.01 公分。56 个小时之后，我爱上了这个女人。",
      author: "王家卫",
      source: "《重庆森林》",
      tags: ["情书", "数字"],
    },
    {
      text: "如果多一张船票，你会不会跟我一起走？",
      author: "王家卫",
      source: "《花样年华》",
      tags: ["情书", "遗憾"],
    },
  ],
  modern: [
    {
      text: "成年人的崩溃是从算钱开始的。",
      author: "网络",
      source: "现代口语",
      tags: ["自嘲", "生活"],
    },
    {
      text: "其实我没那么坚强，只是没人可以依靠。",
      author: "网络",
      source: "现代口语",
      tags: ["道歉", "脆弱"],
    },
    {
      text: "想你的时候，全世界都安静了。",
      author: "网络",
      source: "现代口语",
      tags: ["思念", "情书"],
    },
  ],
  default: [
    {
      text: "见字如面。",
      author: "古语",
      source: "传统书信开篇",
      tags: ["开篇"],
    },
    {
      text: "纸短情长。",
      author: "古语",
      source: "传统书信结尾",
      tags: ["结尾"],
    },
  ],
};

/**
 * 按风格 + 主题检索金句。
 * - 若 theme 命中 tag，则只返回带该 tag 的；否则返回该风格全部。
 * - 最多返回 4 条，避免 prompt 过长。
 */
export function searchQuotesByStyle(styleId: string, theme?: string): Quote[] {
  const pool = QUOTES[styleId] || QUOTES.default;
  if (!theme) return pool.slice(0, 4);
  const filtered = pool.filter((q) =>
    q.tags.some((t) => t.includes(theme) || theme.includes(t))
  );
  return (filtered.length > 0 ? filtered : pool).slice(0, 4);
}
