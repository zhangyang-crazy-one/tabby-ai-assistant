# Tabby AI Assistant Plugin

一个强大的Tabby终端AI助手插件，支持多AI提供商，提供智能命令生成、解释和安全验证功能。

## 🌟 特性

### 核心功能
- **多AI提供商支持** - 支持OpenAI、Anthropic、Minimax、GLM、Ollama、vLLM等
- **智能命令生成** - 自然语言转终端命令，准确率高
- **命令解释** - 详细解释命令含义和用法
- **错误修复** - 自动分析错误并提供修复建议
- **终端感知** - 实时感知终端状态
- **智能 Agent 工具调用循环** - 支持多轮工具自动调用，智能终止检测
- **MCP 服务器支持** - 通过 Model Context Protocol 扩展 AI 工具能力

### 安全特性
- **多级风险评估** - 自动识别危险命令（低/中/高/极风险）
- **用户同意管理** - 30天同意持久化
- **密码保护** - 高风险命令需要密码验证
- **安全模式** - 自动阻止极危险操作

### Tabby集成
- **设置页面** - 专用配置标签页
- **工具栏按钮** - 一键打开AI助手
- **热键支持** - 自定义快捷键 + 智能感知终端上下文
- **主题支持** - 5种主题：跟随系统、浅色、深色、像素复古、赛博科技、羊皮卷
- **上下文菜单** - 右键快速操作
- **数据管理** - 文件存储、导入导出、迁移工具

## 🚀 支持的AI提供商

### 云服务提供商

| 提供商 | 默认端点 | 默认模型 | 特点 |
|--------|---------|---------|------|
| **OpenAI** | `https://api.openai.com/v1` | GPT-4 | 功能全面，性能稳定 |
| **Anthropic** | `https://api.anthropic.com` | Claude-3-Sonnet | 安全性高，推理能力强 |
| **Minimax** | `https://api.minimaxi.com/anthropic` | MiniMax-M2 | 专为代码优化 |
| **GLM** | `https://open.bigmodel.cn/api/anthropic` | GLM-4.6 | 中文优化，支持双模式 |

#### GLM 双模式支持

GLM 提供商支持两种 API 格式，可根据 Base URL 自动选择：

| 模式 | Base URL | 端点 | 技术实现 |
|------|---------|------|---------|
| **Anthropic 兼容** | `https://open.bigmodel.cn/api/anthropic` | `/v1/messages` | Anthropic SDK |
| **OpenAI 兼容** | `https://open.bigmodel.cn/api/paas/v4` | `/chat/completions` | Axios (responseType: 'text') |

**自动检测**：根据 Base URL 自动选择模式：
- 包含 `/anthropic` → 使用 Anthropic SDK
- 其他 → 使用 Axios (OpenAI 格式)

**浏览器兼容性**：修复了 `responseType: 'stream'` 在浏览器环境中的兼容性问题。

### 本地/自托管提供商

| 提供商 | 默认端点 | 默认模型 | 特点 |
|--------|---------|---------|------|
| **Ollama** | `http://localhost:11434/v1` | llama3.1 | 本地运行，无需API密钥 |
| **vLLM** | `http://localhost:8000/v1` | Llama-3.1-8B | 高性能推理框架 |
| **OpenAI Compatible** | 自定义 | 自定义 | 兼容 DeepSeek、OneAPI 等第三方站点，支持禁用流式响应 |

## 🔌 MCP 服务器支持

### 什么是 MCP？

MCP (Model Context Protocol) 是 Anthropic 提出的开放协议，允许 AI 模型与外部工具和服务进行通信。通过 MCP 服务器，您可以扩展 AI 助手的能力，使其能够访问更多工具和数据源。

### 支持的传输类型

| 传输类型 | 适用场景 | 配置项 |
|----------|---------|--------|
| **Stdio** | 本地进程 | command, args, env, cwd |
| **SSE** | 远程服务器 | url, headers |
| **HTTP** | HTTP 服务 | url, headers, session 管理 |

### 配置 MCP 服务器

1. 打开 Tabby 设置 → AI助手 → **MCP服务器** 标签
2. 点击 **添加服务器** 按钮
3. 选择传输类型并填写配置：
   - **Stdio**: 输入命令、参数、环境变量和工作目录
   - **SSE/HTTP**: 输入服务器 URL 和请求头
4. 启用 **自动连接** 选项，服务器将在启动时自动连接
5. 点击 **连接** 按钮测试连接

