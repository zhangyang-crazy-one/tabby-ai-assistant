/**
 * English translations
 */
import { TranslationKeys } from '../types';

export const enUS: TranslationKeys = {
    common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        confirm: 'Confirm',
        enabled: 'Enabled',
        disabled: 'Disabled',
        online: 'Online',
        offline: 'Offline',
        testing: 'Testing...',
        error: 'Error',
        success: 'Success',
        notConfigured: 'Not configured',
        add: 'Add',
        remove: 'Remove',
        close: 'Close',
        yes: 'Yes',
        no: 'No',
        reset: 'Reset',
        default: 'Default',
        today: 'Today'
    },

    settings: {
        title: 'Settings',
        generalTab: 'General',
        providersTab: 'AI Providers',
        contextTab: 'Context',
        securityTab: 'Security',
        chatTab: 'Chat',
        mcpTab: 'MCP Servers',
        dataTab: 'Data',
        advancedTab: 'Advanced'
    },

    general: {
        title: 'General Settings',
        enableAssistant: 'Enable AI Assistant',
        enableAssistantDesc: 'Enable or disable the entire AI assistant feature',
        defaultProvider: 'Default AI Provider',
        providerCount: '{count} provider(s) configured, currently using',
        language: 'Language',
        theme: 'Theme',
        themeAuto: 'Follow System',
        themeLight: 'Light Theme',
        themeDark: 'Dark Theme',
        themePixel: 'Pixel Retro',
        themeTech: 'Cyber Tech',
        themeParchment: 'Parchment',
        sidebarPosition: 'Sidebar Position',
        sidebarPositionLeft: 'Left',
        sidebarPositionRight: 'Right',
        sidebarPositionDesc: 'Choose whether the AI sidebar appears on the left or right side of the window',
        shortcuts: 'Shortcuts',
        shortcutOpenChat: 'Open AI Assistant',
        shortcutOpenChatDesc: 'Open the chat interface',
        shortcutGenerate: 'Generate Command',
        shortcutGenerateDesc: 'Generate command from selection',
        shortcutExplain: 'Explain Command',
        shortcutExplainDesc: 'Explain current selection',
        shortcutTip: 'Shortcuts can be customized in Tabby settings'
    },

    chatSettings: {
        title: 'Chat Settings',
        appearance: 'Appearance',
        theme: 'Theme',
        fontSize: 'Font Size',
        compactMode: 'Compact Mode',
        compactModeDesc: 'Reduce message spacing to show more content',
        behavior: 'Chat Behavior',
        enterToSend: 'Enter to Send',
        enterToSendDesc: 'Shift+Enter for new line',
        showTimestamps: 'Show Timestamps',
        showTimestampsDesc: 'Display send time below each message',
        showAvatars: 'Show Avatars',
        showAvatarsDesc: 'Display user and AI avatar icons',
        soundEnabled: 'Enable Sound',
        soundEnabledDesc: 'Play notification sound when AI responds',
        agentMaxRounds: 'Agent Max Rounds',
        agentMaxRoundsUnit: 'rounds',
        agentMaxRoundsDesc: 'Maximum tool call rounds per conversation (10-200), set higher for complex tasks',
        history: 'Chat History',
        enableHistory: 'Enable Chat History',
        enableHistoryDesc: 'Save chat records for next session',
        maxHistory: 'Max History Records',
        maxHistoryUnit: 'entries',
        autoSave: 'Auto-save Chat',
        autoSaveDesc: 'Automatically save after each message',
        exportSettings: 'Export Settings',
        clearHistory: 'Clear Chat History',
        resetDefaults: 'Reset to Defaults',
        clearHistoryConfirm: 'Are you sure you want to clear all chat records? This cannot be undone.',
        resetConfirm: 'Are you sure you want to reset all settings to defaults?'
    },

    security: {
        title: 'Security Settings',
        accessControl: 'Access Control',
        passwordProtection: 'Enable Password Protection',
        passwordProtectionDesc: 'High-risk commands require password confirmation',
        setPassword: 'Set Password',
        passwordPlaceholder: 'Enter password',
        riskAssessment: 'Risk Assessment',
        riskAssessmentDesc: 'Automatically assess command risk level',
        defaultRiskLevel: 'Default Risk Level',
        riskLow: 'Low Risk',
        riskMedium: 'Medium Risk',
        riskHigh: 'High Risk',
        userConsent: 'User Consent',
        rememberConsent: 'Remember User Consent',
        rememberConsentDesc: 'Consent valid for',
        consentExpiryDays: 'days',
        dangerousPatterns: 'Dangerous Command Patterns',
        addPattern: 'Add Dangerous Pattern',
        patternPlaceholder: 'Enter dangerous command pattern',
        saveSettings: 'Save Settings',
        resetDefaults: 'Restore Defaults',
        resetConfirm: 'Are you sure you want to reset security settings to defaults?'
    },

    providers: {
        title: 'AI Provider Configuration',
        cloudProviders: 'Cloud Providers',
        cloudProvidersDesc: 'Online services requiring API Key',
        localProviders: 'Local Providers',
        localProvidersDesc: 'Running locally, no API Key required',
        configured: 'Enabled',
        displayName: 'Display Name',
        status: 'Status',
        apiKey: 'API Key',
        baseURL: 'Base URL',
        model: 'Model',
        saveConfig: 'Save Config',
        testConnection: 'Test Connection',
        detectService: 'Detect Service',
        delete: 'Delete',
        deleteConfirm: 'Are you sure you want to delete this provider configuration?',
        testSuccess: 'Connection test successful!',
        testFail: 'Connection test failed',
        testError: 'Cannot connect to service, please ensure it is running',
        configSaved: 'Configuration saved',
        configDeleted: 'Configuration deleted',
        contextWindow: 'Context Window',
        contextWindowDesc: 'Maximum context tokens for this model'
    },

    providerNames: {
        openai: 'OpenAI',
        anthropic: 'Anthropic Claude',
        minimax: 'Minimax',
        glm: 'GLM (ChatGLM)',
        openaiCompatible: 'OpenAI Compatible',
        ollama: 'Ollama (Local)',
        vllm: 'vLLM (Local)'
    },

    chatInterface: {
        title: 'AI Assistant',
        welcomeMessage: 'Hello! I am your AI Assistant',
        inputPlaceholder: 'Enter your question or describe the command you want to execute...',
        thinking: 'AI is thinking...',
        executingTool: 'Executing tool...',
        toolComplete: 'Tool execution complete',
        errorPrefix: 'Error',
        tipCommand: 'Tip: You can describe the command you want, e.g., "List all files in current directory"',
        tipShortcut: 'Shortcuts: Ctrl+Shift+G to generate, Ctrl+Shift+E to explain',
        clearChat: 'Clear Chat',
        clearChatConfirm: 'Are you sure you want to clear the chat?',
        exportChat: 'Export Chat',
        switchProvider: 'Switch AI Provider',
        providerBadge: 'Provider'
    },

    riskLevel: {
        low: 'Low Risk',
        medium: 'Medium Risk',
        high: 'High Risk',
        unknown: 'Unknown'
    },

    advancedSettings: {
        title: 'Advanced Settings',
        configManagement: 'Configuration Management',
        validateConfig: 'Validate Config',
        resetDefaults: 'Reset to Defaults',
        logSettings: 'Log Settings',
        logLevel: 'Log Level',
        logLevels: {
            debug: 'Debug',
            info: 'Info',
            warn: 'Warning',
            error: 'Error'
        },
        systemInfo: 'System Information',
        pluginVersion: 'Plugin Version',
        supportedProviders: 'Supported Providers',
        currentProvider: 'Current Provider'
    },

    contextSettings: {
        title: 'Context Management',
        autoCompact: 'Auto Compact',
        enableAutoCompact: 'Enable Auto Compact',
        autoCompactDesc: 'Automatically compress history when context exceeds threshold',
        autoCompactEnabled: 'Auto Compact Enabled',
        autoCompactDisabled: 'Auto Compact Disabled',
        tokenConfig: 'Token Configuration',
        currentProviderLimit: 'Current Provider Context Limit',
        maxContextTokens: 'Max Context Tokens',
        maxContextTokensDesc: 'Cannot exceed current provider context limit',
        reservedOutputTokens: 'Reserved Output Tokens',
        reservedOutputTokensDesc: 'Token count reserved for AI response',
        thresholdConfig: 'Compression Thresholds',
        pruneThreshold: 'Prune Threshold',
        pruneThresholdDesc: 'Prune redundant content when usage exceeds this (default: 70%)',
        compactThreshold: 'Compact Threshold',
        compactThresholdDesc: 'Generate summary when usage exceeds this (default: 85%)',
        messagesToKeep: 'Messages to Keep',
        messagesToKeepDesc: 'Recent messages to always preserve (default: 3)',
        configSaved: 'Context config saved'
    },

    mcpSettings: {
        title: 'MCP Server Configuration',
        description: 'Configure Model Context Protocol servers to extend AI assistant capabilities',
        noServers: 'No MCP servers configured',
        addServerHint: 'Click the button below to add a new MCP server',
        addServer: 'Add Server',
        editServer: 'Edit Server',
        serverName: 'Server Name',
        serverNamePlaceholder: 'Enter server name',
        transportType: 'Transport Type',
        transportStdio: 'Standard Input/Output (Stdio)',
        transportSSE: 'Server-Sent Events (SSE)',
        transportHTTP: 'Streamable HTTP',
        command: 'Command',
        commandPlaceholder: 'e.g., python server.py',
        args: 'Arguments',
        argsPlaceholder: 'e.g., -p 3000',
        argsHint: 'One argument per line',
        workingDir: 'Working Directory',
        workingDirPlaceholder: 'Server working directory',
        envVars: 'Environment Variables',
        envVarsPlaceholder: 'KEY=value',
        serverURL: 'Server URL',
        urlPlaceholder: 'http://localhost:3000',
        headers: 'Request Headers',
        headersPlaceholder: 'Authorization: Bearer xxx',
        autoConnect: 'Auto-connect',
        toolsAvailable: 'Available tools: {count}',
        deleteConfirm: 'Are you sure you want to delete this server configuration?',
        validationError: 'Please fill in all required fields',
        moreServers: 'More Servers',
        connect: 'Connect',
        disconnect: 'Disconnect',
        connecting: 'Connecting...',
        retry: 'Retry'
    },

    dataSettings: {
        title: 'Data Management',
        description: 'Manage plugin data storage including chat history, memories and configuration',
        storageLocation: 'Storage Location',
        openDirectory: 'Open Directory',
        storedFiles: 'Stored Files',
        fileName: 'File Name',
        size: 'Size',
        lastModified: 'Last Modified',
        actions: 'Actions',
        view: 'View',
        delete: 'Delete',
        noFiles: 'No data files',
        statistics: 'Statistics',
        chatSessions: 'Chat Sessions',
        memoryItems: 'Memory Items',
        checkpoints: 'Checkpoints',
        consents: 'Consent Records',
        exportAll: 'Export All Data',
        importData: 'Import Data',
        migrateData: 'Migrate Browser Data',
        clearAll: 'Clear All Data',
        migrationNote: 'Old data detected in browser storage. Click "Migrate Browser Data" to transfer to file storage'
    },

    proxy: {
        title: 'Proxy Settings',
        networkProxy: 'Network Proxy',
        enableProxy: 'Enable Proxy',
        enableProxyDesc: 'Access AI API endpoints through a proxy server',
        importFromEnv: 'Import from Environment',
        importFromEnvDesc: 'Automatically read HTTP_PROXY, HTTPS_PROXY environment variables',
        importSuccess: 'Proxy configuration imported from environment',
        noEnvProxy: 'No proxy configuration detected in environment variables',
        proxyConfig: 'Proxy Configuration',
        httpProxy: 'HTTP Proxy',
        httpProxyPlaceholder: 'http://127.0.0.1:7890',
        httpProxyHint: 'Proxy address for HTTP requests',
        httpsProxy: 'HTTPS Proxy',
        httpsProxyPlaceholder: 'http://127.0.0.1:7890',
        httpsProxyHint: 'Proxy address for HTTPS requests (most APIs use HTTPS)',
        noProxy: 'No Proxy',
        noProxyPlaceholder: 'localhost, 127.0.0.1, *.local',
        noProxyHint: 'Addresses that bypass the proxy (comma-separated)',
        requireAuth: 'Requires Authentication',
        username: 'Username',
        password: 'Password',
        testConnection: 'Test Connection',
        testConnectionDesc: 'Test if proxy connection works',
        testingConnection: 'Testing...',
        testSuccess: 'Connection Successful',
        testSuccessDetail: 'Proxy connection test successful (latency: {latency}ms)',
        testFailed: 'Connection Failed',
        testFailedDetail: 'Proxy connection test failed: {message}',
        configSaved: 'Proxy configuration saved',
        noProxyUrl: 'Please configure proxy address first',
        usage: 'Usage Instructions',
        usageInfo1: 'Proxy settings apply to all cloud AI provider API requests',
        usageInfo2: 'Local providers (Ollama, vLLM) do not use proxy by default',
        usageInfo3: 'Supports HTTP, HTTPS and SOCKS5 proxy protocols',
        optional: 'Optional',
        recommended: 'Recommended'
    },

    systemPrompts: {
        assistantRole: `You are a professional terminal command assistant running in Tabby terminal.

## Core Capabilities
You can directly operate the terminal through the following tools:
- write_to_terminal: Write and execute commands to the terminal
- read_terminal_output: Read terminal output
- get_terminal_list: Get list of all terminals
- get_terminal_cwd: Get current working directory
- focus_terminal: Switch to terminal by index (requires terminal_index parameter)
- get_terminal_selection: Get selected text in terminal

## Important Rules
1. When user requests command execution (e.g., "view current directory", "list files"), you MUST use write_to_terminal tool
2. **When user requests terminal switching (e.g., "switch to terminal 0", "open terminal 4"), you MUST use focus_terminal tool**
3. Don't just describe what you "will do", directly call the tool to execute
4. After executing commands, use read_terminal_output to read results and report to user
5. If unsure about current directory or terminal state, use get_terminal_cwd or get_terminal_list first
6. **Never pretend to execute operations, you must actually call the tools**

## Command Execution Strategy
### Fast Commands (no extra wait needed)
- dir, ls, cd, pwd, echo, cat, type, mkdir, rm, copy, move
- These commands usually complete within 500ms

### Slow Commands (need to wait for complete output)
- systeminfo, ipconfig, netstat: wait 3-8 seconds
- npm, yarn, pip, docker: wait 5-10 seconds
- git: wait more than 3 seconds
- ping, tracert: may need 10+ seconds

**For slow commands**:
1. After executing, system will automatically wait
2. If output is incomplete, call read_terminal_output again for updated content
3. **Never guess or assume command output, always rely on actual read output**

## Examples
User: "View files in current directory"
Correct: Call write_to_terminal tool with parameters { "command": "dir", "execute": true }
Incorrect: Only reply with text "I will execute dir command"

User: "Switch to terminal 4"
Correct: Call focus_terminal tool with parameters { "terminal_index": 4 }
Incorrect: Only reply with text "Switched to terminal 4" (without calling tool)`,
        commandGeneratorRole: `You are a professional terminal command generation assistant. Your task is to:

1. Convert natural language descriptions into accurate, efficient terminal commands
2. Consider current operating system and Shell environment
3. Prioritize safe, best-practice commands
4. Provide clear command explanations
5. Consider current working directory and context

Always return valid commands, avoid dangerous operations (e.g., deleting system files, formatting disks).
If unable to determine accurate command, clearly state and provide alternatives.`
    }
};
