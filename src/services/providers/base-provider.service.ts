import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { IBaseAiProvider, ProviderConfig, AuthConfig, ProviderCapability, HealthStatus, ValidationResult, ProviderInfo, PROVIDER_DEFAULTS } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, StreamEvent, MessageRole } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * 基础AI提供商抽象类
 * 所有AI提供商都应该实现此接口
 */
@Injectable()
export abstract class BaseAiProvider implements IBaseAiProvider {
    abstract readonly name: string;
    abstract readonly displayName: string;
    abstract readonly capabilities: ProviderCapability[];
    abstract readonly authConfig: AuthConfig;

    protected config: ProviderConfig | null = null;
    protected isInitialized = false;
    protected lastHealthCheck: { status: HealthStatus; timestamp: Date } | null = null;

    constructor(protected logger: LoggerService) {}

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
            // 1. 验证配置
            const validation = this.validateConfig();
            if (!validation.valid) {
                this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
                return HealthStatus.UNHEALTHY;
            }

            // 2. 执行网络健康检查
            const networkStatus = await this.performNetworkHealthCheck();

            this.lastHealthCheck = {
                status: networkStatus,
                timestamp: new Date()
            };

            return networkStatus;

        } catch (error) {
            this.logger.error(`Health check failed for ${this.name}`, error);
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 执行网络健康检查 - 发送测试请求
     */
    protected async performNetworkHealthCheck(): Promise<HealthStatus> {
        try {
            // 发送一个简单的测试请求
            const testRequest: ChatRequest = {
                messages: [{
                    id: 'health-check',
                    role: MessageRole.USER,
                    content: 'Hi',
                    timestamp: new Date()
                }],
                maxTokens: 1,
                temperature: 0
            };

            const response = await this.withRetry(() => this.sendTestRequest(testRequest));

            if (this.isSuccessfulResponse(response)) {
                return HealthStatus.HEALTHY;
            } else {
                this.logger.warn(`Health check returned unsuccessful response for ${this.name}`, {
                    response: this.sanitizeResponse(response)
                });
                return HealthStatus.DEGRADED;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 根据错误类型判断状态
            if (errorMessage.includes('timeout') || errorMessage.includes('Timed out')) {
                this.logger.warn(`Health check timed out for ${this.name}`);
                return HealthStatus.DEGRADED;
            }

            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') ||
                errorMessage.includes('invalid') || errorMessage.includes('API key')) {
                this.logger.warn(`Health check authentication failed for ${this.name}`);
                return HealthStatus.UNHEALTHY;
            }

            if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                this.logger.warn(`Health check rate limited for ${this.name}`);
                return HealthStatus.DEGRADED;
            }

            this.logger.error(`Health check network error for ${this.name}`, error);
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 发送测试请求 - 子类必须实现
     */
    protected abstract sendTestRequest(request: ChatRequest): Promise<ChatResponse>;

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
    getInfo(): ProviderInfo {
        return {
            name: this.name,
            displayName: this.displayName,
            version: '1.0.0',
            description: `${this.displayName} AI Provider`,
            capabilities: this.capabilities,
            authConfig: this.authConfig,
            supportedModels: this.config?.model ? [this.config.model] : [],
            configured: this.isInitialized,
            lastHealthCheck: this.lastHealthCheck ?? undefined
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
                // OAuth 认证预留
                // 当前无提供商使用此认证方式
                // 如需实现，可参考 OAuth 2.0 Authorization Code Flow
                this.logger.debug('OAuth authentication not implemented');
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
        if (this.config?.baseURL) {
            return this.config.baseURL;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.baseURL || '';
    }

    /**
     * 获取默认模型
     */
    protected getDefaultModel(): string {
        if (this.config?.model) {
            return this.config.model;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.model || 'default';
    }

    /**
     * 获取默认超时时间
     */
    protected getDefaultTimeout(): number {
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.timeout || 30000;
    }

    /**
     * 获取默认重试次数
     */
    protected getDefaultRetries(): number {
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.retries || 3;
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

    // ==================== 通用命令处理方法 ====================

    /**
     * 构建命令生成提示 - 通用实现
     */
    protected buildCommandPrompt(request: CommandRequest): string {
        let prompt = `请将以下自然语言描述转换为准确的终端命令：\n\n"${request.naturalLanguage}"\n\n`;

        if (request.context) {
            prompt += `当前环境：\n`;
            if (request.context.currentDirectory) {
                prompt += `- 当前目录：${request.context.currentDirectory}\n`;
            }
            if (request.context.operatingSystem) {
                prompt += `- 操作系统：${request.context.operatingSystem}\n`;
            }
            if (request.context.shell) {
                prompt += `- Shell：${request.context.shell}\n`;
            }
        }

        prompt += `\n请直接返回JSON格式：\n`;
        prompt += `{\n`;
        prompt += `  "command": "具体命令",\n`;
        prompt += `  "explanation": "命令解释",\n`;
        prompt += `  "confidence": 0.95\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 构建命令解释提示 - 通用实现
     */
    protected buildExplainPrompt(request: ExplainRequest): string {
        let prompt = `请详细解释以下终端命令：\n\n\`${request.command}\`\n\n`;

        if (request.context?.currentDirectory) {
            prompt += `当前目录：${request.context.currentDirectory}\n`;
        }
        if (request.context?.operatingSystem) {
            prompt += `操作系统：${request.context.operatingSystem}\n`;
        }

        prompt += `\n请按以下JSON格式返回：\n`;
        prompt += `{\n`;
        prompt += `  "explanation": "整体解释",\n`;
        prompt += `  "breakdown": [\n`;
        prompt += `    {"part": "命令部分", "description": "说明"}\n`;
        prompt += `  ],\n`;
        prompt += `  "examples": ["使用示例"]\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 构建结果分析提示 - 通用实现
     */
    protected buildAnalysisPrompt(request: AnalysisRequest): string {
        let prompt = `请分析以下命令执行结果：\n\n`;
        prompt += `命令：${request.command}\n`;
        prompt += `退出码：${request.exitCode}\n`;
        prompt += `输出：\n${request.output}\n\n`;

        if (request.context?.workingDirectory) {
            prompt += `工作目录：${request.context.workingDirectory}\n`;
        }

        prompt += `\n请按以下JSON格式返回：\n`;
        prompt += `{\n`;
        prompt += `  "summary": "结果总结",\n`;
        prompt += `  "insights": ["洞察1", "洞察2"],\n`;
        prompt += `  "success": true/false,\n`;
        prompt += `  "issues": [\n`;
        prompt += `    {"severity": "warning|error|info", "message": "问题描述", "suggestion": "建议"}\n`;
        prompt += `  ]\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 解析命令响应 - 通用实现
     */
    protected parseCommandResponse(content: string): CommandResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    command: parsed.command || '',
                    explanation: parsed.explanation || '',
                    confidence: parsed.confidence || 0.5
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse command response as JSON', error);
        }

        // 备用解析
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        return {
            command: lines[0] || '',
            explanation: lines.slice(1).join(' ') || 'AI生成的命令',
            confidence: 0.5
        };
    }

    /**
     * 解析解释响应 - 通用实现
     */
    protected parseExplainResponse(content: string): ExplainResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    explanation: parsed.explanation || '',
                    breakdown: parsed.breakdown || [],
                    examples: parsed.examples || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse explain response as JSON', error);
        }

        return {
            explanation: content,
            breakdown: []
        };
    }

    /**
     * 解析分析响应 - 通用实现
     */
    protected parseAnalysisResponse(content: string): AnalysisResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    summary: parsed.summary || '',
                    insights: parsed.insights || [],
                    success: parsed.success !== false,
                    issues: parsed.issues || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse analysis response as JSON', error);
        }

        return {
            summary: content,
            insights: [],
            success: true
        };
    }

    /**
     * 获取默认系统提示 - 子类可重写
     */
    protected getDefaultSystemPrompt(): string {
        return `你是一个专业的终端命令助手，运行在 Tabby 终端中。

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
错误做法：仅回复文字"已切换到终端4"（不调用工具）`;
    }
}
