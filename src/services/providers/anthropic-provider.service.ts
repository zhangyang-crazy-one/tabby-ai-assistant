import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { ProxyService } from '../network/proxy.service';

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

    constructor(
        logger: LoggerService,
        private proxyService: ProxyService
    ) {
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
            const baseURL = this.getBaseURL();
            const httpAgent = this.proxyService.getFetchProxyAgent(baseURL);

            this.client = new Anthropic({
                apiKey: this.config.apiKey,
                baseURL,
                ...(httpAgent && { httpAgent })
            });

            this.logger.info('Anthropic client initialized', {
                baseURL,
                model: this.config.model || 'claude-3-sonnet',
                proxyEnabled: !!httpAgent
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
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('Anthropic client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            let currentToolId = '';
            let currentToolName = '';
            let currentToolInput = '';
            let fullContent = '';

            const abortController = new AbortController();

            const runStream = async () => {
                try {
                    const stream = await this.client!.messages.stream({
                        model: this.config?.model || 'claude-3-sonnet',
                        max_tokens: request.maxTokens || 1000,
                        system: request.systemPrompt || this.getDefaultSystemPrompt(),
                        messages: this.transformMessages(request.messages),
                        temperature: request.temperature || 1.0,
                    });

                    for await (const event of stream) {
                        if (abortController.signal.aborted) break;

                        const eventAny = event as any;
                        this.logger.debug('Stream event', { type: event.type });

                        // 处理文本增量
                        if (event.type === 'content_block_delta' && eventAny.delta?.type === 'text_delta') {
                            const textDelta = eventAny.delta.text;
                            fullContent += textDelta;
                            subscriber.next({
                                type: 'text_delta',
                                textDelta
                            });
                        }
                        // 处理工具调用开始
                        else if (event.type === 'content_block_start' && eventAny.content_block?.type === 'tool_use') {
                            currentToolId = eventAny.content_block.id || `tool_${Date.now()}`;
                            currentToolName = eventAny.content_block.name;
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
                        // 处理工具调用参数
                        else if (event.type === 'content_block_delta' && eventAny.delta?.type === 'input_json_delta') {
                            currentToolInput += eventAny.delta.partial_json || '';
                        }
                        // 处理工具调用结束
                        else if (event.type === 'content_block_stop') {
                            if (currentToolId && currentToolName) {
                                let parsedInput = {};
                                try {
                                    parsedInput = JSON.parse(currentToolInput || '{}');
                                } catch (e) {
                                    // 使用原始输入
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
                                currentToolId = '';
                                currentToolName = '';
                                currentToolInput = '';
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
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();

                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `Anthropic stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logger.error('Stream error', error);
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
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
            throw new Error('Anthropic client not initialized');
        }

        const response = await this.client.messages.create({
            model: this.config?.model || 'claude-3-sonnet',
            max_tokens: request.maxTokens || 1,
            messages: this.transformMessages(request.messages),
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response);
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

    /**
     * 转换消息格式 - Anthropic API 消息格式
     * 支持 tool_use 和 tool_result
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') continue;

            // 处理工具结果消息
            if (msg.role === 'tool' || msg.toolResults || msg.tool_use_id) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    const toolResultBlocks = msg.toolResults
                        .filter((tr: any) => tr.tool_use_id)
                        .map((tr: any) => ({
                            type: 'tool_result',
                            tool_use_id: tr.tool_use_id,
                            content: String(tr.content || '')
                        }));

                    if (toolResultBlocks.length > 0) {
                        result.push({ role: 'user', content: toolResultBlocks });
                    }
                } else if (msg.tool_use_id) {
                    result.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: msg.tool_use_id,
                            content: String(msg.content || '')
                        }]
                    });
                }
                continue;
            }

            // 处理 Assistant 消息
            if (msg.role === 'assistant') {
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    const contentBlocks: any[] = [];
                    if (msg.content) {
                        contentBlocks.push({ type: 'text', text: String(msg.content) });
                    }
                    for (const tc of msg.toolCalls) {
                        contentBlocks.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.name,
                            input: tc.input || {}
                        });
                    }
                    result.push({ role: 'assistant', content: contentBlocks });
                } else {
                    result.push({
                        role: 'assistant',
                        content: [{ type: 'text', text: String(msg.content || '') }]
                    });
                }
                continue;
            }

            // 用户消息
            result.push({
                role: 'user',
                content: [{ type: 'text', text: String(msg.content || '') }]
            });
        }

        return result;
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
}
