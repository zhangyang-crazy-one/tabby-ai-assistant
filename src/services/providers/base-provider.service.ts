import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseAiProvider as IBaseAiProvider, ProviderConfig, AuthConfig, ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * 基础AI提供商抽象类
 * 所有AI提供商都应该继承此类
 */
@Injectable()
export abstract class BaseAiProvider extends IBaseAiProvider {
    abstract readonly name: string;
    abstract readonly displayName: string;
    abstract readonly capabilities: ProviderCapability[];
    abstract readonly authConfig: AuthConfig;

    protected config: ProviderConfig | null = null;
    protected isInitialized = false;
    protected lastHealthCheck: { status: HealthStatus; timestamp: Date } | null = null;

    constructor(protected logger: LoggerService) {
        super();
    }

    /**
     * 配置提供商
     */
    configure(config: ProviderConfig): void {
        this.config = { ...config };
        this.isInitialized = true;
        this.logger.debug(`Provider ${this.name} configured`, { config: { ...config, apiKey: '***' } });
    }

    /**
     * 聊天功能 - 必须由子类实现
     */
    abstract chat(request: ChatRequest): Promise<ChatResponse>;

    /**
     * 流式聊天功能 - 必须由子类实现
     */
    abstract chatStream(request: ChatRequest): Observable<StreamEvent>;

    /**
     * 生成命令 - 必须由子类实现
     */
    abstract generateCommand(request: CommandRequest): Promise<CommandResponse>;

    /**
     * 解释命令 - 必须由子类实现
     */
    abstract explainCommand(request: ExplainRequest): Promise<ExplainResponse>;

    /**
     * 分析结果 - 必须由子类实现
     */
    abstract analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    /**
     * 健康检查 - 默认实现，子类可以重写
     */
    async healthCheck(): Promise<HealthStatus> {
        try {
            // 简单的健康检查：验证配置和连接
            const validation = this.validateConfig();
            if (!validation.valid) {
                this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
                return HealthStatus.UNHEALTHY;
            }

            // TODO: 实际的网络健康检查
            this.lastHealthCheck = { status: HealthStatus.HEALTHY, timestamp: new Date() };
            return HealthStatus.HEALTHY;

        } catch (error) {
            this.logger.error(`Health check failed for ${this.name}`, error);
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 验证配置 - 默认实现，子类可以重写
     */
    validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查必需的配置
        if (!this.config) {
            errors.push('Provider not configured');
            return { valid: false, errors, warnings };
        }

        // 检查API密钥
        if (!this.config.apiKey) {
            errors.push('API key is required');
        }

        // 检查模型
        if (!this.config.model) {
            warnings.push('No model specified, using default');
        }

        // 检查基础URL
        if (!this.config.baseURL) {
            warnings.push('No base URL specified, using provider default');
        }

        // 检查令牌限制
        if (this.config.maxTokens && this.config.maxTokens < 1) {
            errors.push('Max tokens must be greater than 0');
        }

        // 检查温度参数
        if (this.config.temperature !== undefined && (this.config.temperature < 0 || this.config.temperature > 2)) {
            warnings.push('Temperature should be between 0 and 2');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * 检查是否支持指定能力
     */
    supportsCapability(capability: ProviderCapability): boolean {
        return this.capabilities.includes(capability);
    }

    /**
     * 获取提供商信息
     */
    getInfo(): any {
        return {
            name: this.name,
            displayName: this.displayName,
            version: '1.0.0',
            description: `${this.displayName} AI Provider`,
            capabilities: this.capabilities,
            authConfig: this.authConfig,
            supportedModels: this.config?.model ? [this.config.model] : [],
            configured: this.isInitialized,
            lastHealthCheck: this.lastHealthCheck
        };
    }

    /**
     * 获取当前配置
     */
    getConfig(): ProviderConfig | null {
        return this.config;
    }

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean {
        return this.isInitialized && this.config !== null;
    }

    /**
     * 检查是否启用
     */
    isEnabled(): boolean {
        return this.config?.enabled !== false;
    }

    /**
     * 获取认证头
     */
    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        switch (this.authConfig.type) {
            case 'apiKey':
            case 'bearer':
                if (this.config?.apiKey) {
                    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                }
                break;

            case 'basic':
                if (this.authConfig.credentials.username && this.authConfig.credentials.password) {
                    const credentials = Buffer.from(
                        `${this.authConfig.credentials.username}:${this.authConfig.credentials.password}`
                    ).toString('base64');
                    headers['Authorization'] = `Basic ${credentials}`;
                }
                break;

            case 'oauth':
                // TODO: 实现OAuth认证
                break;
        }

        return headers;
    }

    /**
     * 获取请求超时时间
     */
    protected getTimeout(): number {
        return this.config?.timeout || 30000; // 默认30秒
    }

    /**
     * 获取重试次数
     */
    protected getRetries(): number {
        return this.config?.retries || 3;
    }

    /**
     * 执行重试逻辑
     */
    protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        const retries = this.getRetries();

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === retries) {
                    break;
                }

                // 指数退避
                const delay = Math.pow(2, attempt) * 1000;
                this.logger.warn(
                    `Operation failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`,
                    { error: lastError.message }
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * 记录请求
     */
    protected logRequest(request: any): void {
        this.logger.debug(`[${this.name}] Request`, {
            request: this.sanitizeRequest(request)
        });
    }

    /**
     * 记录响应
     */
    protected logResponse(response: any): void {
        this.logger.debug(`[${this.name}] Response`, {
            response: this.sanitizeResponse(response)
        });
    }

    /**
     * 记录错误
     */
    protected logError(error: any, context?: any): void {
        this.logger.error(`[${this.name}] Error`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            context
        });
    }

    /**
     * 清理请求数据（移除敏感信息）
     */
    protected sanitizeRequest(request: any): any {
        const sanitized = { ...request };
        if (sanitized.apiKey) {
            sanitized.apiKey = '***';
        }
        if (sanitized.headers?.Authorization) {
            sanitized.headers.Authorization = '***';
        }
        return sanitized;
    }

    /**
     * 清理响应数据
     */
    protected sanitizeResponse(response: any): any {
        const sanitized = { ...response };
        if (sanitized.data?.apiKey) {
            sanitized.data.apiKey = '***';
        }
        return sanitized;
    }

    /**
     * 获取基础URL
     */
    protected getBaseURL(): string {
        return this.config?.baseURL || this.getDefaultBaseURL();
    }

    /**
     * 获取默认基础URL - 子类必须实现
     */
    protected abstract getDefaultBaseURL(): string;

    /**
     * 获取默认模型 - 子类可以重写
     */
    protected getDefaultModel(): string {
        return this.config?.model || 'default';
    }

    /**
     * 转换聊天消息格式 - 子类可以重写
     */
    protected transformMessages(messages: any[]): any[] {
        return messages;
    }

    /**
     * 转换响应格式 - 子类可以重写
     */
    protected transformResponse(response: any): ChatResponse {
        // 默认实现，子类应该重写
        return {
            message: {
                id: this.generateId(),
                role: 'assistant' as any,
                content: typeof response === 'string' ? response : JSON.stringify(response),
                timestamp: new Date()
            }
        };
    }

    /**
     * 生成唯一ID
     */
    protected generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 检查响应是否成功
     */
    protected isSuccessfulResponse(response: any): boolean {
        return response && !response.error;
    }

    /**
     * 提取错误信息
     */
    protected extractError(response: any): string {
        if (response.error?.message) {
            return response.error.message;
        }
        if (response.message) {
            return response.message;
        }
        if (typeof response === 'string') {
            return response;
        }
        return 'Unknown error';
    }
}