### 示例：添加一个本地 MCP 服务器

```json
{
    "name": "filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    "env": {},
    "cwd": "/home/user",
    "enabled": true,
    "autoConnect": true
}
```

### 可用的 MCP 工具

连接 MCP 服务器后，AI 助手将自动发现并使用服务器提供的工具。工具名称格式为 `mcp_{serverId}_{toolName}`。

### 高级功能

#### 超时管理
每个 MCP 服务器可以配置请求超时时间：
```json
{
    "name": "myserver",
    "timeout": 60000,
    ...
}
```
- **默认超时**: 30 秒
- **范围**: 1 秒 ~ 5 分钟

#### 自动重试
工具调用失败时自动重试：
- **最大重试次数**: 3 次
- **重试延迟**: 递增延迟（1s → 2s → 3s）
- **日志记录**: 每次重试都有日志输出

#### 调用日志
系统记录所有工具调用历史：
- **保留数量**: 最多 1000 条
- **记录内容**: clientId, toolName, arguments, result, success, duration, timestamp
- **统计信息**: 支持查询调用统计（总数/成功/失败/平均耗时）

### 故障排除

| 问题 | 解决方案 |
|------|----------|
| 连接超时 | 增加 `timeout` 配置值 |
| 工具调用失败 | 检查服务器日志，启用重试机制 |
| 频繁断开 | 确认服务器 URL 或 command 配置正确 |

## 📦 安装

### 从源码安装
```bash
cd tabby-ai-assistant
npm install
npm run build
```

### 在Tabby中启用
1. 打开Tabby设置
2. 导航到"插件"标签
3. 找到"AI助手"插件并启用
4. 重启Tabby

## ⚙️ 配置

### 1. 设置API密钥
1. 打开Tabby设置 → AI助手
2. 选择AI提供商
3. 输入API密钥（本地服务如Ollama无需密钥）
4. 选择模型
5. 保存设置

### 2. 配置安全选项
- **密码保护**: 启用高风险命令密码验证
- **同意过期**: 设置用户同意保存天数（默认30天）
- **自动批准**: 低风险命令自动执行

### 4. 主题设置
支持5种视觉主题：
| 主题 | 描述 |
|------|------|
| 跟随系统 | 自动匹配操作系统主题 |
| 浅色主题 | 经典亮色界面 |
| 深色主题 | 深色背景护眼模式 |
| 像素复古 | 8-bit像素风格 |
| 赛博科技 | 赛博朋克科技风格 |
| 羊皮卷 | 复古纸张质感亮色主题 |

### 5. 自定义热键
默认热键：
- `Ctrl-Shift-A`: 打开AI助手聊天
- `Ctrl-Shift-G`: 生成/优化命令
- `Ctrl-Shift-E`: 解释命令

## 🎯 使用指南

### 聊天模式
1. 点击工具栏的AI助手图标
2. 在聊天框中输入问题
3. AI将回答您的问题

### 快捷键

| 快捷键 | 功能 | 描述 |
|--------|------|------|
| `Ctrl+Shift+A` | 打开/关闭 AI 助手 | 切换侧边栏显示 |
| `Ctrl+Shift+G` | 生成/优化命令 | 智能感知终端选区、历史命令和上下文 |
| `Ctrl+Shift+E` | 解释命令 | 智能感知终端选区或最近执行的命令 |

### 智能终端感知
快捷键功能自动从终端获取上下文：
- **选中文字**: 使用当前选中的文本作为输入
- **历史命令**: 自动读取最近执行的命令
- **终端输出**: 获取最近的终端输出作为参考上下文

### 命令生成 (Ctrl+Shift+G)
**方式一：选中文本**
1. 选中终端中的文本或命令
2. 按 `Ctrl+Shift+G`
3. 侧边栏自动打开并填充提示
4. AI 生成优化后的命令

**方式二：基于上下文**
1. 无需选中文本
2. 按 `Ctrl+Shift+G`
3. AI 读取终端最近的历史和输出
4. 生成适合当前场景的命令

### 命令解释 (Ctrl+Shift+E)
**方式一：选中文本**
1. 选中终端中的命令
2. 按 `Ctrl+Shift+E`
3. AI 详细解释命令各部分的含义

**方式二：解释历史命令**
1. 无需选中文本
2. 按 `Ctrl+Shift+E`
3. AI 自动读取最近执行的命令并解释

