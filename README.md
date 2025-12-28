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

### 安全特性
- **多级风险评估** - 自动识别危险命令（低/中/高/极风险）
- **用户同意管理** - 30天同意持久化
- **密码保护** - 高风险命令需要密码验证
- **安全模式** - 自动阻止极危险操作

### Tabby集成
- **设置页面** - 专用配置标签页
- **工具栏按钮** - 一键打开AI助手
- **热键支持** - 自定义快捷键
- **上下文菜单** - 右键快速操作

## 🚀 支持的AI提供商

### 云服务提供商

| 提供商 | 默认端点 | 默认模型 | 特点 |
|--------|---------|---------|------|
| **OpenAI** | `https://api.openai.com/v1` | GPT-4 | 功能全面，性能稳定 |
| **Anthropic** | `https://api.anthropic.com` | Claude-3-Sonnet | 安全性高，推理能力强 |
| **Minimax** | `https://api.minimaxi.com/anthropic` | MiniMax-M2 | 专为代码优化 |
| **GLM** | `https://open.bigmodel.cn/api/anthropic` | GLM-4.6 | 中文优化 |

### 本地/自托管提供商

| 提供商 | 默认端点 | 默认模型 | 特点 |
|--------|---------|---------|------|
| **Ollama** | `http://localhost:11434/v1` | llama3.1 | 本地运行，无需API密钥 |
| **vLLM** | `http://localhost:8000/v1` | Llama-3.1-8B | 高性能推理框架 |
| **OpenAI Compatible** | `http://localhost:11434/v1` | gpt-3.5-turbo | 兼容LocalAI等 |

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

### 3. 自定义热键
默认热键：
- `Ctrl-Shift-A`: 打开AI助手聊天
- `Ctrl-Shift-G`: 从选择生成命令
- `Ctrl-Shift-E`: 解释当前选择

## 🎯 使用指南

### 聊天模式
1. 点击工具栏的AI助手图标
2. 在聊天框中输入问题
3. AI将回答您的问题

### 命令生成
1. 在终端中输入自然语言描述
2. 按 `Ctrl-Shift-G`
3. AI会生成对应的终端命令
4. 预览并确认后执行

### 命令解释
1. 选中终端中的命令
2. 右键选择"用AI解释此命令"
3. 或按 `Ctrl-Shift-E`
4. 查看详细解释

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
│   │   └── terminal/                 # 终端服务
│   │       └── terminal-context.service.ts
│   ├── components/                   # UI组件
│   │   ├── ai-sidebar.component.ts
│   │   ├── chat/                     # 聊天组件
│   │   └── settings/                 # 设置组件
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
- **v1.0.15**: 智能 Agent 工具调用循环 & BUG 修复
  - 实现完整的 Agent 多轮工具调用循环
  - 添加智能终止检测器（6种终止条件）
  - 新增 `task_complete` 工具让 AI 主动结束任务
  - 修复 RxJS async complete 回调问题
  - 添加正则表达式模式匹配未完成/总结暗示
  - 优化正则表达式预编译性能
  - 新增 `MessageRole.TOOL` 角色支持

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
