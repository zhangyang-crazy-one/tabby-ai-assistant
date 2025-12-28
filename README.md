# Tabby AI Assistant Plugin

一个强大的Tabby终端AI助手插件，支持多AI提供商（OpenAI、Anthropic、Minimax、GLM），提供智能命令生成、解释和安全验证功能。

## 🌟 特性

### 核心功能
- **多AI提供商支持** - 支持OpenAI、Anthropic、Minimax、GLM等多种AI服务
- **智能命令生成** - 自然语言转终端命令，准确率高
- **命令解释** - 详细解释命令含义和用法
- **错误修复** - 自动分析错误并提供修复建议
- **终端感知** - 实时感知终端状态（当前目录、运行状态、环境变量等）

### 安全特性
- **多级风险评估** - 自动识别危险命令（低/中/高/极风险）
- **用户同意管理** - 30天同意持久化，避免重复确认
- **密码保护** - 高风险命令需要密码验证
- **安全模式** - 自动阻止极危险操作

### Tabby集成
- **设置页面** - 专用配置标签页
- **工具栏按钮** - 一键打开AI助手
- **热键支持** - 自定义快捷键
- **上下文菜单** - 右键快速操作

## 🚀 支持的AI提供商

### 1. Minimax (MiniMax-M2)
- **API端点**: `https://api.minimaxi.com/anthropic`
- **兼容性**: 完全兼容Anthropic Claude API
- **特点**: 专为代码和Agent工作流优化
- **模型**: MiniMax-M2, MiniMax-M2-Stable

### 2. GLM (ChatGLM-4)
- **API端点**: `https://open.bigmodel.cn/api/paas/v4/`
- **兼容性**: OpenAI API格式
- **特点**: 中文优化，响应速度快
- **模型**: glm-4, glm-4-air, chatglm4等

### 3. OpenAI
- **API端点**: `https://api.openai.com/v1/`
- **模型**: GPT-4, GPT-3.5 Turbo
- **特点**: 功能全面，性能稳定

### 4. Anthropic Claude
- **API端点**: `https://api.anthropic.com/`
- **模型**: Claude-3系列
- **特点**: 安全性高，推理能力强

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
3. 输入API密钥
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

## 🏗️ 项目结构

```
tabby-ai-assistant/
├── src/
│   ├── index.ts                      # Angular主模块
│   ├── types/                        # 类型定义
│   │   ├── ai.types.ts               # AI相关类型
│   │   ├── provider.types.ts         # 提供商类型
│   │   ├── security.types.ts         # 安全类型
│   │   └── terminal.types.ts         # 终端类型
│   ├── services/                     # 服务层
│   │   ├── core/                     # 核心服务
│   │   │   ├── ai-assistant.service.ts
│   │   │   ├── ai-provider-manager.service.ts
│   │   │   ├── config-provider.service.ts
│   │   │   └── logger.service.ts
│   │   ├── providers/                # AI提供商
│   │   │   ├── base-provider.service.ts
│   │   │   ├── minimax-provider.service.ts
│   │   │   └── glm-provider.service.ts
│   │   ├── security/                 # 安全服务
│   │   │   └── risk-assessment.service.ts
│   │   └── terminal/                 # 终端服务
│   │       └── terminal-context.service.ts
│   ├── components/                   # UI组件
│   ├── models/                       # 数据模型
│   └── utils/                        # 工具类
├── webpack.config.js                 # Webpack配置
├── tsconfig.json                     # TypeScript配置
└── package.json                      # 依赖配置
```

## 🔧 开发

### 构建
```bash
npm run build      # 生产构建
npm run watch      # 开发模式（自动重编译）
npm run clean      # 清理构建文件
```

### 测试
```bash
npm test           # 运行单元测试
```

## 📝 API文档

### AI提供商接口
```typescript
interface BaseAiProvider {
    name: string;
    displayName: string;
    capabilities: ProviderCapability[];

    chat(request: ChatRequest): Promise<ChatResponse>;
    generateCommand(request: CommandRequest): Promise<CommandResponse>;
    explainCommand(request: ExplainRequest): Promise<ExplainResponse>;
    analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;
}
```

### 终端上下文
```typescript
interface TerminalContext {
    session: TerminalSession;
    currentCommand?: string;
    lastOutput?: string;
    lastError?: string;
    exitCode?: number;
    isRunning: boolean;
    recentCommands: string[];
    systemInfo: SystemInfo;
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
- [tabby-vscode-agent](https://github.com/SteffMet/tabby-vscode-agent) - 参考架构
- [Minimax](https://minimaxi.com/) - AI服务
- [GLM](https://open.bigmodel.cn/) - 智谱AI


---

**注意**: 使用本插件前，请确保您了解所执行命令的作用。对于危险命令，请务必备份重要数据！
