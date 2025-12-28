import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, HealthStatus, ValidationResult } from '../../types/provider.types';
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
                subscriber.error(new Error('Minimax client not initialized'));
                return;
            }

            this.logRequest(request);

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
                                subscriber.next({ type: 'tool_use_start' });
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
                    subscriber.complete();
                } catch (error) {
                    this.logError(error, { request });
                    subscriber.error(new Error(`Minimax stream failed: ${error instanceof Error ? error.message : String(error)}`));
                }
            };

            runStream();

            // 返回取消订阅的处理函数
            return () => {
                this.logger.debug('Stream subscription cancelled');
            };
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

    /**
     * 健康检查
     */
    async healthCheck(): Promise<HealthStatus> {
        try {
            if (!this.client) {
                return HealthStatus.UNHEALTHY;
            }

            // 简单的测试请求
            const _response = await this.client.messages.create({
                model: this.config?.model || 'MiniMax-M2',
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
            this.logger.error('Minimax health check failed', error);
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
     * 获取默认基础URL
     */
    protected getDefaultBaseURL(): string {
        // 支持中国和国际端点
        return 'https://api.minimaxi.com/anthropic';
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
        const filteredMessages = messages.filter(msg =>
            msg.role === 'user' || msg.role === 'assistant'
        );

        this.logger.info('Transforming messages', {
            originalCount: messages.length,
            filteredCount: filteredMessages.length,
            roles: messages.map(m => m.role)
        });

        return filteredMessages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: String(msg.content || '')
        }));
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

    /**
     * 获取默认系统提示
     */
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
