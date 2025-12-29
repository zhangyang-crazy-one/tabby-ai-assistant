/**
 * 翻译键类型定义
 */

// 通用
export interface CommonTranslations {
    save: string;
    cancel: string;
    delete: string;
    confirm: string;
    enabled: string;
    disabled: string;
    online: string;
    offline: string;
    testing: string;
    error: string;
    success: string;
    notConfigured: string;
    add: string;
    remove: string;
    close: string;
    yes: string;
    no: string;
    reset: string;
    default: string;
    today: string;
}

// 设置页面
export interface SettingsTranslations {
    title: string;
    generalTab: string;
    providersTab: string;
    contextTab: string;
    securityTab: string;
    chatTab: string;
    advancedTab: string;
}

// 基本设置
export interface GeneralTranslations {
    title: string;
    enableAssistant: string;
    enableAssistantDesc: string;
    defaultProvider: string;
    providerCount: string;  // "已配置 {count} 个提供商，当前使用"
    language: string;
    theme: string;
    themeAuto: string;
    themeLight: string;
    themeDark: string;
    themePixel: string;
    themeTech: string;
    themeParchment: string;
    shortcuts: string;
    shortcutOpenChat: string;
    shortcutOpenChatDesc: string;
    shortcutGenerate: string;
    shortcutGenerateDesc: string;
    shortcutExplain: string;
    shortcutExplainDesc: string;
    shortcutTip: string;
}

// 聊天设置
export interface ChatSettingsTranslations {
    title: string;
    appearance: string;
    theme: string;
    fontSize: string;
    compactMode: string;
    compactModeDesc: string;
    behavior: string;
    enterToSend: string;
    enterToSendDesc: string;
    showTimestamps: string;
    showTimestampsDesc: string;
    showAvatars: string;
    showAvatarsDesc: string;
    soundEnabled: string;
    soundEnabledDesc: string;
    history: string;
    enableHistory: string;
    enableHistoryDesc: string;
    maxHistory: string;
    maxHistoryUnit: string;
    autoSave: string;
    autoSaveDesc: string;
    exportSettings: string;
    clearHistory: string;
    resetDefaults: string;
    clearHistoryConfirm: string;
    resetConfirm: string;
}

// 安全设置
export interface SecurityTranslations {
    title: string;
    accessControl: string;
    passwordProtection: string;
    passwordProtectionDesc: string;
    setPassword: string;
    passwordPlaceholder: string;
    riskAssessment: string;
    riskAssessmentDesc: string;
    defaultRiskLevel: string;
    riskLow: string;
    riskMedium: string;
    riskHigh: string;
    userConsent: string;
    rememberConsent: string;
    rememberConsentDesc: string;
    consentExpiryDays: string;
    dangerousPatterns: string;
    addPattern: string;
    patternPlaceholder: string;
    saveSettings: string;
    resetDefaults: string;
    resetConfirm: string;
}

// 供应商配置
export interface ProvidersTranslations {
    title: string;
    cloudProviders: string;
    cloudProvidersDesc: string;
    localProviders: string;
    localProvidersDesc: string;
    configured: string;
    displayName: string;
    status: string;
    apiKey: string;
    baseURL: string;
    model: string;
    contextWindow: string;
    contextWindowDesc: string;
    saveConfig: string;
    testConnection: string;
    detectService: string;
    delete: string;
    deleteConfirm: string;
    testSuccess: string;
    testFail: string;
    testError: string;
    configSaved: string;
    configDeleted: string;
}

// 供应商
export interface ProviderNamesTranslations {
    openai: string;
    anthropic: string;
    minimax: string;
    glm: string;
    openaiCompatible: string;
    ollama: string;
    vllm: string;
}

// 聊天界面
export interface ChatInterfaceTranslations {
    title: string;
    welcomeMessage: string;
    inputPlaceholder: string;
    thinking: string;
    executingTool: string;
    toolComplete: string;
    errorPrefix: string;
    tipCommand: string;
    tipShortcut: string;
    clearChat: string;
    clearChatConfirm: string;
    exportChat: string;
    switchProvider: string;
    providerBadge: string;
}

// 风险等级
export interface RiskLevelTranslations {
    low: string;
    medium: string;
    high: string;
    unknown: string;
}

// 高级设置
export interface AdvancedSettingsTranslations {
    title: string;
    configManagement: string;
    validateConfig: string;
    resetDefaults: string;
    logSettings: string;
    logLevel: string;
    logLevels: {
        debug: string;
        info: string;
        warn: string;
        error: string;
    };
    systemInfo: string;
    pluginVersion: string;
    supportedProviders: string;
    currentProvider: string;
}

// 上下文设置
export interface ContextSettingsTranslations {
    title: string;
    autoCompact: string;
    enableAutoCompact: string;
    autoCompactDesc: string;
    autoCompactEnabled: string;
    autoCompactDisabled: string;
    tokenConfig: string;
    currentProviderLimit: string;
    maxContextTokens: string;
    maxContextTokensDesc: string;
    reservedOutputTokens: string;
    reservedOutputTokensDesc: string;
    thresholdConfig: string;
    pruneThreshold: string;
    pruneThresholdDesc: string;
    compactThreshold: string;
    compactThresholdDesc: string;
    messagesToKeep: string;
    messagesToKeepDesc: string;
    configSaved: string;
}

// 主翻译类型
export interface TranslationKeys {
    common: CommonTranslations;
    settings: SettingsTranslations;
    general: GeneralTranslations;
    chatSettings: ChatSettingsTranslations;
    security: SecurityTranslations;
    providers: ProvidersTranslations;
    providerNames: ProviderNamesTranslations;
    chatInterface: ChatInterfaceTranslations;
    riskLevel: RiskLevelTranslations;
    advancedSettings: AdvancedSettingsTranslations;
    contextSettings: ContextSettingsTranslations;
}

// 支持的语言类型
export type SupportedLanguage = 'zh-CN' | 'en-US' | 'ja-JP';

// 语言配置
export interface LanguageConfig {
    code: SupportedLanguage;
    label: string;
    flag: string;
}
