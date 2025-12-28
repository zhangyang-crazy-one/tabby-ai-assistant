import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Minimax AI提供商
 * 基于Anthropic Claude API，完全兼容Anthropic格式
 */
@Injectable()
export class MinimaxProviderService extends BaseAiProvider {
    readonly name = 'minimax';
    readonly displayName = 'Minimax (MiniMax-M2)';
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

    /**
     * 配置提供商
     */
    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    /**
     * 初始化Anthropic客户端
     */
    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('Minimax API key not provided');
            return;
        }

        try {
            this.client = new Anthropic({
                apiKey: this.config.apiKey,
                baseURL: this.getBaseURL()
            });

            this.logger.info('Minimax client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'MiniMax-M2'
            });
        } catch (error) {
            this.logger.error('Failed to initialize Minimax client', error);
            throw error;
        }
    }

    /**
     * 聊天功能
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('Minimax client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                // 构建请求参数
                const createParams: any = {
                    model: this.config?.model || 'MiniMax-M2',
                    max_tokens: request.maxTokens || 1000,
                    system: request.systemPrompt || this.getDefaultSystemPrompt(),
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 1.0,
                    stream: request.stream || false
                };

                // 如果有工具定义，添加到请求中
                if (request.tools && request.tools.length > 0) {
                    createParams.tools = request.tools;
                    this.logger.info('Adding tools to request', { toolCount: request.tools.length });
                }

                const result = await this.client!.messages.create(createParams);

                this.logResponse(result);
                return result;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Minimax chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('Minimax client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            this.logRequest(request);

            const abortController = new AbortController();

            const runStream = async () => {
                try {
                    // 注意：SDK 类型定义可能不包含 tools，但 API 实际支持
                    // 使用 as any 绕过类型检查
                    const stream = (this.client!.messages.stream as any)({
                        model: this.config?.model || 'MiniMax-M2',
                        max_tokens: request.maxTokens || 1000,
                        system: request.systemPrompt || this.getDefaultSystemPrompt(),
                        messages: this.transformMessages(request.messages),
                        temperature: request.temperature || 1.0,
                        tools: request.tools  // 流式 API 支持工具调用
                    });

                    // 累积工具调用数据
                    let currentToolId = '';
                    let currentToolName = '';
                    let currentToolInput = '';

                    for await (const event of stream) {
                        if (abortController.signal.aborted) break;

                        this.logger.debug('Stream event', { type: event.type });

                        if (event.type === 'content_block_delta') {
                            const delta = event.delta as any;
                            // 文本增量
                            if (delta.type === 'text_delta') {
                                subscriber.next({
                                    type: 'text_delta',
                                    textDelta: delta.text
                                });
                            }
                            // 工具输入增量
                            else if (delta.type === 'input_json_delta') {
                                currentToolInput += delta.partial_json || '';
                            }
                        }
                        // 工具调用开始
                        else if (event.type === 'content_block_start') {
                            const block = event.content_block as any;
                            if (block.type === 'tool_use') {
                                currentToolId = block.id;
                                currentToolName = block.name;
                                currentToolInput = '';
                                subscriber.next({
                                    type: 'tool_use_start',
                                    toolCall: {
                                        id: currentToolId,
                                        name: currentToolName,
                                        input: {}
                                    }
                                });
                                this.logger.debug('Stream event', { type: 'tool_use_start', name: currentToolName });
                            }
                        }
                        // 内容块结束
                        else if (event.type === 'content_block_stop') {
                            // 如果有工具调用，发送完整的工具调用
                            if (currentToolId && currentToolName) {
                                let parsedInput = {};
                                try {
                                    parsedInput = JSON.parse(currentToolInput || '{}');
                                } catch (e) {
                                    this.logger.warn('Failed to parse tool input', { input: currentToolInput });
                                }
                                subscriber.next({
                                    type: 'tool_use_end',
                                    toolCall: {
                                        id: currentToolId,
                                        name: currentToolName,
                                        input: parsedInput
                                    }
                                });
                                this.logger.debug('Stream event', { type: 'tool_use_end', name: currentToolName });
                                // 重置
                                currentToolId = '';
                                currentToolName = '';
                                currentToolInput = '';
                            }
                        }
                    }

                    // 获取最终消息
                    const finalMessage = await stream.finalMessage();
                    subscriber.next({
                        type: 'message_end',
                        message: this.transformChatResponse(finalMessage).message
                    });
                    this.logger.debug('Stream event', { type: 'message_end' });
                    subscriber.complete();
                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `Minimax stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logError(error, { request });
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
                }
            };

            runStream();

            // 返回取消订阅的处理函数
            return () => abortController.abort();
        });
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

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('Minimax client not initialized');
        }

        const response = await this.client.messages.create({
            model: this.config?.model || 'MiniMax-M2',
            max_tokens: request.maxTokens || 1,
            messages: this.transformMessages(request.messages),
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response);
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Minimax API key is required']
            };
        }

        // 验证API key格式（Minimax API key通常以sk-开头）
        if (this.config.apiKey && !this.config.apiKey.startsWith('sk-')) {
            result.warnings = [...(result.warnings || []), 'API key format might be invalid (should start with sk-)'];
        }

        return result;
    }

    /**
     * 转换消息格式
     * Anthropic API 支持两种格式：
     * 1. 简单字符串: { role: 'user', content: 'Hello' }
     * 2. 内容块数组: { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
     * 使用简单字符串格式以确保兼容性
     */
    protected transformMessages(messages: any[]): any[] {
        // 过滤掉系统消息（system role 不应该在 messages 数组中）
        // 保留 user, assistant, tool 角色的消息
        const filteredMessages = messages.filter(msg =>
            msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool'
        );

        this.logger.info('Transforming messages', {
            originalCount: messages.length,
            filteredCount: filteredMessages.length,
            roles: messages.map(m => m.role)
        });

        return filteredMessages.map(msg => {
            // tool 角色消息转换为 user 角色（Anthropic API 不直接支持 tool 角色）
            // 但内容保留工具结果标识，让 AI 理解这是工具执行结果
            if (msg.role === 'tool') {
                return {
                    role: 'user',
                    content: String(msg.content || '')
                };
            }
            return {
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: String(msg.content || '')
            };
        });
    }

    /**
     * 转换聊天响应
     */
    private transformChatResponse(response: any): ChatResponse {
        this.logger.info('Transforming chat response', {
            hasContent: !!response?.content,
            contentLength: response?.content?.length,
            responseKeys: Object.keys(response || {})
        });

        let text = '';
        let toolCalls: any[] = [];

        // 尝试多种方式提取响应文本和工具调用
        if (response?.content) {
            if (Array.isArray(response.content)) {
                // Anthropic 格式: content 是数组
                for (const block of response.content) {
                    if (block.type === 'text') {
                        text += block.text || '';
                    } else if (block.type === 'tool_use') {
                        // 提取工具调用
                        toolCalls.push({
                            id: block.id,
                            name: block.name,
                            input: block.input
                        });
                    }
                }
            } else if (typeof response.content === 'string') {
                // 直接是字符串
                text = response.content;
            }
        } else if (response?.message?.content) {
            // 某些 API 可能使用 message.content
            text = response.message.content;
        } else if (response?.choices?.[0]?.message?.content) {
            // OpenAI 兼容格式
            text = response.choices[0].message.content;
        }

        this.logger.info('Extracted response', {
            textLength: text.length,
            textPreview: text.substring(0, 100),
            toolCallCount: toolCalls.length
        });

        if (!text && toolCalls.length === 0) {
            this.logger.warn('Empty response text and no tool calls, full response:', response);
        }

        const result: any = {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: text,
                timestamp: new Date()
            },
            usage: response?.usage ? {
                promptTokens: response.usage.input_tokens || 0,
                completionTokens: response.usage.output_tokens || 0,
                totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
            } : undefined
        };

        // 如果有工具调用，添加到响应中
        if (toolCalls.length > 0) {
            result.toolCalls = toolCalls;
            this.logger.info('Tool calls extracted', { toolCalls });
        }

        return result;
    }
}
