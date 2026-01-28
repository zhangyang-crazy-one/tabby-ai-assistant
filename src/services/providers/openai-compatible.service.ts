import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { ProxyService } from '../network/proxy.service';

/**
 * OpenAI兼容AI提供商
 * 支持LocalAI、Ollama、OpenRouter等OpenAI API兼容服务
 */
@Injectable()
export class OpenAiCompatibleProviderService extends BaseAiProvider {
    readonly name = 'openai-compatible';
    readonly displayName = 'OpenAI Compatible';
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
    private supportedModels: string[] = [
        'gpt-3.5-turbo',
        'gpt-4',
        'gpt-4-turbo',
        'llama2',
        'llama2:70b',
        'codellama',
        'mistral',
        'mistral:7b',
        'mixtral',
        'local-model'
    ];

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
        if (!this.config?.apiKey || !this.config?.baseURL) {
            this.logger.warn('OpenAI compatible provider configuration incomplete');
            return;
        }

        try {
            const proxyConfig = this.proxyService.getAxiosProxyConfig(this.config.baseURL);
            this.client = axios.create({
                baseURL: this.config.baseURL,
                timeout: this.getTimeout(),
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                ...proxyConfig
            });

            this.logger.info('OpenAI compatible client initialized', {
                baseURL: this.config.baseURL,
                model: this.config.model || 'gpt-3.5-turbo',
                proxyEnabled: !!(proxyConfig.httpAgent || proxyConfig.httpsAgent)
            });
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI compatible client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI compatible client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.post('/chat/completions', {
                    model: this.config?.model || 'gpt-3.5-turbo',
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
            throw new Error(`OpenAI compatible chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     * 当 disableStreaming 配置为 true 时，使用非流式请求模拟流式响应
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('OpenAI compatible client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const abortController = new AbortController();

            // 检查是否禁用流式响应
            const useStreaming = !this.config?.disableStreaming;

            const runStream = async () => {
                try {
                    // 如果禁用流式，使用非流式请求模拟流式响应
                    if (!useStreaming) {
                        this.logger.info('Streaming disabled, using non-streaming fallback');

                        const hasTools = request.tools && request.tools.length > 0;

                        // 转换工具格式为 OpenAI 标准格式
                        const openaiTools = hasTools && request.tools
                            ? request.tools.map((tool: any) => ({
                                type: 'function',
                                function: {
                                    name: tool.name,
                                    description: tool.description,
                                    parameters: tool.parameters
                                }
                            }))
                            : undefined;

                        let response;
                        let triedWithTools = false;

                        // 标记为已尝试（无论成功失败，必须在 try 块之前设置）
                        if (openaiTools) {
                            triedWithTools = true;
                        }

                        // 尝试发送请求（优先使用 tools 参数）
                        try {
                            if (openaiTools) {
                                // 🔴 调试日志：打印请求 payload
                                const transformedMsgs = this.transformMessages(request.messages);
                                this.logger.warn('DEBUG: Request with tools payload', {
                                    messageCount: request.messages.length,
                                    messageRoles: transformedMsgs.map((m: any) => m.role),
                                    hasContentArray: transformedMsgs.some((m: any) => Array.isArray(m.content)),
                                    firstFew: JSON.stringify(transformedMsgs.slice(0, 2))
                                });
                                
                                // 优先尝试带 tools 的请求
                                response = await this.client!.post('/chat/completions', {
                                    model: this.config?.model || 'gpt-3.5-turbo',
                                    messages: transformedMsgs,
                                    max_tokens: request.maxTokens || 1000,
                                    temperature: request.temperature || 0.7,
                                    stream: false,
                                    tools: openaiTools
                                });
                            } else {
                                // 无工具时直接发送
                                response = await this.client!.post('/chat/completions', {
                                    model: this.config?.model || 'gpt-3.5-turbo',
                                    messages: this.transformMessages(request.messages),
                                    max_tokens: request.maxTokens || 1000,
                                    temperature: request.temperature || 0.7,
                                    stream: false
                                });
                                
                                // 🔴 调试日志：打印转换后的消息
                                this.logger.warn('DEBUG: Non-streaming fallback request payload', {
                                    messageCount: request.messages.length,
                                    transformedMessages: JSON.stringify(this.transformMessages(request.messages).slice(0, 3)) // 只打印前3条
                                });
                            }
                        } catch (error: any) {
                            // 🔴 调试日志：打印错误详情
                            this.logger.error('DEBUG: Request failed with full details', {
                                status: error.response?.status,
                                statusText: error.response?.statusText,
                                data: JSON.stringify(error.response?.data),
                                message: error.message,
                                url: error.config?.url,
                                method: error.config?.method
                            });
                            
                            // 如果带 tools 失败，回退到不带 tools 的请求
                            if (triedWithTools && error.response?.status === 400) {
                                this.logger.warn('Request with tools failed (400), retrying without tools');
                                response = await this.client!.post('/chat/completions', {
                                    model: this.config?.model || 'gpt-3.5-turbo',
                                    messages: this.transformMessages(request.messages),
                                    max_tokens: request.maxTokens || 1000,
                                    temperature: request.temperature || 0.7,
                                    stream: false
                                });
                                
                                // 🔴 调试日志：打印回退请求的 payload
                                this.logger.warn('DEBUG: Fallback request (no tools) payload', {
                                    messageCount: request.messages.length,
                                    transformedMessages: JSON.stringify(this.transformMessages(request.messages).slice(0, 3))
                                });
                            } else {
                                // 其他错误直接抛出
                                throw error;
                            }
                        }

                        const message = response.data.choices?.[0]?.message;
                        const content = message?.content || '';
                        const toolCalls = message?.tool_calls || [];

                        // 优先处理结构化 tool_calls
                        if (toolCalls.length > 0) {
                            this.logger.debug('Non-streaming response contains tool_calls', { count: toolCalls.length });
                            for (const toolCall of toolCalls) {
                                const toolId = toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                const toolName = toolCall.function?.name || '';
                                const toolArgs = toolCall.function?.arguments || '';

                                // 解析 arguments 为 JSON 对象
                                let parsedInput = {};
                                try {
                                    parsedInput = JSON.parse(toolArgs);
                                } catch (e) {
                                    // 如果解析失败，使用原始字符串
                                }

                                // 发射 tool_use_start
                                subscriber.next({
                                    type: 'tool_use_start',
                                    toolCall: {
                                        id: toolId,
                                        name: toolName,
                                        input: {}
                                    }
                                });

                                // 发射 tool_use_end
                                subscriber.next({
                                    type: 'tool_use_end',
                                    toolCall: {
                                        id: toolId,
                                        name: toolName,
                                        input: parsedInput
                                    }
                                });
                            }
                        }
                        // 回退：尝试从文本内容中解析 XML 格式的工具调用
                        else if (this.containsToolCallXml(content)) {
                            this.logger.debug('Non-streaming response contains XML tool calls, parsing...');
                            const parsedTools = this.parseXmlToolCalls(content);

                            for (const tool of parsedTools) {
                                subscriber.next({
                                    type: 'tool_use_start',
                                    toolCall: {
                                        id: tool.id,
                                        name: tool.name,
                                        input: {}
                                    }
                                });

                                subscriber.next({
                                    type: 'tool_use_end',
                                    toolCall: {
                                        id: tool.id,
                                        name: tool.name,
                                        input: tool.input
                                    }
                                });
                            }
                        }

                        // 发射文本内容（如果解析了 XML，移除 XML 部分）
                        let finalContent = content;
                        if (toolCalls.length === 0 && this.containsToolCallXml(content)) {
                            finalContent = this.removeXmlToolCalls(content);
                        }

                        subscriber.next({
                            type: 'text_delta',
                            textDelta: finalContent
                        });

                        subscriber.next({
                            type: 'message_end',
                            message: {
                                id: this.generateId(),
                                role: MessageRole.ASSISTANT,
                                content: finalContent,
                                timestamp: new Date()
                            }
                        });
                        subscriber.complete();
                        return;
                    }

                    // 正常流式请求
                    let response;
                    let streamingWithTools = false;
                    const hasTools = request.tools && request.tools.length > 0;

                    // 转换工具格式为 OpenAI 标准格式
                    const openaiTools = hasTools && request.tools
                        ? request.tools.map((tool: any) => ({
                            type: 'function',
                            function: {
                                name: tool.name,
                                description: tool.description,
                                parameters: tool.parameters
                            }
                        }))
                        : undefined;

                    // 标记为已尝试（无论成功失败，必须在 try 块之前设置）
                    if (openaiTools) {
                        streamingWithTools = true;
                    }

                    try {
                        if (openaiTools) {
                            // 优先尝试带 tools 的流式请求
                            response = await this.client!.post('/chat/completions', {
                                model: this.config?.model || 'gpt-3.5-turbo',
                                messages: this.transformMessages(request.messages),
                                max_tokens: request.maxTokens || 1000,
                                temperature: request.temperature || 0.7,
                                stream: true,
                                tools: openaiTools
                            }, {
                                responseType: 'stream'
                            });
                        } else {
                            response = await this.client!.post('/chat/completions', {
                                model: this.config?.model || 'gpt-3.5-turbo',
                                messages: this.transformMessages(request.messages),
                                max_tokens: request.maxTokens || 1000,
                                temperature: request.temperature || 0.7,
                                stream: true
                            }, {
                                responseType: 'stream'
                            });
                        }
                    } catch (error: any) {
                        // 如果流式带 tools 失败，回退到非流式请求
                        if (streamingWithTools && error.response?.status === 400) {
                            this.logger.warn('Streaming with tools failed (400), falling back to non-streaming');
                            const nonStreamResponse = await this.client!.post('/chat/completions', {
                                model: this.config?.model || 'gpt-3.5-turbo',
                                messages: this.transformMessages(request.messages),
                                max_tokens: request.maxTokens || 1000,
                                temperature: request.temperature || 0.7,
                                stream: false
                            });

                            const message = nonStreamResponse.data.choices?.[0]?.message;
                            const content = message?.content || '';
                            const toolCalls = message?.tool_calls || [];

                            // 处理 tool_calls
                            if (toolCalls.length > 0) {
                                for (const toolCall of toolCalls) {
                                    const toolId = toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    const toolName = toolCall.function?.name || '';
                                    const toolArgs = toolCall.function?.arguments || '';
                                    let parsedInput = {};
                                    try {
                                        parsedInput = JSON.parse(toolArgs);
                                    } catch (e) {}

                                    subscriber.next({
                                        type: 'tool_use_start',
                                        toolCall: { id: toolId, name: toolName, input: {} }
                                    });
                                    subscriber.next({
                                        type: 'tool_use_end',
                                        toolCall: { id: toolId, name: toolName, input: parsedInput }
                                    });
                                }
                            } else if (this.containsToolCallXml(content)) {
                                const parsedTools = this.parseXmlToolCalls(content);
                                for (const tool of parsedTools) {
                                    subscriber.next({
                                        type: 'tool_use_start',
                                        toolCall: { id: tool.id, name: tool.name, input: {} }
                                    });
                                    subscriber.next({
                                        type: 'tool_use_end',
                                        toolCall: { id: tool.id, name: tool.name, input: tool.input }
                                    });
                                }
                            }

                            let finalContent = content;
                            if (toolCalls.length === 0 && this.containsToolCallXml(content)) {
                                finalContent = this.removeXmlToolCalls(content);
                            }

                            subscriber.next({ type: 'text_delta', textDelta: finalContent });
                            subscriber.next({
                                type: 'message_end',
                                message: {
                                    id: this.generateId(),
                                    role: MessageRole.ASSISTANT,
                                    content: finalContent,
                                    timestamp: new Date()
                                }
                            });
                            subscriber.complete();
                            return;
                        } else {
                            throw error;
                        }
                    }

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

                                            if (currentToolIndex !== index) {
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

                                                currentToolIndex = index;
                                                currentToolCallId = toolCall.id || `tool_${Date.now()}_${index}`;
                                                currentToolCallName = toolCall.function?.name || '';
                                                currentToolInput = toolCall.function?.arguments || '';

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
                    const errorMessage = `OpenAI compatible stream failed: ${error instanceof Error ? error.message : String(error)}`;
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
            throw new Error('OpenAI compatible client not initialized');
        }

        const response = await this.client.post('/chat/completions', {
            model: this.config?.model || 'gpt-3.5-turbo',
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
                errors: [...(result.errors || []), 'API key is required']
            };
        }

        if (!this.config?.baseURL) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Base URL is required']
            };
        }

        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${this.supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    protected transformMessages(messages: any[]): any[] {
        // 🔴 深度调试：打印完整消息历史结构
        this.logger.warn('DEBUG: Full message history structure', {
            totalMessages: messages.length,
            roles: messages.map((m: any) => m.role),
            hasToolResults: messages.some((m: any) => m.toolResults || m.metadata?.toolResults),
            messageDetails: messages.map((m: any) => ({
                role: m.role,
                hasContent: !!m.content,
                contentType: Array.isArray(m.content) ? 'array' : typeof m.content,
                hasToolResults: !!m.toolResults || !!m.metadata?.toolResults,
                hasToolCalls: !!m.tool_calls,
                toolCallIds: m.tool_calls?.map((tc: any) => tc.id)
            }))
        });

        return messages.map(msg => {
            // DeepSeek/OpenAI API 的消息格式要求：
            // 1. user/system/assistant: role + content (字符串)
            // 2. tool result: role + tool_call_id + content (字符串)

            // 如果消息包含 toolResults（来自 buildToolResultMessage），需要正确格式化
            const toolResults = msg.toolResults || msg.metadata?.toolResults;

            if (msg.role === 'tool' && toolResults && toolResults.length > 0) {
                // 🔴 关键检查：验证 tool_call_id 存在
                const toolUseId = toolResults[0]?.tool_use_id;
                this.logger.warn('DEBUG: Found tool result message', {
                    tool_use_id: toolUseId,
                    contentLength: (toolResults[0]?.content || '').length,
                    // 🔴 检查是否有对应的 tool_calls ID（用于调试）
                    expectedToolCallId: toolUseId
                });

                if (!toolUseId) {
                    this.logger.error('DEBUG ERROR: tool result missing tool_use_id!', {
                        msgId: msg.id,
                        toolResults: JSON.stringify(toolResults)
                    });
                }

                // Tool result 消息需要特殊格式：
                // DeepSeek 期望: { role: "tool", tool_call_id: "xxx", content: "xxx" }
                const firstResult = toolResults[0];
                return {
                    role: 'tool',
                    tool_call_id: firstResult.tool_use_id || firstResult.tool_use_id || '',
                    content: firstResult.content || ''
                };
            }

            if (msg.role === 'user' && toolResults && toolResults.length > 0) {
                const content = toolResults.map((tr: any) => ({
                    type: 'tool_result',
                    content: tr.content || '',
                    tool_use_id: tr.tool_use_id || ''
                }));
                return {
                    role: 'user',
                    content: content
                };
            }

            // 标准消息格式：role + content (字符串)
            // 🔴 关键：保留 tool_calls 字段供 DeepSeek API 验证
            const result: any = {
                role: msg.role,
                content: msg.content || ''
            };

            // 如果是 assistant 消息且包含 toolCalls（驼峰）或 tool_calls（下划线），转换为 OpenAI 格式
            if (msg.role === 'assistant') {
                const toolCalls = msg.toolCalls || msg.tool_calls;
                if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
                    // 转换为 OpenAI 格式的 tool_calls
                    result.tool_calls = toolCalls.map((tc: any) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.function?.name || tc.name || '',
                            arguments: tc.function?.arguments || tc.arguments || JSON.stringify(tc.input || {})
                        }
                    }));
                    this.logger.warn('DEBUG: Preserved tool_calls in assistant message', {
                        count: result.tool_calls.length,
                        ids: result.tool_calls.map((tc: any) => tc.id)
                    });
                }
            }

            return result;
        });
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

    /**
     * 检查文本是否包含 XML 工具调用格式
     */
    private containsToolCallXml(text: string): boolean {
        const xmlPatterns = [
            /<invoke\s/i,
            /<\/invoke>/i,
            /<function_calls>/i,
            /<\/function_calls>/i,
            /<tool_use>/i,
            /<\/tool_use>/i,
            /<parameter\s/i,
            /<\/parameter>/i
        ];
        return xmlPatterns.some(pattern => pattern.test(text));
    }

    /**
     * 从文本内容中解析 XML 格式的工具调用
     * 支持多种 XML 格式：
     * - <invoke name="tool_name"><parameter name="arg">value</parameter></invoke>
     * - <invoke name="tool_name">args</invoke>
     */
    private parseXmlToolCalls(content: string): Array<{ id: string; name: string; input: Record<string, any> }> {
        const tools: Array<{ id: string; name: string; input: Record<string, any> }> = [];

        // 匹配 <invoke name="tool_name">...</invoke> 格式
        const invokePattern = /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/gi;
        let match;

        while ((match = invokePattern.exec(content)) !== null) {
            const name = match[1];
            const argsContent = match[2];

            let input: Record<string, any> = {};

            // 尝试解析内部的 <parameter> 标签
            const paramPattern = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/gi;
            let paramMatch;

            while ((paramMatch = paramPattern.exec(argsContent)) !== null) {
                const paramName = paramMatch[1];
                const paramValue = paramMatch[2].trim();

                // 尝试解析 JSON
                try {
                    input[paramName] = JSON.parse(paramValue);
                } catch {
                    // 如果不是 JSON，尝试布尔值/数字
                    if (paramValue === 'true') {
                        input[paramName] = true;
                    } else if (paramValue === 'false') {
                        input[paramName] = false;
                    } else if (!isNaN(paramValue as any)) {
                        input[paramName] = parseFloat(paramValue);
                    } else {
                        input[paramName] = paramValue;
                    }
                }
            }

            // 如果没有 parameter 标签，尝试直接解析整个内容
            if (Object.keys(input).length === 0 && argsContent.trim()) {
                const trimmedArgs = argsContent.trim();
                try {
                    input = JSON.parse(trimmedArgs);
                } catch {
                    // 如果不是 JSON，整个内容作为 input
                    input = { input: trimmedArgs };
                }
            }

            tools.push({
                id: `xml_tool_${Date.now()}_${tools.length}`,
                name,
                input
            });
        }

        // 如果没有找到 <invoke> 格式，尝试 <function_calls> 格式
        if (tools.length === 0) {
            const functionCallsPattern = /<function_calls>([\s\S]*?)<\/function_calls>/gi;
            let fcMatch;

            while ((fcMatch = functionCallsPattern.exec(content)) !== null) {
                const fcContent = fcMatch[1];

                // 匹配单个 function 调用
                const functionPattern = /<function>\s*<name>([^<]+)<\/name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/function>/gi;
                let fnMatch;

                while ((fnMatch = functionPattern.exec(fcContent)) !== null) {
                    const name = fnMatch[1].trim();
                    const argsContent = fnMatch[2];

                    let input: Record<string, any> = {};
                    try {
                        input = JSON.parse(argsContent.trim());
                    } catch {
                        input = { raw: argsContent.trim() };
                    }

                    tools.push({
                        id: `fc_tool_${Date.now()}_${tools.length}`,
                        name,
                        input
                    });
                }
            }
        }

        return tools;
    }

    /**
     * 从文本内容中移除 XML 工具调用部分
     */
    private removeXmlToolCalls(content: string): string {
        let result = content;

        // 移除 <invoke>...</invoke>
        result = result.replace(/<invoke\s+name="[^"]*"[^>]*>[\s\S]*?<\/invoke>/gi, '');

        // 移除 <function_calls>...</function_calls>
        result = result.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');

        // 移除 <function>...</function>
        result = result.replace(/<function>\s*<name>[^<]+<\/name>\s*<arguments>[^<]*<\/arguments>\s*<\/function>/gi, '');

        // 清理多余空行
        result = result.replace(/\n{3,}/g, '\n\n').trim();

        return result;
    }
}