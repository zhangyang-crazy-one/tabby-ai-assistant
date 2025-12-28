import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, StreamEvent, MessageRole, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * vLLM 本地 AI 提供商
 * 兼容 OpenAI API 格式，默认端口 8000
 */
@Injectable()
export class VllmProviderService extends BaseAiProvider {
    readonly name = 'vllm';
    readonly displayName = 'vLLM (本地)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.STREAMING,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: { apiKey: '' }
    };

    constructor(logger: LoggerService) {
        super(logger);
    }

    protected getDefaultBaseURL(): string {
        return 'http://localhost:8000/v1';
    }

    /**
     * 获取认证头
     */
    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (this.config?.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        return headers;
    }

    /**
     * 非流式聊天
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        this.logRequest(request);

        try {
            const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    model: this.config?.model || 'meta-llama/Llama-3.1-8B',
                    messages: this.transformMessages(request.messages),
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`vLLM API error: ${response.status}`);
            }

            const data = await response.json();
            this.logResponse(data);

            return {
                message: {
                    id: this.generateId(),
                    role: MessageRole.ASSISTANT,
                    content: data.choices[0]?.message?.content || '',
                    timestamp: new Date()
                },
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        } catch (error) {
            this.logError(error, { request });
            throw new Error(`vLLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            const abortController = new AbortController();

            this.logRequest(request);

            const runStream = async () => {
                try {
                    const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
                        method: 'POST',
                        headers: this.getAuthHeaders(),
                        body: JSON.stringify({
                            model: this.config?.model || 'meta-llama/Llama-3.1-8B',
                            messages: this.transformMessages(request.messages),
                            max_tokens: request.maxTokens || 1000,
                            temperature: request.temperature || 0.7,
                            stream: true
                        }),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        throw new Error(`vLLM API error: ${response.status}`);
                    }

                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder();

                    if (!reader) {
                        throw new Error('No response body');
                    }

                    let fullContent = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

                        for (const line of lines) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices[0]?.delta?.content;
                                if (delta) {
                                    fullContent += delta;
                                    subscriber.next({
                                        type: 'text_delta',
                                        textDelta: delta
                                    });
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }

                    subscriber.next({
                        type: 'message_end',
                        message: {
                            id: this.generateId(),
                            role: MessageRole.ASSISTANT,
                            content: fullContent,
                            timestamp: new Date()
                        }
                    });
                    subscriber.complete();
                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        this.logError(error, { request });
                        subscriber.error(new Error(`vLLM stream failed: ${error instanceof Error ? error.message : String(error)}`));
                    }
                }
            };

            runStream();

            // 返回取消函数
            return () => abortController.abort();
        });
    }

    /**
     * 健康检查 - 检测 vLLM 服务是否运行
     */
    async healthCheck(): Promise<HealthStatus> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.getBaseURL()}/models`, {
                method: 'GET',
                headers: this.getAuthHeaders(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.lastHealthCheck = { status: HealthStatus.HEALTHY, timestamp: new Date() };
                return HealthStatus.HEALTHY;
            }
            return HealthStatus.DEGRADED;
        } catch (error) {
            this.logger.warn('vLLM health check failed', error);
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.config?.model) {
            warnings.push('未指定模型，将使用默认模型 meta-llama/Llama-3.1-8B');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
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
     * 转换消息格式
     */
    protected transformMessages(messages: any[]): any[] {
        return messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        }));
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
            this.logger.warn('Failed to parse vLLM command response as JSON', error);
        }

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
            this.logger.warn('Failed to parse vLLM explain response as JSON', error);
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
            this.logger.warn('Failed to parse vLLM analysis response as JSON', error);
        }

        return {
            summary: content,
            insights: [],
            success: true
        };
    }
}