### 错误修复
1. 当命令执行失败时
2. AI会自动检测错误
3. 提供修复建议
4. 生成修复命令

## 🔒 安全机制

### 风险级别
- **低风险** (绿色): 安全命令，如 `ls`, `cat`, `grep`
- **中风险** (黄色): 系统查询命令，如 `ps`, `df`, `find`
- **高风险** (橙色): 系统修改命令，如 `chmod`, `mv`, `rm`
- **极风险** (红色): 危险命令，如 `rm -rf /`, `fork(`

### 防护措施
1. **模式匹配**: 自动识别危险命令模式
2. **用户确认**: 中高风险命令需要确认
3. **密码验证**: 极高风险命令需要密码
4. **同意持久化**: 记住用户的选择（30天）

## 📁 数据管理

### 文件存储
插件数据存储在用户可访问的目录中：
- **Windows**: `%APPDATA%\tabby\plugins\tabby-ai-assistant\data`
- **Linux/macOS**: `$HOME/.config/tabby/plugins/tabby-ai-assistant/data`

### 存储文件
| 文件 | 说明 |
|------|------|
| `memories.json` | AI记忆数据（短期/中期/长期） |
| `chat-sessions.json` | 聊天会话历史 |
| `checkpoints.json` | 上下文检查点 |
| `config.json` | 插件配置 |
| `consents.json` | 用户授权记录 |
| `password.json` | 密码哈希 |
| `context-config.json` | 上下文配置 |
| `auto-compact.json` | 自动压缩设置 |

### 功能
- **查看数据目录**: 在设置中打开数据存储目录
- **导出所有数据**: 将所有数据导出为JSON备份文件
- **导入数据**: 从备份文件恢复数据
- **迁移数据**: 从浏览器localStorage迁移到文件存储
- **清除数据**: 一键清除所有存储数据

### 迁移说明
从旧版本升级后，系统会检测浏览器存储中的旧数据，并提示是否迁移到新的文件存储系统。

## 🏗️ 项目架构

### 技术栈
- **Angular 15** - UI框架
- **TypeScript** - 类型安全
- **Webpack 5** - 模块打包
- **RxJS** - 响应式编程

### 项目结构

```
tabby-ai-assistant/
├── src/
│   ├── index.ts                      # Angular主模块
│   ├── types/                        # 类型定义
│   │   ├── ai.types.ts               # AI相关类型（ChatRequest, ChatResponse等）
│   │   ├── provider.types.ts         # 提供商类型 + PROVIDER_DEFAULTS
│   │   ├── security.types.ts         # 安全类型
│   │   └── terminal.types.ts         # 终端类型
│   ├── services/                     # 服务层
│   │   ├── core/                     # 核心服务
│   │   │   ├── ai-assistant.service.ts
│   │   │   ├── ai-provider-manager.service.ts
│   │   │   ├── config-provider.service.ts
│   │   │   ├── logger.service.ts
│   │   │   └── toast.service.ts      # Toast通知服务
│   │   ├── providers/                # AI提供商实现
│   │   │   ├── base-provider.service.ts    # 基础类（含通用方法）
│   │   │   ├── anthropic-provider.service.ts
│   │   │   ├── glm-provider.service.ts
│   │   │   ├── minimax-provider.service.ts
│   │   │   ├── ollama-provider.service.ts
│   │   │   ├── openai-compatible.service.ts
│   │   │   ├── openai-provider.service.ts
│   │   │   └── vllm-provider.service.ts
│   │   ├── security/                 # 安全服务
│   │   │   └── risk-assessment.service.ts
│   │   ├── mcp/                      # MCP 协议实现
│   │   │   ├── mcp-message.types.ts       # MCP 消息类型定义
│   │   │   ├── mcp-client-manager.service.ts  # MCP 客户端管理器
│   │   │   └── transports/                # 传输层实现
│   │   │       ├── base-transport.ts      # 传输基类
│   │   │       ├── stdio-transport.ts     # Stdio 传输
│   │   │       ├── sse-transport.ts       # SSE 传输
│   │   │       └── http-transport.ts      # HTTP 传输
│   │   └── terminal/                 # 终端服务
│   │       └── terminal-context.service.ts
│   ├── components/                   # UI组件
│   │   ├── ai-sidebar.component.ts
│   │   ├── chat/                     # 聊天组件
│   │   ├── settings/                 # 设置组件（含 mcp-settings）
│   │   ├── security/                 # 安全组件
│   │   ├── terminal/                 # 终端组件
│   │   └── common/                   # 公共组件
│   └── styles/                       # 样式文件
│       └── ai-assistant.scss
├── webpack.config.js                 # Webpack配置
├── tsconfig.json                     # TypeScript配置
└── package.json                      # 依赖配置
```

