import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * OpenAI AI提供商
 * 基于OpenAI API格式
 */
@Injectable()
export class OpenAiProviderService extends BaseAiProvider {
    readonly name = 'openai';
    readonly displayName = 'OpenAI (GPT-4)';
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

    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('OpenAI API key not provided');
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

            this.logger.info('OpenAI client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'gpt-4'
            });
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.post('/chat/completions', {
                    model: this.config?.model || 'gpt-4',
                    messages: this.transformMessages(request.messages),
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7,
                    stream: request.stream || false
                });

                this.logResponse(result.data);
                return result.data;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 暂未实现，回退到非流式
     */
    chatStream(request: ChatRequest): Observable<any> {
        // 回退到非流式
        return from(this.chat(request));
    }

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

    async healthCheck(): Promise<HealthStatus> {
        try {
            if (!this.client) {
                return HealthStatus.UNHEALTHY;
            }

            const response = await this.client.post('/chat/completions', {
                model: this.config?.model || 'gpt-4',
                max_tokens: 1,
                messages: [
                    {
                        role: 'user',
                        content: 'Hi'
                    }
                ]
            });

            if (response.status === 200) {
                this.lastHealthCheck = { status: HealthStatus.HEALTHY, timestamp: new Date() };
                return HealthStatus.HEALTHY;
            }

            return HealthStatus.DEGRADED;

        } catch (error) {
            this.logger.error('OpenAI health check failed', error);
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'OpenAI API key is required']
            };
        }

        const supportedModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    protected getDefaultBaseURL(): string {
        return 'https://api.openai.com/v1';
    }

    protected transformMessages(messages: any[]): any[] {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    private transformChatResponse(response: any): ChatResponse {
        const choice = response.choices?.[0];
        const content = choice?.message?.content || '';

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content,
                timestamp: new Date()
            },
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens || 0,
                completionTokens: response.usage.completion_tokens || 0,
                totalTokens: response.usage.total_tokens || 0
            } : undefined
        };
    }

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

        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        return {
            command: lines[0] || '',
            explanation: lines.slice(1).join(' ') || 'AI生成的命令',
            confidence: 0.5
        };
    }

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
}
