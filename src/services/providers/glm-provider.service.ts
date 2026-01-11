import { Injectable } from '@angular/core';
import { Observable, Observer, from } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
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
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('GLM client not initialized');
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
                    const response = await this.client!.post('/v1/messages', {
                        model: this.config?.model || 'glm-4.6',
                        max_tokens: request.maxTokens || 1000,
                        system: request.systemPrompt || this.getDefaultSystemPrompt(),
                        messages: this.transformMessages(request.messages),
                        temperature: request.temperature || 0.95,
                        stream: true
                    }, {
                        responseType: 'stream'
                    });

                    const stream = response.data;
                    let buffer = '';

                    for await (const chunk of stream) {
                        if (abortController.signal.aborted) break;

                        // 兼容多种 chunk 类型：string, Buffer, ArrayBuffer, Uint8Array
                        // 在 Electron/Node.js 环境中，Axios 流可能返回 Buffer 而非 ArrayBuffer
                        let chunkStr: string;
                        if (typeof chunk === 'string') {
                            chunkStr = chunk;
                        } else if (chunk instanceof Buffer) {
                            chunkStr = chunk.toString('utf-8');
                        } else if (chunk instanceof Uint8Array || chunk instanceof ArrayBuffer) {
                            chunkStr = new TextDecoder().decode(chunk);
                        } else {
                            // 兜底处理：尝试转换为字符串
                            chunkStr = String(chunk);
                        }
                        
                        buffer += chunkStr;
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                const data = line.slice(5).trim();
                                if (data === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(data);
                                    const eventType = parsed.type;
                                    const eventData = parsed;

                                    this.logger.debug('Stream event', { type: eventType });

                                    // 处理文本增量
                                    if (eventType === 'content_block_delta' && eventData.delta?.type === 'text_delta') {
                                        const textDelta = eventData.delta.text;
                                        fullContent += textDelta;
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta
                                        });
                                    }
                                    // 处理工具调用开始
                                    else if (eventType === 'content_block_start' && eventData.content_block?.type === 'tool_use') {
                                        currentToolId = eventData.content_block.id || `tool_${Date.now()}`;
                                        currentToolName = eventData.content_block.name;
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
                                    else if (eventType === 'content_block_delta' && eventData.delta?.type === 'input_json_delta') {
                                        currentToolInput += eventData.delta.partial_json || '';
                                    }
                                    // 处理工具调用结束
                                    else if (eventType === 'content_block_stop') {
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
                                } catch (e) {
                                    // 忽略解析错误
                                }
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
                        const errorMessage = `GLM stream failed: ${error instanceof Error ? error.message : String(error)}`;
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
            throw new Error('GLM client not initialized');
        }

        const response = await this.client.post('/v1/messages', {
            model: this.config?.model || 'glm-4.6',
            max_tokens: request.maxTokens || 1,
            messages: this.transformMessages(request.messages),
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response.data);
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
     * 转换消息格式（Anthropic兼容）
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
}
