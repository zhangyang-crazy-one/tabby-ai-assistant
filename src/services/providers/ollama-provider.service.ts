import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, StreamEvent, MessageRole, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Ollama 本地 AI 提供商
 * 兼容 OpenAI API 格式，默认端口 11434
 */
@Injectable()
export class OllamaProviderService extends BaseAiProvider {
    readonly name = 'ollama';
    readonly displayName = 'Ollama (本地)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.STREAMING,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION
    ];
    readonly authConfig = {
        type: 'none' as const,
        credentials: {}
    };

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
     * 非流式聊天
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        this.logRequest(request);

        try {
            const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config?.model || 'llama3.1',
                    messages: this.transformMessages(request.messages),
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
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
            throw new Error(`Ollama chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            const abortController = new AbortController();

            this.logRequest(request);

            const runStream = async () => {
                try {
                    const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: this.config?.model || 'llama3.1',
                            messages: this.transformMessages(request.messages),
                            max_tokens: request.maxTokens || 1000,
                            temperature: request.temperature || 0.7,
                            stream: true
                        }),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        throw new Error(`Ollama API error: ${response.status}`);
                    }

                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder();

                    if (!reader) {
                        throw new Error('No response body');
                    }

                    // 工具调用状态跟踪
                    let currentToolCallId = '';
                    let currentToolCallName = '';
                    let currentToolInput = '';
                    let currentToolIndex = -1;
                    let fullContent = '';

                    while (true) {
                        if (abortController.signal.aborted) break;

                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

                        for (const line of lines) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const choice = parsed.choices?.[0];

                                this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

                                // 处理工具调用块
                                if (choice?.delta?.tool_calls?.length > 0) {
                                    for (const toolCall of choice.delta.tool_calls) {
                                        const index = toolCall.index || 0;

                                        // 新工具调用开始
                                        if (currentToolIndex !== index) {
                                            if (currentToolIndex >= 0) {
                                                // 发送前一个工具调用的结束事件
                                                let parsedInput = {};
                                                try {
                                                    parsedInput = JSON.parse(currentToolInput || '{}');
                                                } catch (e) {
                                                    // 使用原始输入
                                                }
                                                subscriber.next({
                                                    type: 'tool_use_end',
                                                    toolCall: {
                                                        id: currentToolCallId,
                                                        name: currentToolCallName,
                                                        input: parsedInput
                                                    }
                                                });
                                                this.logger.debug('Stream event', { type: 'tool_use_end', name: currentToolCallName });
                                            }

                                            currentToolIndex = index;
                                            currentToolCallId = toolCall.id || `tool_${Date.now()}_${index}`;
                                            currentToolCallName = toolCall.function?.name || '';
                                            currentToolInput = toolCall.function?.arguments || '';

                                            // 发送工具调用开始事件
                                            subscriber.next({
                                                type: 'tool_use_start',
                                                toolCall: {
                                                    id: currentToolCallId,
                                                    name: currentToolCallName,
                                                    input: {}
                                                }
                                            });
                                            this.logger.debug('Stream event', { type: 'tool_use_start', name: currentToolCallName });
                                        } else {
                                            // 继续累积参数
                                            if (toolCall.function?.arguments) {
                                                currentToolInput += toolCall.function.arguments;
                                            }
                                        }
                                    }
                                }
                                // 处理文本增量
                                else if (choice?.delta?.content) {
                                    const delta = choice.delta.content;
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

                    // 发送最后一个工具调用的结束事件
                    if (currentToolIndex >= 0) {
                        let parsedInput = {};
                        try {
                            parsedInput = JSON.parse(currentToolInput || '{}');
                        } catch (e) {
                            // 使用原始输入
                        }
                        subscriber.next({
                            type: 'tool_use_end',
                            toolCall: {
                                id: currentToolCallId,
                                name: currentToolCallName,
                                input: parsedInput
                            }
                        });
                        this.logger.debug('Stream event', { type: 'tool_use_end', name: currentToolCallName });
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
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();
                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `Ollama stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logError(error, { request });
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
                }
            };

            runStream();

            // 返回取消函数
            return () => abortController.abort();
        });
    }

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        const response = await fetch(`${this.getBaseURL()}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessages(request.messages),
                max_tokens: request.maxTokens || 1,
                temperature: request.temperature || 0
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
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
    }

    /**
     * 验证配置 - 本地服务无需 API Key
     */
    validateConfig(): ValidationResult {
        const warnings: string[] = [];

        if (!this.config?.model) {
            warnings.push('未指定模型，将使用默认模型 llama3.1');
        }

        return {
            valid: true,
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
}
