import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { LoggerService } from './logger.service';
import { SecurityConfig } from '../../types/security.types';
import { ProviderConfig, PROVIDER_DEFAULTS, ProviderConfigUtils } from '../../types/provider.types';
import { ContextConfig } from '../../types/ai.types';

/**
 * AI助手配置
 */
export interface AiAssistantConfig {
    enabled: boolean;
    defaultProvider: string;
    chatHistoryEnabled: boolean;
    maxChatHistory: number;
    autoSaveChat: boolean;
    theme: 'light' | 'dark' | 'auto';
    language: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    security: SecurityConfig;
    providers: { [name: string]: ProviderConfig };
    hotkeys: {
        openChat: string;
        generateCommand: string;
        explainCommand: string;
    };
    ui: {
        showTooltips: boolean;
        compactMode: boolean;
        fontSize: number;
    };
}

const DEFAULT_CONFIG: AiAssistantConfig = {
    enabled: true,
    defaultProvider: 'openai',
    chatHistoryEnabled: true,
    maxChatHistory: 100,
    autoSaveChat: true,
    theme: 'auto',
    language: 'zh-CN',
    logLevel: 'info',
    security: {
        enablePasswordProtection: false,
        consentExpiryDays: 30,
        maxConsentAge: 30,
        enableRiskAssessment: true,
        autoApproveLowRisk: true,
        promptForMediumRisk: true,
        requirePasswordForHighRisk: true,
        dangerousPatterns: [
            'rm -rf /',
            'sudo rm -rf /',
            'format',
            'dd if=',
            '> /dev/null',
            'fork\\('
        ],
        allowedCommands: [],
        forbiddenCommands: []
    },
    providers: {},
    hotkeys: {
        openChat: 'Ctrl-Shift-A',
        generateCommand: 'Ctrl-Shift-G',
        explainCommand: 'Ctrl-Shift-E'
    },
    ui: {
        showTooltips: true,
        compactMode: false,
        fontSize: 14
    }
};

@Injectable({ providedIn: 'root' })
export class ConfigProviderService {
    private config: AiAssistantConfig = { ...DEFAULT_CONFIG };
    private configChange$ = new Subject<{ key: string; value: any }>();

    constructor(private logger: LoggerService) {
        this.loadConfig();
    }

