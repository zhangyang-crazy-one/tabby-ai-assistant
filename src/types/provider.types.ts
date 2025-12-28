/**
 * AI提供商相关类型定义
 */

import { ProviderCapability, HealthStatus, ValidationResult } from './ai.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from './ai.types';

// 重新导出相关类型
export { ProviderCapability, HealthStatus, ValidationResult };
export { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse };

// 认证配置
export interface AuthConfig {
    type: 'apiKey' | 'bearer' | 'basic' | 'oauth' | 'none';
    credentials: Record<string, string>;
    requiresEncryption?: boolean;
}

// 提供商配置
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
}

// 提供商信息
export interface ProviderInfo {
    name: string;
    displayName: string;
    version: string;
    description: string;
    capabilities: ProviderCapability[];
    authConfig: AuthConfig;
    supportedModels: string[];
    pricing?: {
        type: 'free' | 'paid' | 'freemium';
        currency: string;
        unit: string;
        costPerUnit?: number;
    };
    documentation?: string;
}

// 基础AI提供商接口
export abstract class BaseAiProvider {
    abstract readonly name: string;
    abstract readonly displayName: string;
    abstract readonly capabilities: ProviderCapability[];
    abstract readonly authConfig: AuthConfig;

    protected config: ProviderConfig | null = null;

    /**
     * 配置提供商
     */
    abstract configure(config: ProviderConfig): void;

    /**
     * 聊天功能
     */
    abstract chat(request: ChatRequest): Promise<ChatResponse>;

    /**
     * 生成命令
     */
    abstract generateCommand(request: CommandRequest): Promise<CommandResponse>;

    /**
     * 解释命令
     */
    abstract explainCommand(request: ExplainRequest): Promise<ExplainResponse>;

    /**
     * 分析结果
     */
    abstract analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    /**
     * 健康检查
     */
    abstract healthCheck(): Promise<HealthStatus>;

    /**
     * 验证配置
     */
    abstract validateConfig(): ValidationResult;

    /**
     * 获取提供商信息
     */
    getInfo(): ProviderInfo {
        return {
            name: this.name,
            displayName: this.displayName,
            version: '1.0.0',
            description: `${this.displayName} AI Provider`,
            capabilities: this.capabilities,
            authConfig: this.authConfig,
            supportedModels: this.config?.model ? [this.config.model] : []
        };
    }

    /**
     * 检查是否支持指定能力
     */
    supportsCapability(capability: ProviderCapability): boolean {
        return this.capabilities.includes(capability);
    }

    /**
     * 获取当前配置
     */
    getConfig(): ProviderConfig | null {
        return this.config;
    }
}

// 提供商管理器
export interface ProviderManager {
    registerProvider(provider: BaseAiProvider): void;
    unregisterProvider(name: string): void;
    getProvider(name: string): BaseAiProvider | undefined;
    getAllProviders(): BaseAiProvider[];
    getActiveProvider(): BaseAiProvider | undefined;
    setActiveProvider(name: string): boolean;
    getProviderInfo(name: string): ProviderInfo | undefined;
    getAllProviderInfo(): ProviderInfo[];
}

// 提供商事件
export interface ProviderEvent {
    type: 'connected' | 'disconnected' | 'error' | 'config_changed' | 'health_changed';
    provider: string;
    timestamp: Date;
    data?: any;
}

// 提供商事件监听器
export type ProviderEventListener = (event: ProviderEvent) => void;
