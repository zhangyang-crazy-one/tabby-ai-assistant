import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Anthropic Claude AI提供商
 * 基于Anthropic Claude API
 */
@Injectable()
export class AnthropicProviderService extends BaseAiProvider {
    readonly name = 'anthropic';
    readonly displayName = 'Anthropic Claude';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION,
        ProviderCapability.REASONING,
        ProviderCapability.STREAMING
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: {
            apiKey: ''
        }
    };

    private client: Anthropic | null = null;

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
            this.logger.warn('Anthropic API key not provided');
            return;
        }

        try {
            this.client = new Anthropic({
                apiKey: this.config.apiKey,
                baseURL: this.getBaseURL()
            });

            this.logger.info('Anthropic client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'claude-3-sonnet'
            });
        } catch (error) {
            this.logger.error('Failed to initialize Anthropic client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('Anthropic client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.messages.create({
                    model: this.config?.model || 'claude-3-sonnet',
                    max_tokens: request.maxTokens || 1000,
                    system: request.systemPrompt || this.getDefaultSystemPrompt(),
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 1.0,
                    stream: request.stream || false
                });

                this.logResponse(result);
                return result;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Anthropic chat failed: ${error instanceof Error ? error.message : String(error)}`);
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

            const response = await this.client.messages.create({
                model: this.config?.model || 'claude-3-sonnet',
                max_tokens: 1,
                messages: [
                    {
                        role: 'user',
                        content: 'Hi'
                    }
                ]
            });

            this.lastHealthCheck = { status: HealthStatus.HEALTHY, timestamp: new Date() };
            return HealthStatus.HEALTHY;

        } catch (error) {
            this.logger.error('Anthropic health check failed', error);
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Anthropic API key is required']
            };
        }

        const supportedModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    protected getDefaultBaseURL(): string {
        return 'https://api.anthropic.com';
    }

    protected transformMessages(messages: any[]): any[] {
        return messages.map(msg => ({
            role: msg.role,
            content: [{ type: 'text', text: msg.content }]
        }));
    }

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
