import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { ProxyService } from '../network/proxy.service';
import { TranslateService } from '../../i18n';

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

    constructor(
        logger: LoggerService,
        translate: TranslateService,
        private proxyService: ProxyService
    ) {
        super(logger, translate);
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
            const baseURL = this.getBaseURL();
            const proxyConfig = this.proxyService.getAxiosProxyConfig(baseURL);

            this.client = axios.create({
                baseURL,
                timeout: this.getTimeout(),
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                ...proxyConfig
            });

            this.logger.info('OpenAI client initialized', {
                baseURL,
                model: this.config.model || 'gpt-4',
                proxyEnabled: !!(proxyConfig.httpAgent || proxyConfig.httpsAgent)
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
                    stream: request.stream || false,
                    ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
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
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber) => {
            if (!this.client) {
                const error = new Error('OpenAI client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const abortController = new AbortController();

            const runStream = async () => {
                try {
                    const response = await this.client!.post('/chat/completions', {
                        model: this.config?.model || 'gpt-4',
                        messages: this.transformMessages(request.messages),
                        max_tokens: request.maxTokens || 1000,
                        temperature: request.temperature || 0.7,
                        stream: true,
                        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                    }, {
                        responseType: 'stream'
                    });

                    const stream = response.data;
                    let currentToolCallId = '';
                    let currentToolCallName = '';
                    let currentToolInput = '';
                    let currentToolIndex = -1;
                    let fullContent = '';

                    for await (const chunk of stream) {
                        if (abortController.signal.aborted) break;

                        const lines = chunk.toString().split('\n').filter(Boolean);

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
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
                                        const textDelta = choice.delta.content;
                                        fullContent += textDelta;
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta
                                        });
                                    }
                                } catch (e) {
                                    // 忽略解析错误
                                }
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
                    const errorMessage = `OpenAI stream failed: ${error instanceof Error ? error.message : String(error)}`;
                    this.logger.error('Stream error', error);
                    subscriber.next({ type: 'error', error: errorMessage });
                    subscriber.error(new Error(errorMessage));
                }
            };

            runStream();

            return () => abortController.abort();
        });
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

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        const response = await this.client.post('/chat/completions', {
            model: this.config?.model || 'gpt-4',
            messages: this.transformMessages(request.messages),
            max_tokens: request.maxTokens || 1,
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response.data);
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

    /**
     * 转换消息格式 - OpenAI API 格式
     * 支持 tool 角色和 assistant 的 tool_calls
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            // 处理工具结果消息 - OpenAI 使用 role: 'tool' + tool_call_id
            if (msg.role === 'tool' || msg.toolResults) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    // 多个工具结果：每个单独一条消息
                    for (const tr of msg.toolResults) {
                        if (tr.tool_use_id) {
                            result.push({
                                role: 'tool',
                                tool_call_id: tr.tool_use_id,
                                content: String(tr.content || '')
                            });
                        }
                    }
                } else if (msg.tool_use_id) {
                    result.push({
                        role: 'tool',
                        tool_call_id: msg.tool_use_id,
                        content: String(msg.content || '')
                    });
                }
                continue;
            }

            // 处理 Assistant 消息 - 可能包含 tool_calls
            if (msg.role === 'assistant') {
                const assistantMsg: any = {
                    role: 'assistant',
                    content: msg.content || null
                };

                // 如果有工具调用，添加 tool_calls 数组
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    assistantMsg.tool_calls = msg.toolCalls.map((tc: any) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input || {})
                        }
                    }));
                }

                result.push(assistantMsg);
                continue;
            }

            // 其他消息保持原样
            result.push({
                role: msg.role,
                content: msg.content
            });
        }

        return result;
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
}