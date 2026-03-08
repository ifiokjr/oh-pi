<div align="center">

<img src="./logo.svg" width="180" alt="oh-pi logo"/>

# 🐜 oh-pi

**一条命令，增强 [pi-coding-agent](https://github.com/badlogic/pi-mono)。**

就像 oh-my-zsh 之于 pi —— 但带有自主蚁群系统。

[![npm](https://img.shields.io/npm/v/oh-pi)](https://www.npmjs.com/package/oh-pi)
[![license](https://img.shields.io/npm/l/oh-pi)](./LICENSE)
[![node](https://img.shields.io/node/v/oh-pi)](https://nodejs.org)

[English](./README.md) | [中文](./README.zh.md) | [Français](./README.fr.md)

```bash
npx oh-pi
```

</div>

---

## 30 秒上手

```bash
npx oh-pi    # 配置一切
pi           # 开始编码
```

就这样。oh-pi 会自动检测环境、引导配置，并写入 `~/.pi/agent/`。

已有配置？会先备份，再覆盖。

## 2 分钟看懂价值

oh-pi 把原本分散且手工的配置流程（提供商、主题、扩展、技能、提示词模板）整合成一次引导，通常 1 分钟内完成。

当任务涉及多文件或可并行流程时，可启用蚁群系统，把 pi 升级为可协作的多智能体执行流。

- [`docs/DEMO-SCRIPT.zh.md`](./docs/DEMO-SCRIPT.zh.md) — 2 分钟演示脚本（价值与节奏）
- [`ROADMAP.md`](./ROADMAP.md) — 定位、里程碑与衡量指标
- [`DECISIONS.md`](./DECISIONS.md) — 阶段性关键决策与取舍依据

## 何时不该用蚁群

以下场景建议**不要**启用蚁群，直接单代理更快：

- 只改 1 个文件、改动范围明确
- 快速问答、解释代码、一次性小修复
- 你需要严格串行控制每一步修改

## 你会得到

```
~/.pi/agent/
├── auth.json            API 密钥（0600 权限）
├── settings.json        模型、主题、思维级别
├── keybindings.json     Vim/Emacs 快捷键（可选）
├── AGENTS.md            角色专属 AI 指南
├── extensions/          8 个扩展（7 个默认 + 蚁群）
│   ├── safe-guard       危险命令确认 + 路径保护
│   ├── git-guard        自动 stash 检查点 + 脏仓库警告
│   ├── auto-session     从首条消息自动命名会话
│   ├── custom-footer    增强状态栏（token/成本/时间/git/cwd）
│   ├── compact-header   精简启动信息
│   ├── auto-update      启动时检查更新
│   ├── bg-process       ⏳ **后台进程** — 自动后台化长时间运行的命令（开发服务器等）
│   └── ant-colony/      🐜 自主多智能体蚁群系统（可选）
├── prompts/             10 个模板（/review /fix /commit /test ...）
├── skills/              11 个技能（工具 + UI 设计 + 工作流）
└── themes/              6 个自定义主题
```

## 配置模式

| 模式          | 步骤 | 适合                       |
| ------------- | ---- | -------------------------- |
| 🚀 **快速**   | 3    | 选提供商 → 输入密钥 → 完成 |
| 📦 **预设**   | 2    | 选角色方案 → 输入密钥      |
| 🎛️ **自定义** | 6    | 逐项自选                   |

### 预设方案

|           | 主题       | 思维   | 包含                      |
| --------- | ---------- | ------ | ------------------------- |
| 🟢 全功能 | oh-pi Dark | high   | 全部扩展含蚁群 + 后台进程 |
| 🔵 干净   | Default    | off    | 无扩展仅核心              |
| 🟣 仅蚁群 | oh-pi Dark | medium | 蚁群 + 最小配置           |

### 提供商

Anthropic · OpenAI · Google Gemini · Groq · OpenRouter · xAI · Mistral ·
[FOXNIO](https://www.foxnio.com)（推荐的公益 Claude 提供商）

自动从环境变量检测 API 密钥。

## 🐜 蚁群系统

核心功能。模拟真实蚁群生态的多智能体系统 —— 深度整合 pi SDK。

```
你: "把认证从 session 重构为 JWT"

oh-pi:
  🔍 侦察蚁探索代码库（haiku — 快速、低成本）
  📋 根据发现生成任务池
  ⚒️  工蚁并行执行任务（sonnet — 能力强）
  🛡️ 兵蚁审查所有变更（sonnet — 严谨）
  ✅ 完成 — 报告自动注入对话
```

### v0.1.75 更新亮点

- **Planning Recovery 回路**：当 scout 产出非结构化情报时，进入
  `planning_recovery`，而不是直接失败。
- **执行前计划校验**：worker 启动前会校验任务字段完整性（title/description/caste/priority）。
- **复杂目标 Scout Quorum**：多步骤目标默认至少 2 个 scout，提升规划可靠性。

### 生命周期（简化）

`SCOUTING →（必要时）PLANNING_RECOVERY → WORKING → REVIEWING → DONE`

### 架构

每只蚂蚁是进程内的 `AgentSession`（pi SDK），而非子进程：

```
pi（主进程）
  └─ ant_colony tool
       └─ queen.ts → runColony()
            └─ spawnAnt() → createAgentSession()
                 ├─ session.subscribe() → 实时 token 流
                 ├─ 零启动开销（共享进程）
                 └─ 共享认证和模型注册表
```

**交互模式：** 蚁群在后台运行 —— 你可以继续聊天。实时 widget 显示蚂蚁进度，完成后结果自动注入对话。

**Print 模式（`pi -p`）：** 蚁群同步运行，阻塞直到完成。

### 为什么是蚁群？

真实蚁群无需中央控制就能解决复杂问题。每只蚂蚁遵循简单规则，通过**信息素**通信，群体自组织。oh-pi 直接映射：

| 真实蚁群         | oh-pi                                    |
| ---------------- | ---------------------------------------- |
| 侦察蚁发现食物   | 侦察蚁扫描代码库，识别目标               |
| 信息素路径       | `.ant-colony/pheromone.jsonl` — 共享发现 |
| 工蚁搬运食物     | 工蚁在分配的文件上执行任务               |
| 兵蚁守卫巢穴     | 兵蚁审查变更，请求修复                   |
| 食物越多蚂蚁越多 | 任务越多并发越高（自适应）               |
| 信息素蒸发       | 10 分钟半衰期 — 过时信息自动淡化         |

### 实时 UI

交互模式下，蚁群显示实时进度：

- **状态栏**
  — 紧凑 footer 显示真实指标：完成任务数、活跃蚂蚁、工具调用次数、输出 token 数、成本、耗时
- **Ctrl+Shift+A** — 弹出详情面板，显示任务列表、活跃蚂蚁流、蚁群日志
- **通知** — 完成时显示汇总

使用 `/colony-stop` 中止运行中的蚁群。

### 信号协议

蚁群通过结构化信号与主对话通信，让模型无需猜测后台状态。更新采用被动推送（非阻塞），轮询仅在手动排障时需要：

| 信号                              | 含义                       |
| --------------------------------- | -------------------------- |
| `COLONY_SIGNAL:LAUNCHED`          | 蚁群已在后台启动           |
| `COLONY_SIGNAL:SCOUTING`          | 侦察波次正在探索/规划      |
| `COLONY_SIGNAL:PLANNING_RECOVERY` | 计划恢复回路正在重组任务   |
| `COLONY_SIGNAL:WORKING`           | 工蚁执行阶段进行中         |
| `COLONY_SIGNAL:REVIEWING`         | 兵蚁审查阶段进行中         |
| `COLONY_SIGNAL:TASK_DONE`         | 单个任务完成（进度检查点） |
| `COLONY_SIGNAL:COMPLETE`          | 蚁群完成并注入报告         |
| `COLONY_SIGNAL:FAILED`            | 蚁群失败并附带诊断信息     |
| `COLONY_SIGNAL:BUDGET_EXCEEDED`   | 达到预算上限               |

### 轮次控制

每只蚂蚁有严格的轮次预算，防止失控执行：

侦察蚁：8 轮 · 工蚁：15 轮 · 兵蚁：8 轮

### 模型选择

蚁群自动检测可用模型，让 LLM 按角色选择最优模型：

| 角色   | 策略                  | 示例                              |
| ------ | --------------------- | --------------------------------- |
| 侦察蚁 | 快速便宜 — 只读不改   | `claude-haiku-4-5`, `gpt-4o-mini` |
| 工蚁   | 能力强 — 执行代码修改 | `claude-sonnet-4-0`, `gpt-4o`     |
| 兵蚁   | 与工蚁相同或稍便宜    | `claude-sonnet-4-0`               |

不指定模型则默认使用当前会话模型。

### 成本报告

蚁群追踪每只蚂蚁和总花费，在最终报告中汇总。**成本不会中断执行** —— 轮次限制和并发控制负责资源管理。

### 自动触发

LLM 自行决定何时部署蚁群，你不需要操心：

- **≥3 个文件**需要修改 → 蚁群
- **可并行工作流** → 蚁群
- **单文件**修改 → 直接执行（无蚁群开销）

### 自适应并发

蚁群自动找到你机器的最优并行度：

```
冷启动       →  ceil(max/2) 只蚂蚁（快速启动）
探索阶段     →  每波 +1，监控吞吐量
吞吐量下降   →  锁定最优值，稳定运行
CPU > 85%   →  立即降低
429 限流     →  并发 -1 + 退避（2s→5s→10s 上限）
任务完成     →  缩减到最小值
```

### 文件安全

一个文件只有一只蚂蚁。始终如此。冲突任务自动阻塞，锁释放后恢复。

## 技能

oh-pi 附带 11 个技能，分三类。

### 🔧 工具技能

零依赖 Node.js 脚本 —— 无需 API 密钥。

| 技能         | 功能                              |
| ------------ | --------------------------------- |
| `context7`   | 通过 Context7 API 查询最新库文档  |
| `web-search` | DuckDuckGo 搜索（免费，无需密钥） |
| `web-fetch`  | 提取网页内容为纯文本              |

```bash
# 示例
./skills/context7/search.js "react"
./skills/web-search/search.js "typescript generics" -n 5
./skills/web-fetch/fetch.js https://example.com
```

### 🎨 UI 设计规范技能

完整的设计规范，包含 CSS tokens、组件示例和设计原则。当你要求特定视觉风格时，agent 自动加载。

| 技能            | 风格                       | CSS 前缀   |
| --------------- | -------------------------- | ---------- |
| `liquid-glass`  | Apple WWDC 2025 半透明玻璃 | `--lg-`    |
| `glassmorphism` | 毛玻璃模糊 + 透明          | `--glass-` |
| `claymorphism`  | 柔和 3D 粘土质感           | `--clay-`  |
| `neubrutalism`  | 粗边框、偏移阴影、高对比   | `--nb-`    |

每个都包含 `references/tokens.css`，可直接使用的 CSS 自定义属性。

```
你: "用液态玻璃风格做一个仪表盘"
pi 加载 liquid-glass 技能 → 应用 --lg- tokens、玻璃效果、高光动画
```

### 🔄 工作流技能

| 技能           | 功能                         |
| -------------- | ---------------------------- |
| `quick-setup`  | 检测项目类型，生成 .pi/ 配置 |
| `debug-helper` | 错误分析、日志解读、性能分析 |
| `git-workflow` | 分支、提交、PR、冲突解决     |
| `ant-colony`   | 蚁群管理命令和策略           |

## 主题

|                         |                     |
| ----------------------- | ------------------- |
| 🌙 **oh-pi Dark**       | 青色 + 紫色，高对比 |
| 🌙 **Cyberpunk**        | 霓虹洋红 + 电光青   |
| 🌙 **Nord**             | 北极蓝色调          |
| 🌙 **Catppuccin Mocha** | 暗底柔和色          |
| 🌙 **Tokyo Night**      | 蓝紫暮色            |
| 🌙 **Gruvbox Dark**     | 暖色复古            |

## 提示词模板

```
/review    代码审查：bug、安全、性能
/fix       最小改动修复错误
/explain   代码解释，从简到详
/refactor  保持行为的重构
/test      生成测试
/commit    Conventional Commit 消息
/pr        Pull Request 描述
/security  OWASP 安全审计
/optimize  性能优化
/document  生成文档
```

## AGENTS.md 模板

| 模板             | 方向                 |
| ---------------- | -------------------- |
| 通用开发者       | 通用编码指南         |
| 全栈开发者       | 前端 + 后端 + 数据库 |
| 安全研究员       | 渗透测试 & 审计      |
| 数据 & AI 工程师 | MLOps & 管道         |
| 🐜 蚁群操作员    | 多智能体编排         |

## 也是 Pi 包

跳过配置器，直接安装资源：

```bash
pi install npm:oh-pi
```

将所有主题、提示词、技能和扩展添加到你现有的 pi 配置中。

## 要求

- Node.js ≥ 20
- 至少一个 LLM API 密钥
- pi-coding-agent（缺失时自动安装）

## 许可证

MIT