### 设计模式

#### 1. 提供商模式 (Provider Pattern)
```
IBaseAiProvider (接口)
    ↑
    └── BaseAiProvider (抽象类，包含通用方法)
            ↑
            ├── OpenAiProviderService
            ├── AnthropicProviderService
            ├── MinimaxProviderService
            └── ...
```

#### 2. 配置统一化
- 所有提供商默认配置存储在 `PROVIDER_DEFAULTS`
- 使用 `ProviderConfigUtils` 工具函数处理配置
- 配置自动从统一默认值填充

## 🔧 开发

### 构建
```bash
npm run build      # 生产构建
npm run watch      # 开发模式（自动重编译）
npm run clean      # 清理构建文件
```

### 添加新提供商
1. 在 `provider.types.ts` 的 `PROVIDER_DEFAULTS` 添加默认值
2. 创建提供商服务类，继承 `BaseAiProvider`
3. 实现必要的抽象方法
4. 在 `ai-provider-manager.service.ts` 注册提供商

### 重构记录

- **v1.0.37**: 侧边栏标题栏优化 - 跨平台 UI 增强
  - **问题修复**: macOS 系统控制按钮（红绿灯）被侧边栏遮挡
  - **新增组件**: 品牌标题栏（AI Assistant logo + 可拖拽区域）
  - **跨平台适配**: macOS 38px / Windows/Linux 32px 高度
  - **UI 增强**: 统一的品牌展示，支持窗口拖拽
  - **技术实现**: 注入 PlatformDetectionService 检测平台

