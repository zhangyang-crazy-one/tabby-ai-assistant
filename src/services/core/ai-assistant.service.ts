import { Injectable, Inject, Optional } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { ChatMessage, MessageRole, ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, StreamEvent } from '../../types/ai.types';
import { AiProviderManagerService } from './ai-provider-manager.service';
import { ConfigProviderService } from './config-provider.service';
import { TerminalContextService } from '../terminal/terminal-context.service';
import { TerminalToolsService, ToolCall, ToolResult } from '../terminal/terminal-tools.service';
import { LoggerService } from './logger.service';
import { BaseAiProvider } from '../../types/provider.types';

// Import all provider services
import { OpenAiProviderService } from '../providers/openai-provider.service';
import { AnthropicProviderService } from '../providers/anthropic-provider.service';
import { MinimaxProviderService } from '../providers/minimax-provider.service';
import { GlmProviderService } from '../providers/glm-provider.service';
import { OpenAiCompatibleProviderService } from '../providers/openai-compatible.service';
import { OllamaProviderService } from '../providers/ollama-provider.service';
import { VllmProviderService } from '../providers/vllm-provider.service';

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
    // 提供商映射表
    private providerMapping: { [key: string]: BaseAiProvider } = {};

    constructor(
        private providerManager: AiProviderManagerService,
        private config: ConfigProviderService,
        private terminalContext: TerminalContextService,
        private terminalTools: TerminalToolsService,
        private logger: LoggerService,
        // 注入所有提供商服务
        @Optional() private openaiProvider: OpenAiProviderService,
        @Optional() private anthropicProvider: AnthropicProviderService,
        @Optional() private minimaxProvider: MinimaxProviderService,
        @Optional() private glmProvider: GlmProviderService,
        @Optional() private openaiCompatibleProvider: OpenAiCompatibleProviderService,
        @Optional() private ollamaProvider: OllamaProviderService,
        @Optional() private vllmProvider: VllmProviderService
    ) {
        // 构建提供商映射表
        this.buildProviderMapping();
    }

    /**
     * 构建提供商映射表
     */
    private buildProviderMapping(): void {
        if (this.openaiProvider) {
            this.providerMapping['openai'] = this.openaiProvider;
        }
        if (this.anthropicProvider) {
            this.providerMapping['anthropic'] = this.anthropicProvider;
        }
        if (this.minimaxProvider) {
            this.providerMapping['minimax'] = this.minimaxProvider;
        }
        if (this.glmProvider) {
            this.providerMapping['glm'] = this.glmProvider;
        }
        if (this.openaiCompatibleProvider) {
            this.providerMapping['openai-compatible'] = this.openaiCompatibleProvider;
        }
        if (this.ollamaProvider) {
            this.providerMapping['ollama'] = this.ollamaProvider;
        }
        if (this.vllmProvider) {
            this.providerMapping['vllm'] = this.vllmProvider;
        }
    }

    /**
     * 初始化AI助手
     */
    initialize(): void {
        this.logger.info('Initializing AI Assistant...');

        // 检查是否启用
        if (!this.config.isEnabled()) {
            this.logger.info('AI Assistant is disabled in configuration');
            return;
        }

        // 注册并配置所有提供商
        this.registerAllProviders();

        // 设置默认提供商
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider && this.providerManager.hasProvider(defaultProvider)) {
            this.providerManager.setActiveProvider(defaultProvider);
            this.logger.info(`Active provider set to: ${defaultProvider}`);
        } else {
            // 尝试设置第一个已配置的提供商
            const allConfigs = this.config.getAllProviderConfigs();
            for (const [name, providerConfig] of Object.entries(allConfigs)) {
                if (providerConfig?.apiKey && this.providerManager.hasProvider(name)) {
                    this.providerManager.setActiveProvider(name);
                    this.config.setDefaultProvider(name);
                    this.logger.info(`Auto-selected provider: ${name}`);
                    break;
                }
            }
        }

        this.logger.info('AI Assistant initialized successfully');
    }

    /**
     * 注册并配置所有提供商
     */
    private registerAllProviders(): void {
        this.logger.info('Registering AI providers...');

        const allConfigs = this.config.getAllProviderConfigs();
        let registeredCount = 0;

        for (const [name, providerConfig] of Object.entries(allConfigs)) {
            const provider = this.providerMapping[name];
            if (provider) {
                try {
                    // 配置提供商（这会初始化客户端）
                    if (providerConfig) {
                        provider.configure({
                            ...providerConfig,
                            enabled: providerConfig.enabled !== false
                        });
                        this.logger.info(`Provider ${name} configured`, {
                            hasApiKey: !!providerConfig.apiKey,
                            model: providerConfig.model
                        });
                    }

                    // 注册到管理器
                    this.providerManager.registerProvider(provider);
                    registeredCount++;
                    this.logger.info(`Provider registered: ${name}`);
                } catch (error) {
                    this.logger.error(`Failed to register provider: ${name}`, error);
                }
            } else {
                this.logger.warn(`Provider not found in mapping: ${name}`);
            }
        }

        this.logger.info(`Total providers registered: ${registeredCount}`);
    }

    /**
     * 聊天功能
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing chat request', { provider: activeProvider.name });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('chat' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support chat capability`);
            }

            // 如果启用工具调用，添加工具定义
            if (request.enableTools !== false) {
                request.tools = this.terminalTools.getToolDefinitions();
            }

            let response = await activeProvider.chat(request);

            // 处理工具调用（如果响应包含工具调用）
            response = await this.handleToolCalls(request, response, activeProvider);

            // 检测幻觉：AI声称执行了操作但未调用工具
            const toolCalls = (response as any).toolCalls;
            const hallucinationDetected = this.detectHallucination({
                text: response.message.content,
                toolCallCount: toolCalls?.length || 0
            });

            if (hallucinationDetected) {
                // 附加警告消息，提醒用户
                response.message.content += '\n\n⚠️ **检测到可能的幻觉**：AI声称执行了操作但未实际调用工具。\n实际执行的命令可能为空。请重新描述您的需求。';
            }

            this.logger.info('Chat request completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Chat request failed', error);
            throw error;
        }
    }

    /**
     * 流式聊天功能
     */
    chatStream(request: ChatRequest): Observable<any> {
        const activeProvider = this.providerManager.getActiveProvider() as any;
        if (!activeProvider) {
            return throwError(() => new Error('No active AI provider available'));
        }

        // 检查提供商是否支持流式
        if (!activeProvider.supportsCapability('streaming' as any)) {
            this.logger.warn(`Provider ${activeProvider.name} does not support streaming, falling back to non-streaming`);
            return from(this.chat(request));
        }

        // 添加工具定义
        if (request.enableTools !== false) {
            request.tools = this.terminalTools.getToolDefinitions();
        }

        // 调用流式方法
        return activeProvider.chatStream(request).pipe(
            tap((event: StreamEvent) => {
                // 工具调用完成时执行
                if (event.type === 'tool_use_end' && event.toolCall) {
                    this.executeToolAndContinue(event.toolCall, request, activeProvider);
                }
            }),
            catchError(error => {
                this.logger.error('Stream error', error);
                return throwError(() => error);
            })
        );
    }

    /**
     * 执行工具调用（不阻塞流）
     */
    private async executeToolAndContinue(
        toolCall: { id: string; name: string; input: any },
        request: ChatRequest,
        provider: any
    ): Promise<void> {
        try {
            const result = await this.terminalTools.executeToolCall({
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input
            });
            this.logger.info('Tool executed in stream', { name: toolCall.name, result: result.content.substring(0, 100) });
        } catch (error) {
            this.logger.error('Tool execution failed in stream', error);
        }
    }

    /**
     * 处理工具调用
     * @param maxDepth 最大递归深度，避免无限循环
     */
    private async handleToolCalls(
        originalRequest: ChatRequest,
        response: ChatResponse,
        provider: BaseAiProvider,
        depth: number = 0,
        maxDepth: number = 10
    ): Promise<ChatResponse> {
        // 检查响应中是否有工具调用
        const toolCalls = (response as any).toolCalls as ToolCall[] | undefined;

        if (!toolCalls || toolCalls.length === 0) {
            return response;
        }

        // 检查递归深度
        if (depth >= maxDepth) {
            this.logger.warn('Max tool call depth reached', { depth, maxDepth });
            return response;
        }

        this.logger.info('Tool calls detected', { count: toolCalls.length, depth });

        // 执行所有工具调用
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
            this.logger.info('Executing tool in handleToolCalls', { name: toolCall.name, depth });
            const result = await this.terminalTools.executeToolCall(toolCall);
            toolResults.push(result);
        }

        // 构建包含工具结果的新请求
        const toolResultsMessage: ChatMessage = {
            id: `tool_result_${Date.now()}`,
            role: MessageRole.USER,
            content: toolResults.map(r =>
                `工具 ${r.tool_use_id} 结果:\n${r.content}`
            ).join('\n\n'),
            timestamp: new Date(),
            metadata: { toolResults }
        };

        // 继续对话 - 仍然允许工具调用但递归处理
        const followUpRequest: ChatRequest = {
            ...originalRequest,
            messages: [
                ...originalRequest.messages,
                response.message,
                toolResultsMessage
            ],
            tools: this.terminalTools.getToolDefinitions()
        };

        // 发送后续请求
        const followUpResponse = await provider.chat(followUpRequest);

        // ===== 关键修复：如果 AI 回复太短，直接附加工具结果 =====
        const minResponseLength = 50; // 如果回复少于50字符，认为AI没有正确展示结果
        const toolResultsText = toolResults.map(r => r.content).join('\n\n');

        if (followUpResponse.message.content.length < minResponseLength && toolResultsText.length > 0) {
            this.logger.info('AI response too short, appending tool results directly', {
                responseLength: followUpResponse.message.content.length,
                toolResultsLength: toolResultsText.length
            });

            // 查找包含终端输出的工具结果
            const terminalOutput = toolResults.find(r =>
                r.content.includes('=== 终端输出 ===') ||
                r.content.includes('✅ 命令已执行')
            );

            if (terminalOutput) {
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + terminalOutput.content;
            } else {
                // 附加所有工具结果
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + toolResultsText;
            }
        }

        // 递归处理后续响应中的工具调用
        return this.handleToolCalls(followUpRequest, followUpResponse, provider, depth + 1, maxDepth);
    }

    /**
     * 生成命令
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing command generation request', { provider: activeProvider.name });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('command_generation' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support command generation capability`);
            }

            const response = await activeProvider.generateCommand(request);
            this.logger.info('Command generation completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Command generation failed', error);
            throw error;
        }
    }

    /**
     * 解释命令
     */
    async explainCommand(request: ExplainRequest): Promise<ExplainResponse> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing command explanation request', { provider: activeProvider.name });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('command_explanation' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support command explanation capability`);
            }

            const response = await activeProvider.explainCommand(request);
            this.logger.info('Command explanation completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Command explanation failed', error);
            throw error;
        }
    }

    /**
     * 分析结果
     */
    async analyzeResult(request: any): Promise<any> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing result analysis request', { provider: activeProvider.name });

        try {
            const response = await activeProvider.analyzeResult(request);
            this.logger.info('Result analysis completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Result analysis failed', error);
            throw error;
        }
    }

    /**
     * 从选择生成命令
     */
    async generateCommandFromSelection(): Promise<CommandResponse | null> {
        try {
            // TODO: 从当前终端获取选中文本
            const selection = '';
            const context = this.terminalContext.getCurrentContext();

            const request: CommandRequest = {
                naturalLanguage: selection || '帮我执行上一个命令',
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform,
                    shell: context?.session.shell,
                    environment: context?.session.environment
                }
            };

            return this.generateCommand(request);
        } catch (error) {
            this.logger.error('Failed to generate command from selection', error);
            return null;
        }
    }

    /**
     * 解释当前选择
     */
    async explainCommandFromSelection(): Promise<ExplainResponse | null> {
        try {
            // TODO: 从当前终端获取选中文本
            const selection = '';
            if (!selection) {
                return null;
            }

            const context = this.terminalContext.getCurrentContext();
            const request: ExplainRequest = {
                command: selection,
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform
                }
            };

            return this.explainCommand(request);
        } catch (error) {
            this.logger.error('Failed to explain command from selection', error);
            return null;
        }
    }

    /**
     * 打开聊天界面
     */
    openChatInterface(): void {
        this.logger.info('Opening chat interface');
        // TODO: 实现打开聊天界面的逻辑
        // 可以使用Tabby的窗口API或者Angular路由
    }

    /**
     * 获取提供商状态
     */
    getProviderStatus(): any {
        const activeProvider = this.providerManager.getActiveProvider();
        const allProviders = this.providerManager.getAllProviderInfo();

        return {
            active: activeProvider?.getInfo(),
            all: allProviders,
            count: allProviders.length
        };
    }

    /**
     * 切换提供商
     */
    switchProvider(providerName: string): boolean {
        const success = this.providerManager.setActiveProvider(providerName);
        if (success) {
            this.config.setDefaultProvider(providerName);
            this.logger.info('Provider switched successfully', { provider: providerName });
        } else {
            this.logger.error('Failed to switch provider', { provider: providerName });
        }
        return success;
    }

    /**
     * 获取下一个提供商
     */
    switchToNextProvider(): boolean {
        return this.providerManager.switchToNextProvider();
    }

    /**
     * 获取上一个提供商
     */
    switchToPreviousProvider(): boolean {
        return this.providerManager.switchToPreviousProvider();
    }

    /**
     * 健康检查
     */
    async healthCheck(): Promise<{ provider: string; status: string; latency?: number }[]> {
        this.logger.info('Performing health check on all providers');
        return this.providerManager.checkAllProvidersHealth();
    }

    /**
     * 验证配置
     */
    async validateConfig(): Promise<{ name: string; valid: boolean; errors: string[] }[]> {
        this.logger.info('Validating all provider configurations');
        return this.providerManager.validateAllProviders();
    }

    /**
     * 获取当前上下文感知提示
     */
    getContextAwarePrompt(basePrompt: string): string {
        const context = this.terminalContext.getCurrentContext();
        const error = this.terminalContext.getLastError();

        let enhancedPrompt = basePrompt;

        if (context) {
            enhancedPrompt += `\n\n当前环境：\n`;
            enhancedPrompt += `- 目录：${context.session.cwd}\n`;
            enhancedPrompt += `- Shell：${context.session.shell}\n`;
            enhancedPrompt += `- 系统：${context.systemInfo.platform}\n`;

            if (context.recentCommands.length > 0) {
                enhancedPrompt += `- 最近命令：${context.recentCommands.slice(0, 3).join(' → ')}\n`;
            }

            if (error) {
                enhancedPrompt += `\n当前错误：\n`;
                enhancedPrompt += `- 错误：${error.message}\n`;
                enhancedPrompt += `- 命令：${error.command}\n`;
            }
        }

        return enhancedPrompt;
    }

    /**
     * 获取建议命令
     */
    async getSuggestedCommands(_input: string): Promise<string[]> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            return [];
        }

        try {
            // TODO: 实现智能建议逻辑
            // 可以基于历史命令、当前上下文等生成建议
            return [];
        } catch (error) {
            this.logger.error('Failed to get suggested commands', error);
            return [];
        }
    }

    /**
     * 分析终端错误并提供修复建议
     */
    async getErrorFix(error: any): Promise<CommandResponse | null> {
        try {
            const context = this.terminalContext.getCurrentContext();

            const request: CommandRequest = {
                naturalLanguage: `修复这个错误：${error.message}`,
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform,
                    shell: context?.session.shell,
                    environment: context?.session.environment
                }
            };

            return this.generateCommand(request);
        } catch (err) {
            this.logger.error('Failed to get error fix', err);
            return null;
        }
    }

    /**
     * 检测AI幻觉
     * 当AI声称执行了操作（如切换终端、执行命令）但未调用相应工具时触发
     */
    private detectHallucination(response: { text: string; toolCallCount: number }): boolean {
        const actionKeywords = [
            '已切换', '已执行', '已完成', '已写入', '已读取',
            '切换成功', '执行成功', '写入成功', '读取成功',
            '现在切换', '现在执行', '已经为您切换', '已经为您执行',
            '我将切换', '我会切换', '已经切换到', '已经执行了',
            '终端已切换', '命令已执行', '操作已完成'
        ];

        const hasActionClaim = actionKeywords.some(keyword => response.text.includes(keyword));

        if (hasActionClaim && response.toolCallCount === 0) {
            this.logger.warn('AI Hallucination detected', {
                textPreview: response.text.substring(0, 100),
                toolCallCount: response.toolCallCount
            });
            return true;
        }

        return false;
    }
}
