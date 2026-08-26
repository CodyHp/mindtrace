<div align="center">

# 🧭 MindTrace

**看清你的注意力，究竟流向了哪里。**

一款静默、本地优先的 Obsidian **注意力 / 时间追踪**插件 —— 用一张「主题 × 时间」看板，还原你的专注、你的写作输出、你的习惯。

[![GitHub release](https://img.shields.io/github/v/release/CodyHp/obstracker?style=flat-square)](https://github.com/CodyHp/obstracker/releases)
[![License](https://img.shields.io/github/license/CodyHp/obstracker?style=flat-square)](LICENSE)

[English](README.md) · [中文](README.zh-CN.md)

</div>

---

## ✨ 一张图，看懂你的一天

MindTrace 是一款零打扰的**时间追踪 + 注意力分析**插件。它在后台静默记录你在每篇笔记上停留、阅读、写作的时长，再按**文件夹**归类，绘制成「主题 × 时间」热力图。一眼就能看出——「早晨属于哲学，下午属于代码」。

<p align="center"><img src="images/time-topic.png" alt="主题 × 时间热力图" width="80%"></p>

## 🚀 为什么选择 MindTrace？

- **零打扰** —— 没有计时器、没有按钮、没有弹窗。它只是静静地看着，写作心流不被打断。
- **文件夹即主题** —— 你的 vault 本来就有条理；MindTrace 把你的文件夹树当作分类体系，时间可递归上卷，主题 → 子文件夹 → 文件层层下钻。
- **读写弱推断** —— 用透明的启发式规则，把你的活跃时间拆成「阅读」和「写作」，无需手动打标签。
- **100% 本地** —— 一切都在你的 vault 里。没有账号、没有云端、没有遥测，也从不读取你的笔记内容。
- **量化自我** —— 不是催你效率的唠叨鬼，而是一面镜子：用「你最投入的主题是哲学」这样的自然语言洞察，帮你反思而非评判。

## 📊 一整套洞察看板

| | |
|:---:|:---:|
| **主题 × 时间** —— 你的注意力按小时流向 | **主题排行** —— 支持点击下钻 |
| <img src="images/time-topic.png" width="100%"> | <img src="images/topic-ranking.png" width="100%"> |
| **活跃时段** —— 你真正在投入的时刻 | **活跃日历** —— GitHub 风格的连续打卡 |
| <img src="images/active-hours.png" width="100%"> | <img src="images/activity-calendar.png" width="100%"> |
| **文档活跃度** —— 写作 vs 浏览（日/周/月/季/年） | **本周 vs 上周** —— 你在爬坡吗？ |
| <img src="images/doc-activity.png" width="100%"> | <img src="images/week-compare.png" width="100%"> |
| **星期分布** —— 你的每周节奏 | **字数趋势** —— 写作产出随时间变化 |
| <img src="images/weekday-distribution.png" width="100%"> | <img src="images/word-trend.png" width="100%"> |
| **阅读 vs 写作** —— 你的时间构成 | **单篇字数增长** —— 每篇文档的写作轨迹 |
| <img src="images/read-write.png" width="100%"> | <img src="images/word-growth.png" width="100%"> |

每一张图表都能一键导出 **PNG / JSON / CSV**。整个看板跟随你的 Obsidian 主题与强调色。

## 🔒 隐私至上

数据以 append-only 的 JSONL 写入 vault 里的 `.mindtrace/`。**没有网络、没有遥测、没有云端、不读笔记内容** —— 只记录元数据（路径、时间戳、时长、字符增减）。你的笔记永远不会离开你的电脑。

## 📦 安装

在 Obsidian 社区插件市场搜索 **MindTrace** 安装即可。或手动安装：

1. 从[最新 release](https://github.com/CodyHp/obstracker/releases)下载 `main.js`、`manifest.json`、`styles.css`。
2. 复制到 `<vault>/.obsidian/plugins/obstracker/`。
3. 在「设置 → 第三方插件」里启用 **MindTrace**。

## 🖱 使用

1. 启用插件后自动开始记录，无需任何配置。
2. 点击左侧边栏的图表图标，或运行命令 **「打开看板」**，打开专属看板笔记。
3. （可选）在任意笔记里用 ` ```mindtrace ` 代码块嵌入看板。

数据存放在 `.mindtrace/events-YYYY-MM-DD.jsonl`（每天一个文件）。

## 🛠 开发

```bash
npm install
npm run dev     # 监听 & 构建
npm run build   # 类型检查 + 生产构建
npm test        # 单元测试
```

## 📄 许可证

[MIT](LICENSE)
