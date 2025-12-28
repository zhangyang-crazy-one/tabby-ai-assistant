import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * GLM (ChatGLM) AI提供商
 * 基于Anthropic兼容API格式
 */
@Injectable()
export class GlmProviderService extends BaseAiProvider {
    readonly name = 'glm';
    readonly displayName = 'GLM (ChatGLM-4.6)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION,
        ProviderCapability.FUNCTION_CALL,
        ProviderCapability.STREAMING
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: {
            apiKey: ''
        }
    };

    private client: AxiosInstance | null = null;

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
     * 配置提供商
     */
    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    /**
     * 初始化HTTP客户端
     */
    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('GLM API key not provided');
            return;
        }

        try {
            this.client = axios.create({
                baseURL: this.getBaseURL(),
                timeout: this.getTimeout(),
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // 添加请求拦截器
            this.client.interceptors.request.use(
                (config) => {
                    this.logger.debug('GLM API request', {
                        url: config.url,
                        method: config.method,
                        data: this.sanitizeRequest(config.data)
                    });
                    return config;
                },
                (error) => {
                    this.logger.error('GLM API request error', error);
                    return Promise.reject(error);
                }
            );

            // 添加响应拦截器
            this.client.interceptors.response.use(
                (response) => {
                    this.logger.debug('GLM API response', {
                        status: response.status,
                        data: this.sanitizeResponse(response.data)
                    });
                    return response;
                },
                (error) => {
                    this.logger.error('GLM API response error', error);
                    return Promise.reject(error);
                }
            );

            this.logger.info('GLM client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'glm-4.6'
            });
        } catch (error) {
            this.logger.error('Failed to initialize GLM client', error);
            throw error;
        }
    }

    /**
     * 聊天功能
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('GLM client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.post('/v1/messages', {
                    model: this.config?.model || 'glm-4.6',
                    max_tokens: request.maxTokens || 1000,
                    system: request.systemPrompt || this.getDefaultSystemPrompt(),
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 0.95,
                    stream: request.stream || false
                });

                this.logResponse(result.data);
                return result.data;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`GLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 暂未实现，回退到非流式
     */
    chatStream(request: ChatRequest): Observable<any> {
        // 回退到非流式
        return from(this.chat(request));
    }

    /**
     * 生成命令
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        const prompt = this.buildCommandPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 500,
            temperature: 0.3
        };

        const response = await this.chat(chatRequest);
        return this.parseCommandResponse(response.message.content);
    }

    /**
     * 解释命令
     */
    async explainCommand(request: ExplainRequest): Promise<ExplainResponse> {
        const prompt = this.buildExplainPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 1000,
            temperature: 0.5
        };

        const response = await this.chat(chatRequest);
        return this.parseExplainResponse(response.message.content);
    }

    /**
     * 分析结果
     */
    async analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse> {
        const prompt = this.buildAnalysisPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 1000,
            temperature: 0.7
        };

        const response = await this.chat(chatRequest);
        return this.parseAnalysisResponse(response.message.content);
    }

    /**
     * 健康检查
     */
    async healthCheck(): Promise<HealthStatus> {
        try {
            if (!this.client) {
                return HealthStatus.UNHEALTHY;
            }

            // 简单的测试请求
            const response = await this.client.post('/v1/messages', {
                model: this.config?.model || 'glm-4.6',
                max_tokens: 1,
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Hi' }]
                    }
                ]
            });

            if (response.status === 200) {
                this.lastHealthCheck = { status: HealthStatus.HEALTHY, timestamp: new Date() };
                return HealthStatus.HEALTHY;
            }

            return HealthStatus.DEGRADED;

        } catch (error) {
            this.logger.error('GLM health check failed', error);
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'GLM API key is required']
            };
        }

        // 验证支持的模型
        const supportedModels = ['glm-4.6'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * 获取默认基础URL
     * GLM提供与Anthropic兼容的API端点
     */
    protected getDefaultBaseURL(): string {
        return 'https://open.bigmodel.cn/api/anthropic';
    }

    /**
     * 转换消息格式（Anthropic兼容）
     */
    protected transformMessages(messages: any[]): any[] {
        return messages.map(msg => ({
            role: msg.role,
            content: [{ type: 'text', text: msg.content }]
        }));
    }

    /**
     * 转换聊天响应
     */
    private transformChatResponse(response: any): ChatResponse {
        const content = response.content[0];
        const text = content.type === 'text' ? content.text : '';

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: text,
                timestamp: new Date()
            },
            usage: response.usage ? {
                promptTokens: response.usage.input_tokens || 0,
                completionTokens: response.usage.output_tokens || 0,
                totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
            } : undefined
        };
    }

    /**
     * 构建命令生成提示
     */
    private buildCommandPrompt(request: CommandRequest): string {
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
     * 构建命令解释提示
     */
    private buildExplainPrompt(request: ExplainRequest): string {
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
     * 构建结果分析提示
     */
    private buildAnalysisPrompt(request: AnalysisRequest): string {
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
     * 解析命令响应
     */
    private parseCommandResponse(content: string): CommandResponse {
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
     * 解析解释响应
     */
    private parseExplainResponse(content: string): ExplainResponse {
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
     * 解析分析响应
     */
    private parseAnalysisResponse(content: string): AnalysisResponse {
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

    private getDefaultSystemPrompt(): string {
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

## 示例
用户："查看当前目录的文件"
正确做法：调用 write_to_terminal 工具，参数 { "command": "dir", "execute": true }
错误做法：仅回复文字"我将执行 dir 命令"

用户："切换到终端4"
正确做法：调用 focus_terminal 工具，参数 { "terminal_index": 4 }
错误做法：仅回复文字"已切换到终端4"（不调用工具）`;
    }
}