- **v1.0.35**: OpenAI 兼容站点流式响应修复 (Fix #5)
  - **问题修复**: Issue #5 「自定义站点一直无法对话」- 400 错误
  - **问题原因**: openai-compatible provider 强制使用 `stream: true`，部分第三方站点不支持
  - **新增配置**: `disableStreaming` 配置项（禁用流式响应）
  - **新增模板**: 设置界面添加「OpenAI 兼容站点」配置模板
  - **新增字段类型**: 支持 checkbox 和 number 类型字段渲染
  - **代码优化**: chatStream() 方法检测配置，自动回退非流式请求
  - **用户指引**: 如站点不支持流式，勾选「禁用流式响应」即可

- **v1.0.34**: GLM Provider 双模式支持
  - **功能增强**: GLM 支持两种 API 格式（Anthropic 兼容 + OpenAI 兼容）
  - **技术架构**: 根据 Base URL 自动选择实现方式
    - `/api/anthropic` → Anthropic SDK（自动 SSE 解析）
    - `/api/paas/v4` → Axios（responseType: 'text' + 手动解析）
  - **问题修复**: 修复浏览器环境中 `responseType: 'stream'` 不支持的错误
  - **核心重构**:
    - 新增 `detectApiMode()` 方法自动检测 API 模式
    - 新增 `chatWithAnthropicSdk()` / `chatWithAxios()` 分离两种实现
    - 新增 `chatStreamWithAnthropicSdk()` / `chatStreamWithAxios()` 流式处理
    - 统一响应转换方法 `transformChatResponse()` / `transformOpenAIResponse()`
  - **收益**: 增强插件鲁棒性，支持更多 GLM API 端点配置

- **v1.0.30**: 可配置的 Agent 最大轮数 (Fix #1)
  - **问题修复**: Issue #1 "达到最大轮次30轮" - 用户无法自定义最大轮数限制
  - **新增配置**: `agentMaxRounds` 配置项（默认 50，范围 10-200）
  - **新增 UI**: 在「聊天设置 → 聊天行为」中添加可视化配置界面
  - **代码优化**: `ai-sidebar.component.ts` 从配置读取 `maxRounds`，替代硬编码值
  - **增强检测**: 扩展 INCOMPLETE_PATTERNS 和 SUMMARY_PATTERNS 正则模式
  - **新增 i18n**: agentMaxRounds 设置支持中/英/日三语

- **v1.0.28**: Minimax Provider 工具调用深度修复
  - **问题修复**: 工具调用事件丢失，AI 输出 `<invoke>` 等 XML 格式
  - **核心修复 1**: 重构 `transformMessages` 使用 Anthropic tool_use/tool_result 格式
  - **核心修复 2**: 增强 `buildToolResultMessage` 添加 toolResults 字段
  - **核心修复 3**: 保留 toolCalls 到消息对象供下一轮转换
  - **核心修复 4**: 精简 `buildAgentSystemPrompt` 防止 AI 模仿 XML
  - **类型扩展**: ChatMessage 添加 toolCalls、toolResults、tool_use_id 字段

- **v1.0.27**: 正则匹配全面优化
  - **问题修复**: Agent 在第 5 轮因 "no_tools" 误终止
  - **问题原因**: "现在重新查询" 等模式未被 INCOMPLETE_PATTERNS 覆盖
  - **功能增强**: INCOMPLETE_PATTERNS 从 ~40 模式增加到 ~120+ 模式
  - **新增中文模式**: 重新、继续、再次、再试、尝试、检查、查一下等
  - **新增英文模式**: again、retry、try again、let me try、need to try 等
  - **扩展 SUMMARY_PATTERNS**: wrap up、concluding、finish up 等

- **v1.0.26**: 上下文系统与工具调用集成
  - **功能增强**: ContextManager 集成到 Agent 循环
  - **功能增强**: 使用 `getEffectiveHistory()` 获取智能过滤的历史消息
  - **功能增强**: Agent 系统提示添加 ReAct 框架（Thought → Action → Observation）
  - **功能增强**: 强调 `task_complete` 工具为唯一任务完成方式
  - **优化**: maxRounds 从 5 增加到 30，支持复杂任务
  - **新增方法**: `convertToAgentMessage()` - ApiMessage 转 ChatMessage
  - **新增**: 历史摘要消息标记 `[历史摘要]`

- **v1.0.25**: 修复 Agent 循环逻辑漏洞
  - **BUG 修复**: checkTermination 返回 shouldTerminate: false 但仍直接终止
  - **问题原因**: else 分支忽略 checkTermination 结果直接调用 subscriber.complete()
  - **修复**: else 分支检查 !termination.shouldTerminate 时继续下一轮
  - **优化**: 使用 termination.reason 作为终止原因而非硬编码 'no_tools'

- **v1.0.24**: 修复 Agent 重复执行问题
  - **BUG 修复**: Agent 重复执行之前已完成的操作
  - **问题原因**: buildAgentMessages 过滤掉所有 ASSISTANT 消息，导致丢失工具执行结果
  - **修复**: 保留 AI 回复但清洗工具卡片 HTML
  - **新增方法**: cleanToolCardHtml() - 移除 HTML 保留纯文本结果
  - **优化**: 历史消息现在包含之前的工具执行结果

- **v1.0.23**: 修复 Agent 提前终止问题
  - **BUG 修复**: AI 说"让我使用工具"但不调用就终止
  - **新增功能**: 扩展 INCOMPLETE_PATTERNS 正则（添加 MCP/工具相关模式）
  - **新增功能**: 添加工具名提及检测 (mentionsToolWithoutCalling)
  - **新增终止原因**: 'mentioned_tool' - AI 提及工具但未调用
  - **新增类型**: TerminationReason 枚举新增 'mentioned_tool'
  - **优化**: buildAgentSystemPrompt 添加"严禁行为"规则

- **v1.0.22**: Agent 历史上下文优化
  - **BUG 修复**: Agent 直接调取错误记忆而非执行命令
  - **新增功能**: 历史消息限制 (MAX_AGENT_HISTORY = 10)
  - **新增功能**: Agent 系统提示强调"必须执行工具"
  - **优化**: 分离系统消息和对话消息，历史仅保留最近 10 条
  - **新增方法**: buildAgentMessages(), buildAgentSystemPrompt()

- **v1.0.21**: MCP 可靠性增强
  - **新增功能**: 请求超时统一管理 (timeout 配置)
  - **新增功能**: 自动重试机制 (最多3次，递增延迟)
  - **新增功能**: 工具调用日志记录 (MCPToolCall 历史)
  - **新增 API**: getToolCallHistory(), getToolCallStats(), clearToolCallHistory()
  - **新增类型**: MCPToolCallStats 接口

- **v1.0.20**: MCP (Model Context Protocol) 支持
  - **新增功能**: MCP 协议类型定义 (mcp-message.types.ts)
  - **新增功能**: 传输层实现 - Stdio、SSE、HTTP 三种传输方式
  - **新增功能**: MCP 客户端管理器 (MCPClientManager)
  - **新增功能**: MCP 服务器配置界面 (MCPSettingsComponent)
  - **新增功能**: 服务器编辑器对话框 (MCPServerDialogComponent)
  - **新增功能**: 自动发现并调用 MCP 工具
  - **新增 i18n**: 中/英/日三语 MCP 设置界面
  - **存储**: MCP 服务器配置存储在 `mcp-servers.json`

- **v1.0.17**: 数据管理增强
  - **新增功能**: 文件存储服务 (FileStorageService)
  - **数据迁移**: 从 localStorage 迁移到文件存储
  - **新增UI**: 数据管理设置页面
  - **新增功能**: 导出/导入所有数据
  - **新增功能**: 查看和管理存储文件
  - **新增功能**: 从浏览器存储迁移数据
  - **新增i18n**: 数据管理页面支持中/英/日三语
  - **存储位置**: `%APPDATA%/tabby/plugins/tabby-ai-assistant/data`

- **v1.0.16**: 主题系统增强
  - **BUG 修复**: 修复深色主题与跟随系统视觉效果相同的问题
  - **新增主题**: 羊皮卷（parchment）- 复古纸张质感亮色主题
  - **新增主题**: 像素复古（pixel）- 8-bit像素风格
  - **新增主题**: 赛博科技（tech）- 赛博朋克科技风格
  - **UI 优化**: 深色主题使用更深邃的背景色（#0d0d14）
  - **新增 i18n**: 日语翻译支持

- **v1.0.15**: 智能 Agent 工具调用循环 & 快捷键功能
  - **BUG 修复**: 修复 RxJS async complete 回调问题导致的工具调用循环中断
  - **新增功能**: 完整 Agent 多轮工具调用循环
  - **新增功能**: 智能终止检测器（6种终止条件：task_complete、no_tools、summarizing、repeated_tool、high_failure_rate、timeout）
  - **新增功能**: `task_complete` 工具让 AI 主动结束任务
  - **新增功能**: 快捷键 `Ctrl+Shift+G` 命令生成、`Ctrl+Shift+E` 命令解释
  - **性能优化**: 正则表达式预编译、添加未完成/总结暗示检测
  - **新增类型**: `MessageRole.TOOL`、`TerminationReason`、`AgentState` 等

- **v1.0.12**: 代码去重、类型优化、配置统一化
  - 移除7个提供商中约800行重复代码
  - `BaseAiProvider` 从抽象类改为接口 + 抽象类实现
  - 新增统一配置系统 `PROVIDER_DEFAULTS`

## 📝 API文档

### IBaseAiProvider 接口
```typescript
interface IBaseAiProvider {
    // 标识
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: ProviderCapability[];
    readonly authConfig: AuthConfig;

    // 配置与状态
    configure(config: ProviderConfig): void;
    getConfig(): ProviderConfig | null;
    isConfigured(): boolean;
    isEnabled(): boolean;

    // 核心功能
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatStream(request: ChatRequest): Observable<any>;
    generateCommand(request: CommandRequest): Promise<CommandResponse>;
    explainCommand(request: ExplainRequest): Promise<ExplainResponse>;
    analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    // 健康与验证
    healthCheck(): Promise<HealthStatus>;
    validateConfig(): ValidationResult;

    // 信息查询
    getInfo(): ProviderInfo;
    supportsCapability(capability: ProviderCapability): boolean;
}
```

### ProviderConfigUtils
```typescript
namespace ProviderConfigUtils {
    // 使用默认值填充配置
    function fillDefaults(config: Partial<ProviderConfig>, providerName: string): ProviderConfig;

    // 检查配置是否完整
    function isConfigComplete(config: ProviderConfig): boolean;

    // 克隆配置（可选择脱敏）
    function cloneConfig(config: ProviderConfig, maskApiKey?: boolean): ProviderConfig;

    // 获取已知提供商列表
    function getKnownProviders(): string[];
}
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

### 开发指南
1. Fork本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Tabby](https://tabby.sh/) - 强大的终端模拟器
- [Anthropic](https://anthropic.com/) - Claude AI
- [Minimax](https://minimaxi.com/) - AI服务
- [智谱AI](https://open.bigmodel.cn/) - GLM

---

**注意**: 使用本插件前，请确保您了解所执行命令的作用。对于危险命令，请务必备份重要数据！
