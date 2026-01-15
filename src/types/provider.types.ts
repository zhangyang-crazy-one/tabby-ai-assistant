/**
 * AI提供商相关类型定义
 */

import { Observable } from 'rxjs';
import { ProviderCapability, HealthStatus, ValidationResult } from './ai.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from './ai.types';

// 重新导出相关类型
export { ProviderCapability, HealthStatus, ValidationResult };
export { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse };

// ==================== 认证配置 ====================

export type AuthType = 'apiKey' | 'bearer' | 'basic' | 'oauth' | 'none';

export interface AuthConfig {
    type: AuthType;
    credentials: Record<string, string>;
    requiresEncryption?: boolean;
}

// ==================== 提供商配置 ====================

export interface ProviderConfig {
    name: string;
    displayName: string;
    apiKey?: string;
    baseURL?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
    retries?: number;
    authConfig?: AuthConfig;
    enabled?: boolean;
    contextWindow?: number;  // 供应商上下文窗口限制
    disableStreaming?: boolean;  // 禁用流式响应（用于不支持流式的 OpenAI 兼容站点）
}

// 提供商默认配置
export interface ProviderDefaults {
    baseURL: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
    retries: number;
    contextWindow: number;
    authConfig: AuthConfig;
}

// 所有已知提供商及其默认配置
export const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
    openai: {
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    anthropic: {
        baseURL: 'https://api.anthropic.com',
        model: 'claude-3-sonnet',
        maxTokens: 1000,
        temperature: 1.0,
        timeout: 30000,
        retries: 3,
        contextWindow: 200000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    minimax: {
        baseURL: 'https://api.minimaxi.com/anthropic',
        model: 'MiniMax-M2',
        maxTokens: 1000,
        temperature: 1.0,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    glm: {
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
        model: 'glm-4.6',
        maxTokens: 1000,
        temperature: 0.95,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    ollama: {
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3.1',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 8192,
        authConfig: { type: 'none', credentials: {} }
    },
    vllm: {
        baseURL: 'http://localhost:8000/v1',
        model: 'meta-llama/Llama-3.1-8B',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 8192,
        authConfig: { type: 'bearer', credentials: {} }
    },
    'openai-compatible': {
        baseURL: 'http://localhost:11434/v1',
        model: 'gpt-3.5-turbo',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    }
};

// 配置工具函数
export namespace ProviderConfigUtils {
    /**
     * 使用默认值填充配置
     */
    export function fillDefaults(config: Partial<ProviderConfig>, providerName: string): ProviderConfig {
        const defaults = PROVIDER_DEFAULTS[providerName];
        if (!defaults) {
            throw new Error(`Unknown provider: ${providerName}`);
        }

        return {
            name: config.name || providerName,
            displayName: config.displayName || providerName,
            apiKey: config.apiKey,
            baseURL: config.baseURL || defaults.baseURL,
            model: config.model || defaults.model,
            maxTokens: config.maxTokens ?? defaults.maxTokens,
            temperature: config.temperature ?? defaults.temperature,
            timeout: config.timeout ?? defaults.timeout,
            retries: config.retries ?? defaults.retries,
            authConfig: config.authConfig || defaults.authConfig,
            enabled: config.enabled ?? true,
            contextWindow: config.contextWindow ?? defaults.contextWindow,
            disableStreaming: config.disableStreaming ?? false  // ✅ 新增
        };
    }

    /**
     * 检查配置是否完整（可用于API调用）
     */
    export function isConfigComplete(config: ProviderConfig): boolean {
        return !!(
            config.name &&
            config.displayName &&
            // API key 不是必需的（如本地服务）
            (config.apiKey || config.authConfig?.type === 'none') &&
            config.baseURL
        );
    }

    /**
     * 克隆配置（深拷贝，移除敏感信息）
     */
    export function cloneConfig(config: ProviderConfig, maskApiKey = true): ProviderConfig {
        const clone = { ...config };
        if (maskApiKey && clone.apiKey) {
            clone.apiKey = '***MASKED***';
        }
        return clone;
    }

    /**
     * 获取提供商默认配置
     */
    export function getDefaults(providerName: string): ProviderDefaults | undefined {
        return PROVIDER_DEFAULTS[providerName];
    }

    /**
     * 获取所有已知提供商名称
     */
    export function getKnownProviders(): string[] {
        return Object.keys(PROVIDER_DEFAULTS);
    }

    /**
     * 检查是否为已知提供商
     */
    export function isKnownProvider(name: string): boolean {
        return name in PROVIDER_DEFAULTS;
    }
}

// ==================== 提供商信息 ====================

export interface ProviderPricing {
    type: 'free' | 'paid' | 'freemium';
    currency: string;
    unit: string;
    costPerUnit?: number;
}

export interface ProviderInfo {
    name: string;
    displayName: string;
    version: string;
    description: string;
    capabilities: ProviderCapability[];
    authConfig: AuthConfig;
    supportedModels: string[];
    configured?: boolean;
    lastHealthCheck?: { status: HealthStatus; timestamp: Date };
    pricing?: ProviderPricing;
    documentation?: string;
    defaults?: ProviderDefaults;
}

// ==================== 基础AI提供商接口 ====================

export interface IBaseAiProvider {
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

// ==================== 提供商管理器 ====================

export interface ProviderManager {
    registerProvider(provider: IBaseAiProvider): void;
    unregisterProvider(name: string): void;
    getProvider(name: string): IBaseAiProvider | undefined;
    getAllProviders(): IBaseAiProvider[];
    getActiveProvider(): IBaseAiProvider | undefined;
    setActiveProvider(name: string): boolean;
    getProviderInfo(name: string): ProviderInfo | undefined;
    getAllProviderInfo(): ProviderInfo[];
}

// ==================== 提供商事件 ====================

export interface ProviderEvent {
    type: 'connected' | 'disconnected' | 'error' | 'config_changed' | 'health_changed';
    provider: string;
    timestamp: Date;
    data?: any;
}

export type ProviderEventListener = (event: ProviderEvent) => void;

// ==================== 便利类型 ====================

export type BaseAiProvider = IBaseAiProvider;
