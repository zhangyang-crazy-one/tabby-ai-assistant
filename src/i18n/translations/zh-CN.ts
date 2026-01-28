/**
 * 中文翻译
 */
import { TranslationKeys } from '../types';

export const zhCN: TranslationKeys = {
    common: {
        save: '保存',
        cancel: '取消',
        delete: '删除',
        confirm: '确定',
        enabled: '已启用',
        disabled: '已禁用',
        online: '在线',
        offline: '离线',
        testing: '检测中...',
        error: '错误',
        success: '成功',
        notConfigured: '未配置',
        add: '添加',
        remove: '删除',
        close: '关闭',
        yes: '是',
        no: '否',
        reset: '重置',
        default: '默认',
        today: '今天'
    },

    settings: {
        title: '设置',
        generalTab: '基本设置',
        providersTab: 'AI提供商',
        contextTab: '上下文设置',
        securityTab: '安全设置',
        chatTab: '聊天设置',
        mcpTab: 'MCP服务器',
        dataTab: '数据管理',
        advancedTab: '高级设置'
    },

    general: {
        title: '基本设置',
        enableAssistant: '启用AI助手',
        enableAssistantDesc: '启用或禁用整个AI助手功能',
        defaultProvider: '默认AI提供商',
        providerCount: '已配置 {count} 个提供商，当前使用',
        language: '语言',
        theme: '主题',
        themeAuto: '跟随系统',
        themeLight: '浅色主题',
        themeDark: '深色主题',
        themePixel: '像素复古',
        themeTech: '赛博科技',
        themeParchment: '羊皮卷',
        sidebarPosition: '侧边栏位置',
        sidebarPositionLeft: '左侧',
        sidebarPositionRight: '右侧',
        sidebarPositionDesc: '选择 AI 侧边栏显示在窗口左侧还是右侧',
        shortcuts: '快捷键',
        shortcutOpenChat: '打开AI助手',
        shortcutOpenChatDesc: '打开聊天界面',
        shortcutGenerate: '生成命令',
        shortcutGenerateDesc: '从选择生成命令',
        shortcutExplain: '解释命令',
        shortcutExplainDesc: '解释当前选择',
        shortcutTip: '快捷键可在 Tabby 设置中自定义'
    },

    chatSettings: {
        title: '聊天设置',
        appearance: '外观',
        theme: '主题',
        fontSize: '字体大小',
        compactMode: '紧凑模式',
        compactModeDesc: '减少消息间距，显示更多内容',
        behavior: '聊天行为',
        enterToSend: 'Enter键发送消息',
        enterToSendDesc: 'Shift+Enter 换行',
        showTimestamps: '显示时间戳',
        showTimestampsDesc: '在每条消息下方显示发送时间',
        showAvatars: '显示头像',
        showAvatarsDesc: '显示用户和AI的头像图标',
        soundEnabled: '启用提示音',
        soundEnabledDesc: '收到AI回复时播放提示音',
        agentMaxRounds: 'Agent最大执行轮数',
        agentMaxRoundsUnit: '轮',
        agentMaxRoundsDesc: '单次对话中AI工具调用的最大轮数（10-200），复杂任务建议设置更高值',
        history: '聊天历史',
        enableHistory: '启用聊天历史',
        enableHistoryDesc: '保存聊天记录以便下次使用',
        maxHistory: '最大历史记录数',
        maxHistoryUnit: '条',
        autoSave: '自动保存聊天记录',
        autoSaveDesc: '每次发送消息后自动保存',
        exportSettings: '导出设置',
        clearHistory: '清空聊天记录',
        resetDefaults: '重置为默认',
        clearHistoryConfirm: '确定要清空所有聊天记录吗？此操作不可恢复。',
        resetConfirm: '确定要重置所有设置为默认值吗？'
    },

    security: {
        title: '安全设置',
        accessControl: '访问保护',
        passwordProtection: '启用密码保护',
        passwordProtectionDesc: '高风险命令需要密码确认',
        setPassword: '设置密码',
        passwordPlaceholder: '输入密码',
        riskAssessment: '风险评估',
        riskAssessmentDesc: '自动评估命令风险等级',
        defaultRiskLevel: '默认风险等级',
        riskLow: '低风险',
        riskMedium: '中等风险',
        riskHigh: '高风险',
        userConsent: '用户授权',
        rememberConsent: '记住用户授权',
        rememberConsentDesc: '授权有效期',
        consentExpiryDays: '天',
        dangerousPatterns: '危险命令模式',
        addPattern: '添加危险命令模式',
        patternPlaceholder: '输入危险命令模式',
        saveSettings: '保存设置',
        resetDefaults: '恢复默认',
        resetConfirm: '确定要重置安全设置为默认值吗？'
    },

    providers: {
        title: 'AI提供商配置',
        cloudProviders: '云端提供商',
        cloudProvidersDesc: '需要 API Key 的在线服务',
        localProviders: '本地提供商',
        localProvidersDesc: '无需 API Key，本地运行',
        configured: '已启用',
        displayName: '显示名称',
        status: '状态',
        apiKey: 'API Key',
        baseURL: 'Base URL',
        model: 'Model',
        saveConfig: '保存配置',
        testConnection: '测试连接',
        detectService: '检测服务',
        delete: '删除',
        deleteConfirm: '确定要删除该提供商配置吗？',
        testSuccess: '连接测试成功！',
        testFail: '连接测试失败',
        testError: '无法连接到服务，请确保服务已启动',
        configSaved: '配置已保存',
        configDeleted: '配置已删除',
        contextWindow: '上下文限制',
        contextWindowDesc: '模型的最大上下文Token数'
    },

    providerNames: {
        openai: 'OpenAI',
        anthropic: 'Anthropic Claude',
        minimax: 'Minimax',
        glm: 'GLM (ChatGLM)',
        openaiCompatible: 'OpenAI Compatible',
        ollama: 'Ollama (本地)',
        vllm: 'vLLM (本地)'
    },

    chatInterface: {
        title: 'AI助手',
        welcomeMessage: '您好！我是AI助手',
        inputPlaceholder: '输入您的问题或描述要执行的命令...',
        thinking: 'AI正在思考...',
        executingTool: '正在执行工具...',
        toolComplete: '工具执行完成',
        errorPrefix: '错误',
        tipCommand: '提示：您可以描述想执行的命令，例如"查看当前目录的所有文件"',
        tipShortcut: '快捷键：Ctrl+Shift+G 生成命令，Ctrl+Shift+E 解释命令',
        clearChat: '清空聊天记录',
        clearChatConfirm: '确定要清空聊天记录吗？',
        exportChat: '导出聊天记录',
        switchProvider: '切换AI提供商',
        providerBadge: '提供商'
    },

    riskLevel: {
        low: '低风险',
        medium: '中等风险',
        high: '高风险',
        unknown: '未知'
    },

    advancedSettings: {
        title: '高级设置',
        configManagement: '配置管理',
        validateConfig: '验证配置',
        resetDefaults: '重置为默认',
        logSettings: '日志设置',
        logLevel: '日志级别',
        logLevels: {
            debug: '调试',
            info: '信息',
            warn: '警告',
            error: '错误'
        },
        systemInfo: '系统信息',
        pluginVersion: '插件版本',
        supportedProviders: '支持的提供商',
        currentProvider: '当前提供商'
    },

    contextSettings: {
        title: '上下文管理',
        autoCompact: '自动压缩',
        enableAutoCompact: '启用自动压缩',
        autoCompactDesc: '当上下文超过阈值时自动压缩历史消息',
        autoCompactEnabled: '自动压缩已启用',
        autoCompactDisabled: '自动压缩已禁用',
        tokenConfig: 'Token 配置',
        currentProviderLimit: '当前供应商上下文限制',
        maxContextTokens: '最大上下文 Token 数',
        maxContextTokensDesc: '不能超过当前供应商的上下文限制',
        reservedOutputTokens: '输出预留 Token 数',
        reservedOutputTokensDesc: '为 AI 回复预留的 Token 数量',
        thresholdConfig: '压缩阈值',
        pruneThreshold: '裁剪阈值',
        pruneThresholdDesc: '使用率超过此阈值时裁剪冗余内容（默认：70%）',
        compactThreshold: '压缩阈值',
        compactThresholdDesc: '使用率超过此阈值时生成摘要压缩（默认：85%）',
        messagesToKeep: '保留消息数',
        messagesToKeepDesc: '压缩时始终保留的最近消息数量（默认：3）',
        configSaved: '上下文配置已保存'
    },

    mcpSettings: {
        title: 'MCP 服务器配置',
        description: '配置 Model Context Protocol 服务器以扩展 AI 助手功能',
        noServers: '暂无配置的 MCP 服务器',
        addServerHint: '点击下方按钮添加新的 MCP 服务器',
        addServer: '添加服务器',
        editServer: '编辑服务器',
        serverName: '服务器名称',
        serverNamePlaceholder: '输入服务器名称',
        transportType: '传输类型',
        transportStdio: '标准输入/输出 (Stdio)',
        transportSSE: '服务器发送事件 (SSE)',
        transportHTTP: 'HTTP 流式传输',
        command: '命令',
        commandPlaceholder: '例如: python server.py',
        args: '参数',
        argsPlaceholder: '例如: -p 3000',
        argsHint: '每行一个参数',
        workingDir: '工作目录',
        workingDirPlaceholder: '服务器工作目录',
        envVars: '环境变量',
        envVarsPlaceholder: 'KEY=value',
        serverURL: '服务器 URL',
        urlPlaceholder: 'http://localhost:3000',
        headers: '请求头',
        headersPlaceholder: 'Authorization: Bearer xxx',
        autoConnect: '自动连接',
        toolsAvailable: '可用工具: {count} 个',
        deleteConfirm: '确定要删除该服务器配置吗？',
        validationError: '请填写所有必填字段',
        moreServers: '更多服务器',
        connect: '连接',
        disconnect: '断开',
        connecting: '连接中...',
        retry: '重试'
    },

    dataSettings: {
        title: '数据管理',
        description: '管理插件的数据存储，包括聊天记录、记忆和配置',
        storageLocation: '数据存储位置',
        openDirectory: '打开目录',
        storedFiles: '存储文件',
        fileName: '文件名',
        size: '大小',
        lastModified: '最后修改',
        actions: '操作',
        view: '查看',
        delete: '删除',
        noFiles: '暂无数据文件',
        statistics: '数据统计',
        chatSessions: '聊天会话',
        memoryItems: '记忆项',
        checkpoints: '检查点',
        consents: '授权记录',
        exportAll: '导出所有数据',
        importData: '导入数据',
        migrateData: '迁移浏览器数据',
        clearAll: '清除所有数据',
        migrationNote: '检测到浏览器存储中还有旧数据，建议点击"迁移浏览器数据"将数据迁移到文件存储'
    },

    proxy: {
        title: '代理设置',
        networkProxy: '网络代理',
        enableProxy: '启用代理',
        enableProxyDesc: '通过代理服务器访问 AI API 端点',
        importFromEnv: '从环境变量导入',
        importFromEnvDesc: '自动读取 HTTP_PROXY、HTTPS_PROXY 环境变量',
        importSuccess: '已从环境变量导入代理配置',
        noEnvProxy: '未检测到环境变量中的代理配置',
        proxyConfig: '代理配置',
        httpProxy: 'HTTP 代理',
        httpProxyPlaceholder: 'http://127.0.0.1:7890',
        httpProxyHint: '用于 HTTP 请求的代理地址',
        httpsProxy: 'HTTPS 代理',
        httpsProxyPlaceholder: 'http://127.0.0.1:7890',
        httpsProxyHint: '用于 HTTPS 请求的代理地址（大多数 API 使用 HTTPS）',
        noProxy: 'No Proxy',
        noProxyPlaceholder: 'localhost, 127.0.0.1, *.local',
        noProxyHint: '不使用代理的地址（逗号分隔）',
        requireAuth: '需要认证',
        username: '用户名',
        password: '密码',
        testConnection: '测试连接',
        testConnectionDesc: '测试代理连接是否正常',
        testingConnection: '测试中...',
        testSuccess: '连接成功',
        testSuccessDetail: '代理连接测试成功 (latency: {latency}ms)',
        testFailed: '连接失败',
        testFailedDetail: '代理连接测试失败: {message}',
        configSaved: '代理配置已保存',
        noProxyUrl: '请先配置代理地址',
        usage: '使用说明',
        usageInfo1: '代理设置将应用于所有云端 AI 提供商的 API 请求',
        usageInfo2: '本地提供商（Ollama、vLLM）默认不使用代理',
        usageInfo3: '支持 HTTP、HTTPS 和 SOCKS5 代理协议',
        optional: '可选',
        recommended: '推荐'
    },

    systemPrompts: {
        assistantRole: `你是一个专业的终端命令助手，运行在 Tabby 终端中。

## 核心能力
你可以通过以下工具直接操作终端：
- write_to_terminal: 向终端写入并执行命令
- read_terminal_output: 读取终端输出
- get_terminal_list: 获取所有终端列表
- get_terminal_cwd: 获取当前工作目录
- focus_terminal: 切换到指定索引的终端（需要参数 terminal_index）
- get_terminal_selection: 获取终端中选中的文本

## 重要规则
1. 当用户请求执行命令（如"查看当前目录"、"列出文件"等），你必须使用 write_to_terminal 工具来执行
2. **当用户请求切换终端（如"切换到终端0"、"打开终端4"等），你必须使用 focus_terminal 工具**
3. 不要只是描述你"将要做什么"，而是直接调用工具执行
4. 执行命令后，使用 read_terminal_output 读取结果并报告给用户
5. 如果不确定当前目录或终端状态，先使用 get_terminal_cwd 或 get_terminal_list 获取信息
6. **永远不要假装执行了操作，必须真正调用工具**

## 命令执行策略
### 快速命令（无需额外等待）
- dir, ls, cd, pwd, echo, cat, type, mkdir, rm, copy, move
- 这些命令通常在 500ms 内完成

### 慢速命令（需要等待完整输出）
- systeminfo, ipconfig, netstat: 等待 3-8 秒
- npm, yarn, pip, docker: 等待 5-10 秒
- git: 等待 3 秒以上
- ping, tracert: 可能需要 10+ 秒

**对于慢速命令**：
1. 执行命令后，系统会自动等待
2. 如果输出不完整，可以再次调用 read_terminal_output 获取更新的内容
3. **不要猜测或假设命令输出，始终以实际读取到的输出为准**

## 示例
用户："查看当前目录的文件"
正确做法：调用 write_to_terminal 工具，参数 { "command": "dir", "execute": true }
错误做法：仅回复文字"我将执行 dir 命令"

用户："切换到终端4"
正确做法：调用 focus_terminal 工具，参数 { "terminal_index": 4 }
错误做法：仅回复文字"已切换到终端4"（不调用工具）`,
        commandGeneratorRole: `你是一个专业的终端命令生成助手。你的任务是：

1. 将自然语言描述转换为准确、高效的终端命令
2. 考虑当前操作系统和Shell环境
3. 优先使用安全、最佳实践的命令
4. 提供清晰的命令解释
5. 考虑当前工作目录和上下文环境

请始终返回有效的命令，避免危险操作（如删除系统文件、格式化磁盘等）。
如果无法确定准确的命令，请明确说明并提供替代方案。`
    }
};