    /**
     * 加载配置
     */
    private loadConfig(): void {
        try {
            const stored = localStorage.getItem('ai-assistant-config');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.config = { ...DEFAULT_CONFIG, ...parsed };
                this.logger.info('Configuration loaded from storage');
            } else {
                this.logger.info('No stored configuration found, using defaults');
            }
        } catch (error) {
            this.logger.error('Failed to load configuration', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    /**
     * 保存配置
     */
    private saveConfig(): void {
        try {
            localStorage.setItem('ai-assistant-config', JSON.stringify(this.config));
            this.logger.debug('Configuration saved to storage');
        } catch (error) {
            this.logger.error('Failed to save configuration', error);
        }
    }

    /**
     * 获取完整配置
     */
    getConfig(): AiAssistantConfig {
        return { ...this.config };
    }

    /**
     * 设置完整配置
     */
    setConfig(config: Partial<AiAssistantConfig>): void {
        this.config = { ...this.config, ...config };
        this.saveConfig();
        this.configChange$.next({ key: '*', value: this.config });
        this.logger.info('Configuration updated');
    }

    /**
     * 获取指定配置项
     */
    get<T>(key: string, defaultValue?: T): T | undefined {
        const keys = key.split('.');
        let value: any = this.config;

        for (const k of keys) {
            if (value === null || value === undefined) {
                return defaultValue;
            }
            value = value[k];
        }

        return value !== undefined ? value : defaultValue;
    }

    /**
     * 设置指定配置项
     */
    set<T>(key: string, value: T): void {
        const keys = key.split('.');
        const lastKey = keys.pop()!;

        // 导航到父对象
        let target: any = this.config;
        for (const k of keys) {
            if (!(k in target) || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }

        // 设置值
        target[lastKey] = value;
        this.saveConfig();
        this.configChange$.next({ key, value });

        this.logger.debug('Configuration item updated', { key, value });
    }

    /**
     * 获取提供商配置
     */
    getProviderConfig(name: string): ProviderConfig | null {
        return this.config.providers[name] || null;
    }

    /**
     * 设置提供商配置
     */
    setProviderConfig(name: string, config: ProviderConfig): void {
        this.config.providers[name] = config;
        this.saveConfig();
        this.configChange$.next({ key: `providers.${name}`, value: config });
        this.logger.info('Provider configuration updated', { provider: name });
    }

    /**
     * 删除提供商配置
     */
    deleteProviderConfig(name: string): void {
        delete this.config.providers[name];
        this.saveConfig();
        this.configChange$.next({ key: `providers.${name}`, value: null });
        this.logger.info('Provider configuration deleted', { provider: name });
    }

    /**
     * 获取所有提供商配置
     */
    getAllProviderConfigs(): { [name: string]: ProviderConfig } {
        return { ...this.config.providers };
    }

    /**
     * 获取活跃供应商的上下文窗口大小
     */
    getActiveProviderContextWindow(): number {
        const activeProvider = this.config.defaultProvider;
        if (!activeProvider) {
            return 200000; // 默认值
        }
        const providerConfig = this.getProviderConfig(activeProvider);
        const contextWindow = providerConfig?.contextWindow;
        if (contextWindow && contextWindow > 0) {
            return contextWindow;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[activeProvider];
        return defaults?.contextWindow || 200000;
    }

    /**
     * 获取默认提供商
     */
    getDefaultProvider(): string {
        return this.config.defaultProvider;
    }

    /**
     * 设置默认提供商
     */
    setDefaultProvider(name: string): void {
        this.config.defaultProvider = name;
        this.saveConfig();
        this.configChange$.next({ key: 'defaultProvider', value: name });
        this.logger.info('Default provider changed', { provider: name });
    }

    /**
     * 获取安全配置
     */
    getSecurityConfig(): SecurityConfig {
        return { ...this.config.security };
    }

    /**
     * 更新安全配置
     */
    updateSecurityConfig(config: Partial<SecurityConfig>): void {
        this.config.security = { ...this.config.security, ...config };
        this.saveConfig();
        this.configChange$.next({ key: 'security', value: this.config.security });
        this.logger.info('Security configuration updated');
    }

    /**
     * 获取启用状态
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * 设置启用状态
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.saveConfig();
        this.configChange$.next({ key: 'enabled', value: enabled });
        this.logger.info('AI Assistant enabled state changed', { enabled });
    }

    /**
     * 获取日志级别
     */
    getLogLevel(): string {
        return this.config.logLevel;
    }

    /**
     * 设置日志级别
     */
    setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
        this.config.logLevel = level;
        this.saveConfig();
        this.configChange$.next({ key: 'logLevel', value: level });
        this.logger.info('Log level changed', { level });
    }

    /**
     * 重置为默认配置
     */
    reset(): void {
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
        this.configChange$.next({ key: '*', value: this.config });
        this.logger.info('Configuration reset to defaults');
    }

    /**
     * 订阅配置变化
     */
    onConfigChange(): Observable<{ key: string; value: any }> {
        return this.configChange$.asObservable();
    }

    /**
     * 导出配置
     */
    exportConfig(): string {
        // 排除敏感信息（如API密钥）
        const exportData = { ...this.config };
        if (exportData.providers) {
            Object.keys(exportData.providers).forEach(name => {
                if (exportData.providers[name].apiKey) {
                    exportData.providers[name].apiKey = '***MASKED***';
                }
            });
        }
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导入配置
     */
    importConfig(configJson: string): void {
        try {
            const imported = JSON.parse(configJson);
            this.setConfig(imported);
            this.logger.info('Configuration imported successfully');
        } catch (error) {
            this.logger.error('Failed to import configuration', error);
            throw new Error('Invalid configuration format');
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 验证默认提供商
        if (!this.config.providers[this.config.defaultProvider]) {
            errors.push('Default provider configuration not found');
        }

        // 验证安全配置
        if (this.config.security.consentExpiryDays < 1) {
            errors.push('Consent expiry days must be at least 1');
        }

        // 验证聊天历史配置
        if (this.config.maxChatHistory < 0) {
            errors.push('Max chat history must be non-negative');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ==================== 上下文配置 ====================

    /**
     * 获取上下文配置
     */
    getContextConfig(): ContextConfig | null {
        try {
            const key = 'tabby-ai-assistant-context-config';
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    }

    /**
     * 设置上下文配置
     */
    setContextConfig(config: ContextConfig): void {
        const key = 'tabby-ai-assistant-context-config';
        localStorage.setItem(key, JSON.stringify(config));
    }

    /**
     * 获取自动压缩开关状态
     */
    isAutoCompactEnabled(): boolean {
        const key = 'tabby-ai-assistant-auto-compact';
        return localStorage.getItem(key) !== 'false';
    }

    /**
     * 设置自动压缩开关状态
     */
    setAutoCompactEnabled(enabled: boolean): void {
        const key = 'tabby-ai-assistant-auto-compact';
        localStorage.setItem(key, String(enabled));
    }
}
