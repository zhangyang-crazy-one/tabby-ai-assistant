import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, AfterViewInit, ViewEncapsulation, HostBinding } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatMessage, MessageRole, StreamEvent, AgentStreamEvent } from '../../types/ai.types';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { AiSidebarService } from '../../services/chat/ai-sidebar.service';
import { ThemeService, ThemeType } from '../../services/core/theme.service';
import { ContextManager } from '../../services/context/manager';

/**
 * AI Sidebar 组件 - 替代 ChatInterfaceComponent
 * 使用内联模板和样式，支持 Tabby 主题
 */
@Component({
    selector: 'app-ai-sidebar',
    template: `
        <div class="ai-sidebar-container">
            <!-- Header -->
            <div class="ai-sidebar-header">
                <div class="header-title">
                    <svg class="header-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
                        <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
                    </svg>
                    <span>AI 助手</span>
                    <small class="provider-badge">{{ currentProvider }}</small>
                </div>
                <div class="header-actions">
                    <button class="btn btn-link btn-sm btn-close-sidebar" (click)="hideSidebar()" title="隐藏侧边栏">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
                        </svg>
                    </button>
                    <button class="btn btn-link btn-sm" (click)="switchProvider()" title="切换提供商">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.292A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                        </svg>
                    </button>
                    <button class="btn btn-link btn-sm" (click)="clearChat()" title="清空聊天">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
                    <button class="btn btn-link btn-sm" (click)="exportChat()" title="导出聊天">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                            <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Token 使用情况 -->
            <div class="token-usage-bar" *ngIf="currentTokens > 0">
                <div class="usage-progress"
                     [style.width.%]="tokenUsagePercent"
                     [ngClass]="{
                         'usage-low': tokenUsagePercent < 50,
                         'usage-medium': tokenUsagePercent >= 50 && tokenUsagePercent < 80,
                         'usage-high': tokenUsagePercent >= 80
                     }">
                </div>
                <span class="usage-text">{{ currentTokens | number }} / {{ maxTokens | number }} Token</span>
            </div>

            <!-- Messages -->
            <div class="ai-sidebar-messages" #chatContainer (scroll)="onScroll($event)">
                <div *ngFor="let message of messages; let i = index" class="message-item" [ngClass]="message.role">
                    <div class="message-avatar">
                        <svg *ngIf="message.role === 'user'" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
                        </svg>
                        <svg *ngIf="message.role === 'assistant'" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
                            <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="message-header">
                            <span class="message-role">
                                {{ message.role === 'user' ? '用户' : message.role === 'assistant' ? 'AI' : '系统' }}
                            </span>
                            <span class="message-time">{{ formatTimestamp(message.timestamp) }}</span>
                        </div>
                        <div class="message-text" [innerHTML]="formatMessage(message.content)"></div>
                    </div>
                </div>

                <!-- Loading indicator -->
                <div *ngIf="isLoading" class="message-item assistant loading">
                    <div class="message-avatar">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Z"/>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Scroll buttons -->
            <button *ngIf="showScrollTop" class="scroll-btn scroll-top" (click)="scrollToTop()" title="回到顶部">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/>
                </svg>
            </button>
            <button *ngIf="showScrollBottom" class="scroll-btn scroll-bottom" (click)="scrollToBottom()" title="回到底部">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L7.293 8 1.646 2.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>

            <!-- Input -->
            <div class="ai-sidebar-input">
                <div class="input-container">
                    <textarea
                        #textInput
                        class="message-input"
                        [(ngModel)]="inputValue"
                        [disabled]="isLoading"
                        [placeholder]="isLoading ? 'AI 正在思考...' : '输入您的问题或描述要执行的命令...'"
                        (keydown)="onKeydown($event)"
                        (input)="onInput($event)"
                        (compositionstart)="isComposing = true"
                        (compositionend)="isComposing = false"
                        rows="1">
                    </textarea>
                    <button
                        class="send-btn"
                        [disabled]="!inputValue.trim() || isLoading"
                        (click)="submit()"
                        title="发送消息">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083l6-15Zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 0 0-.154-.154l-.338-.215 7.494-7.494 1.178-.471-.47 1.178Z"/>
                        </svg>
                    </button>
                </div>
                <div class="input-footer">
                    <small class="char-count" [ngClass]="{ 'warning': isNearLimit(), 'danger': isOverLimit() }">
                        {{ inputValue.length }} / {{ charLimit }}
                    </small>
                </div>
            </div>
        </div>
    `,
    styleUrls: ['./ai-sidebar.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class AiSidebarComponent implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit {
    // HostBinding 确保样式正确应用
    @HostBinding('style.display') displayStyle = 'flex';
    @HostBinding('style.flex-direction') flexDirection = 'column';
    @HostBinding('style.height') heightStyle = '100%';
    @HostBinding('style.width') widthStyle = '100%';
    @HostBinding('style.overflow') overflowStyle = 'hidden';

    @ViewChild('chatContainer') chatContainerRef!: ElementRef;
    @ViewChild('textInput') textInput!: ElementRef<HTMLTextAreaElement>;

    // 服务引用（由 AiSidebarService 注入）
    public sidebarService!: AiSidebarService;

    // 组件状态
    messages: ChatMessage[] = [];
    isLoading = false;
    currentProvider: string = '';
    currentSessionId: string = '';
    showScrollTop = false;
    showScrollBottom = false;
    inputValue = '';
    isComposing = false;
    charLimit = 4000;

    // Token 使用状态
    currentTokens: number = 0;
    maxTokens: number = 200000;
    tokenUsagePercent: number = 0;

    private destroy$ = new Subject<void>();
    private shouldScrollToBottom = false;

    constructor(
        private aiService: AiAssistantService,
        private config: ConfigProviderService,
        private logger: LoggerService,
        private chatHistory: ChatHistoryService,
        private themeService: ThemeService,
        private contextManager: ContextManager
    ) { }

    ngOnInit(): void {
        // 监听主题变化
        this.themeService.theme$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(theme => {
            this.logger.debug('Sidebar theme changed', { theme });
        });

        // 生成或加载会话 ID
        this.currentSessionId = this.generateSessionId();

        // 加载当前提供商信息
        this.loadCurrentProvider();

        // 加载聊天历史
        this.loadChatHistory();

        // 发送欢迎消息（仅在没有历史记录时）
        if (this.messages.length === 0) {
            this.sendWelcomeMessage();
        }

        // 延迟检查滚动状态（等待 DOM 渲染）
        setTimeout(() => this.checkScrollState(), 100);
    }

    ngOnDestroy(): void {
        // 保存当前会话
        this.saveChatHistory();
        this.destroy$.next();
        this.destroy$.complete();
    }

    ngAfterViewInit(): void {
        // 强制设置滚动样式 - 绕过 CSS 优先级问题
        this.forceScrollStyles();
    }

    /**
     * 强制设置滚动容器样式
     * 使用 JavaScript 直接设置，优先级最高
     */
    private forceScrollStyles(): void {
        setTimeout(() => {
            const container = this.chatContainerRef?.nativeElement;
            if (container) {
                // 直接设置内联样式 - 优先级最高
                container.style.flex = '1 1 auto';
                container.style.height = '0';
                container.style.minHeight = '0';
                container.style.overflowY = 'auto';
                container.style.overflowX = 'hidden';
                container.style.display = 'block';
                this.logger.debug('[AI Sidebar] Scroll styles applied via JS');
            }
        }, 100);  // 延迟确保 DOM 已渲染
    }

    ngAfterViewChecked(): void {
        if (this.shouldScrollToBottom) {
            this.performScrollToBottom();
            this.shouldScrollToBottom = false;
        }
    }

    /**
     * 加载当前提供商信息
     */
    private loadCurrentProvider(): void {
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider) {
            const providerConfig = this.config.getProviderConfig(defaultProvider);
            this.currentProvider = providerConfig?.displayName || defaultProvider;
        } else {
            // 尝试获取第一个已配置的提供商
            const allConfigs = this.config.getAllProviderConfigs();
            const configuredProviders = Object.keys(allConfigs).filter(k => allConfigs[k]?.apiKey);
            if (configuredProviders.length > 0) {
                const firstProvider = configuredProviders[0];
                const providerConfig = allConfigs[firstProvider];
                this.currentProvider = providerConfig?.displayName || firstProvider;
                this.config.setDefaultProvider(firstProvider);
            } else {
                this.currentProvider = '未配置';
            }
        }
    }

    /**
     * 加载聊天历史
     */
    private loadChatHistory(): void {
        try {
            // 尝试加载最近的会话
            const recentSessions = this.chatHistory.getRecentSessions(1);
            if (recentSessions.length > 0) {
                const lastSession = recentSessions[0];
                this.currentSessionId = lastSession.sessionId;
                this.messages = lastSession.messages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                this.logger.info('Loaded chat history', {
                    sessionId: this.currentSessionId,
                    messageCount: this.messages.length
                });
            }
        } catch (error) {
            this.logger.error('Failed to load chat history', error);
            this.messages = [];
        }
    }

    /**
     * 发送欢迎消息
     */
    private sendWelcomeMessage(): void {
        const welcomeMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: `您好！我是AI助手。\n\n我可以帮助您：\n• 将自然语言转换为终端命令\n• 解释复杂的命令\n• 分析命令执行结果\n• 提供错误修复建议\n\n当前使用：${this.currentProvider}\n\n请输入您的问题或描述您想执行的命令。`,
            timestamp: new Date()
        };
        this.messages.push(welcomeMessage);
    }

    /**
     * 处理发送消息 - 使用 Agent 循环模式
     * 支持多轮工具调用自动循环
     */
    async onSendMessageWithAgent(content: string): Promise<void> {
        if (!content.trim() || this.isLoading) {
            return;
        }

        // 添加用户消息
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.USER,
            content: content.trim(),
            timestamp: new Date()
        };
        this.messages.push(userMessage);

        // 滚动到底部
        setTimeout(() => this.scrollToBottom(), 0);

        // 显示加载状态
        this.isLoading = true;

        // 创建 AI 消息占位符用于流式更新
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        // 工具调用跟踪
        const toolStatus = new Map<string, { name: string; startTime: number }>();

        try {
            // 使用 Agent 循环流式 API
            this.aiService.chatStreamWithAgentLoop({
                messages: this.messages.slice(0, -1),
                maxTokens: 2000,
                temperature: 0.7
            }, {
                maxRounds: 5
            }).pipe(
                takeUntil(this.destroy$)
            ).subscribe({
                next: (event: AgentStreamEvent) => {
                    switch (event.type) {
                        case 'text_delta':
                            // 文本流式显示
                            if (event.textDelta) {
                                aiMessage.content += event.textDelta;
                                this.shouldScrollToBottom = true;
                            }
                            break;

                        case 'tool_use_start':
                            // 工具开始 - 使用专门的工具卡片样式
                            const toolName = event.toolCall?.name || 'unknown';
                            aiMessage.content += `
<div class="tool-call-card tool-executing">
    <div class="tool-header">
        <span class="tool-icon">🔧</span>
        <span class="tool-name">${toolName}</span>
        <span class="tool-status" id="tool-status-${event.toolCall?.id}">执行中...</span>
    </div>
</div>`;
                            if (event.toolCall?.id) {
                                toolStatus.set(event.toolCall.id, {
                                    name: toolName,
                                    startTime: Date.now()
                                });
                            }
                            this.shouldScrollToBottom = true;
                            break;

                        case 'tool_executing':
                            // 工具正在执行（额外状态）
                            break;

                        case 'tool_executed':
                            // 工具完成 - 更新工具卡片
                            if (event.toolCall && event.toolResult) {
                                const name = toolStatus.get(event.toolCall.id)?.name || event.toolCall.name || 'unknown';
                                const duration = event.toolResult.duration || 0;

                                // 更新工具卡片状态
                                const executingCardRegex = new RegExp(
                                    `<div class="tool-call-card tool-executing">\\s*<div class="tool-header">\\s*<span class="tool-icon">🔧</span>\\s*<span class="tool-name">${name}</span>[^]*?</div>\\s*</div>`,
                                    'g'
                                );

                                // 构建工具结果卡片
                                let toolCard = `
<div class="tool-call-card tool-success">
    <div class="tool-header">
        <span class="tool-icon">✅</span>
        <span class="tool-name">${name}</span>
        <span class="tool-duration">${duration}ms</span>
    </div>`;

                                // 添加工具输出
                                if (event.toolResult.content && !event.toolResult.is_error) {
                                    const preview = event.toolResult.content.substring(0, 500);
                                    const truncated = event.toolResult.content.length > 500 ? '...' : '';
                                    toolCard += `
    <div class="tool-output">
        <div class="tool-output-header">输出:</div>
        <pre class="tool-output-content">${this.escapeHtml(preview)}${truncated}</pre>
    </div>`;
                                }

                                toolCard += `</div>`;

                                aiMessage.content = aiMessage.content.replace(executingCardRegex, toolCard);
                                toolStatus.delete(event.toolCall.id);
                            }
                            this.shouldScrollToBottom = true;
                            break;

                        case 'tool_error':
                            // 工具错误 - 更新工具卡片为错误状态
                            if (event.toolCall) {
                                const name = toolStatus.get(event.toolCall.id)?.name || event.toolCall.name || 'unknown';
                                const errorMsg = event.toolResult?.content || 'Unknown error';

                                const executingCardRegex = new RegExp(
                                    `<div class="tool-call-card tool-executing">\\s*<div class="tool-header">\\s*<span class="tool-icon">🔧</span>\\s*<span class="tool-name">${name}</span>[^]*?</div>\\s*</div>`,
                                    'g'
                                );

                                const errorCard = `
<div class="tool-call-card tool-error">
    <div class="tool-header">
        <span class="tool-icon">❌</span>
        <span class="tool-name">${name}</span>
        <span class="tool-status">失败</span>
    </div>
    <div class="tool-output tool-error-message">
        <pre class="tool-output-content">${this.escapeHtml(errorMsg)}</pre>
    </div>
</div>`;

                                aiMessage.content = aiMessage.content.replace(executingCardRegex, errorCard);
                                toolStatus.delete(event.toolCall.id);
                            }
                            this.shouldScrollToBottom = true;
                            break;

                        case 'round_start':
                            // 新一轮开始
                            if (event.round && event.round > 1) {
                                aiMessage.content += '\n\n---\n\n';
                            }
                            break;

                        case 'round_end':
                            // 一轮结束
                            break;

                        case 'agent_complete':
                            // Agent 循环完成 - 显示终止原因
                            this.logger.info('Agent completed', {
                                reason: event.reason,
                                totalRounds: event.totalRounds
                            });

                            // 终止原因映射
                            const reasonText: Record<string, { icon: string; label: string }> = {
                                'task_complete': { icon: '✅', label: '任务完成' },
                                'no_tools': { icon: '✅', label: '已执行完成' },
                                'summarizing': { icon: '✅', label: '总结完成' },
                                'repeated_tool': { icon: '⚠️', label: '检测到重复操作' },
                                'high_failure_rate': { icon: '⚠️', label: '多次调用失败' },
                                'timeout': { icon: '⏱️', label: '执行超时' },
                                'max_rounds': { icon: '⚠️', label: '达到最大轮数' },
                                'user_cancel': { icon: '🛑', label: '用户取消' }
                            };

                            const reasonInfo = reasonText[event.reason || ''] || { icon: '📌', label: '完成' };
                            const roundsText = event.totalRounds ? ` (${event.totalRounds} 轮)` : '';

                            // 添加终止信息
                            aiMessage.content += `\n\n---\n**${reasonInfo.icon} ${reasonInfo.label}**${roundsText}`;

                            // 如果有终止消息，添加到内容中
                            if (event.terminationMessage) {
                                aiMessage.content += `\n${event.terminationMessage}`;
                            }

                            this.shouldScrollToBottom = true;
                            break;

                        case 'error':
                            // 错误
                            aiMessage.content += `\n\n❌ 错误: ${event.error}`;
                            this.shouldScrollToBottom = true;
                            break;
                    }
                },
                error: (error) => {
                    this.logger.error('Agent stream error', error);
                    aiMessage.content += `\n\n❌ 错误: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    this.isLoading = false;
                    this.shouldScrollToBottom = true;
                    this.saveChatHistory();
                },
                complete: () => {
                    this.isLoading = false;
                    this.updateTokenUsage();
                    this.saveChatHistory();
                    this.shouldScrollToBottom = true;
                }
            });

        } catch (error) {
            this.logger.error('Failed to send message with agent', error);
            aiMessage.content = `抱歉，我遇到了一些问题：${error instanceof Error ? error.message : 'Unknown error'}\n\n请稍后重试。`;
            this.isLoading = false;
            this.updateTokenUsage();
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 处理发送消息 - 原有方法（保留兼容性）
     */
    async onSendMessage(content: string): Promise<void> {
        if (!content.trim() || this.isLoading) {
            return;
        }

        // 添加用户消息
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.USER,
            content: content.trim(),
            timestamp: new Date()
        };
        this.messages.push(userMessage);

        // 滚动到底部
        setTimeout(() => this.scrollToBottom(), 0);

        // 显示加载状态
        this.isLoading = true;

        // 创建 AI 消息占位符用于流式更新
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        // 工具调用跟踪
        const pendingTools = new Map<string, { name: string; startTime: number }>();
        const toolResults: string[] = [];

        try {
            // 使用流式 API
            this.aiService.chatStream({
                messages: this.messages.slice(0, -1),  // 排除刚添加的空 AI 消息
                maxTokens: 2000,
                temperature: 0.7
            }).pipe(
                takeUntil(this.destroy$)
            ).subscribe({
                next: (event: StreamEvent) => {
                    switch (event.type) {
                        case 'text_delta':
                            // 文本流式显示
                            if (event.textDelta) {
                                aiMessage.content += event.textDelta;
                                this.shouldScrollToBottom = true;
                            }
                            break;

                        case 'tool_use_start':
                            // 工具开始 - 显示工具名称
                            const toolName = event.toolCall?.name || 'unknown';
                            aiMessage.content += `\n\n🔧 正在执行 ${toolName}...`;
                            if (event.toolCall?.id) {
                                pendingTools.set(event.toolCall.id, {
                                    name: toolName,
                                    startTime: Date.now()
                                });
                            }
                            this.shouldScrollToBottom = true;
                            break;

                        case 'tool_use_end':
                            // 工具完成 - 更新状态
                            if (event.toolCall) {
                                const toolInfo = pendingTools.get(event.toolCall.id);
                                const duration = toolInfo ? Date.now() - toolInfo.startTime : 0;
                                const name = toolInfo?.name || event.toolCall.name || 'unknown';

                                aiMessage.content = aiMessage.content.replace(
                                    new RegExp(`🔧 正在执行 ${name}\\.\\.\\.`),
                                    `✅ ${name} (${duration}ms)`
                                );
                                pendingTools.delete(event.toolCall.id);
                            }
                            this.shouldScrollToBottom = true;
                            break;

                        case 'tool_result':
                            // 工具结果 - 存储用于最后显示
                            if (event.result) {
                                const preview = event.result.content.substring(0, 500);
                                const truncated = event.result.content.length > 500 ? '\n...(已截断)' : '';
                                toolResults.push(`\n\n📋 **输出**:\n\`\`\`\n${preview}${truncated}\n\`\`\``);
                            }
                            break;

                        case 'tool_error':
                            // 工具错误
                            aiMessage.content = aiMessage.content.replace(
                                /🔧 正在执行 \w+\.\.\./,
                                `❌ 工具执行失败: ${event.error}`
                            );
                            this.shouldScrollToBottom = true;
                            break;

                        case 'message_end':
                            // 消息结束 - 附加工具结果
                            if (toolResults.length > 0) {
                                aiMessage.content += toolResults.join('');
                            }
                            this.logger.info('Stream completed');
                            break;
                    }
                },
                error: (error) => {
                    this.logger.error('Stream error', error);
                    aiMessage.content += `\n\n❌ 错误: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    this.isLoading = false;
                    this.shouldScrollToBottom = true;
                    this.saveChatHistory();
                },
                complete: () => {
                    this.isLoading = false;
                    this.updateTokenUsage();
                    this.saveChatHistory();
                    this.shouldScrollToBottom = true;
                }
            });

        } catch (error) {
            this.logger.error('Failed to send message', error);

            // 添加错误消息
            aiMessage.content = `抱歉，我遇到了一些问题：${error instanceof Error ? error.message : 'Unknown error'}\n\n请稍后重试。`;
            this.isLoading = false;
            this.updateTokenUsage();
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 更新 Token 使用情况
     */
    private updateTokenUsage(): void {
        // 获取最大上下文限制
        this.maxTokens = this.config.getActiveProviderContextWindow() || 200000;

        // 计算当前消息的 Token 使用量（简单估算：每4个字符≈1 Token）
        this.currentTokens = this.messages.reduce((sum, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : '';
            return sum + Math.ceil(content.length / 4);
        }, 0);

        // 计算使用百分比
        this.tokenUsagePercent = Math.min(
            Math.round((this.currentTokens / this.maxTokens) * 100),
            100
        );
    }

    /**
     * 清空聊天记录
     */
    clearChat(): void {
        if (confirm('确定要清空聊天记录吗？')) {
            // 删除当前会话
            if (this.currentSessionId) {
                this.chatHistory.deleteSession(this.currentSessionId);
            }
            // 创建新会话
            this.currentSessionId = this.generateSessionId();
            this.messages = [];
            this.sendWelcomeMessage();
            this.logger.info('Chat cleared, new session created', { sessionId: this.currentSessionId });
        }
    }

    /**
     * 导出聊天记录
     */
    exportChat(): void {
        const chatData = {
            provider: this.currentProvider,
            exportTime: new Date().toISOString(),
            messages: this.messages
        };

        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * 切换提供商
     */
    async switchProvider(): Promise<void> {
        // 从配置服务获取已配置的提供商
        const allConfigs = this.config.getAllProviderConfigs();
        const configuredProviders = Object.keys(allConfigs)
            .filter(key => allConfigs[key] && allConfigs[key].enabled !== false)
            .map(key => ({
                name: key,
                displayName: allConfigs[key].displayName || key
            }));

        if (configuredProviders.length === 0) {
            alert('没有可用的AI提供商，请先在设置中配置。');
            return;
        }

        // 构建提供商列表
        const providerList = configuredProviders.map((p, i) =>
            `${i + 1}. ${p.displayName}`
        ).join('\n');

        const choice = prompt(
            `当前使用: ${this.currentProvider}\n\n可用的AI提供商:\n${providerList}\n\n请输入序号选择提供商:`,
            '1'
        );

        if (choice) {
            const index = parseInt(choice, 10) - 1;
            if (index >= 0 && index < configuredProviders.length) {
                const selectedProvider = configuredProviders[index];
                this.config.setDefaultProvider(selectedProvider.name);
                this.currentProvider = selectedProvider.displayName;
                this.logger.info('Provider switched', { provider: selectedProvider.name });

                // 添加系统消息
                const systemMessage: ChatMessage = {
                    id: this.generateId(),
                    role: MessageRole.SYSTEM,
                    content: `已切换到 ${this.currentProvider}`,
                    timestamp: new Date()
                };
                this.messages.push(systemMessage);
            } else {
                alert('无效的选择');
            }
        }
    }

    /**
     * 隐藏侧边栏
     */
    hideSidebar(): void {
        if (this.sidebarService) {
            this.sidebarService.hide();
        }
    }

    /**
     * 滚动到底部（公开方法）
     */
    scrollToBottom(): void {
        this.shouldScrollToBottom = true;
    }

    /**
     * 滚动到顶部
     */
    scrollToTop(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            chatContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * 实际执行滚动到底部
     */
    private performScrollToBottom(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        }
    }

    /**
     * 处理滚动事件
     */
    onScroll(event: Event): void {
        const target = event.target as HTMLElement;
        if (!target) return;
        this.updateScrollButtons(target);
    }

    /**
     * 检查滚动状态（初始化时调用）
     */
    private checkScrollState(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            this.updateScrollButtons(chatContainer);
        }
    }

    /**
     * 更新滚动按钮显示状态
     */
    private updateScrollButtons(container: HTMLElement): void {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // 判断是否显示滚动按钮
        this.showScrollTop = scrollTop > 50;
        this.showScrollBottom = scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 50;
    }

    /**
     * 保存聊天历史
     */
    private saveChatHistory(): void {
        try {
            if (this.messages.length > 0 && this.currentSessionId) {
                this.chatHistory.saveSession(this.currentSessionId, this.messages);
                this.logger.info('Chat history saved', {
                    sessionId: this.currentSessionId,
                    messageCount: this.messages.length
                });
            }
        } catch (error) {
            this.logger.error('Failed to save chat history', error);
        }
    }

    /**
     * 生成会话 ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取消息时间格式
     */
    formatTimestamp(timestamp: Date): string {
        return timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 格式化消息内容（支持 Markdown 渲染）
     */
    formatMessage(content: string): string {
        if (!content) return '';

        try {
            // 使用 marked 库渲染 Markdown
            const { marked } = require('marked');

            // 配置 marked 选项
            marked.setOptions({
                breaks: true,       // 支持换行
                gfm: true,          // 支持 GitHub Flavored Markdown
                headerIds: false,   // 不生成标题 ID
                mangle: false       // 不转义邮箱
            });

            return marked.parse(content);
        } catch (e) {
            // 如果 marked 失败，使用基本格式化
            return content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code>$1</code>');
        }
    }

    /**
     * 检查是否为今天的消息
     */
    isToday(date: Date): boolean {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    /**
     * 检查是否为同一天的消息
     */
    isSameDay(date1: Date, date2: Date): boolean {
        return date1.toDateString() === date2.toDateString();
    }

    /**
     * 处理键盘事件
     */
    onKeydown(event: KeyboardEvent): void {
        // Enter 发送（不包含Shift）
        if (event.key === 'Enter' && !event.shiftKey && !this.isComposing) {
            event.preventDefault();
            this.submit();
        }
    }

    /**
     * 处理输入事件
     */
    onInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.inputValue = target.value;
        this.autoResize();
    }

    /**
     * 提交消息
     */
    submit(): void {
        const message = this.inputValue.trim();
        if (message && !this.isLoading) {
            // 使用 Agent 循环模式发送消息（支持多轮工具调用）
            this.onSendMessageWithAgent(message);
            this.inputValue = '';
            setTimeout(() => this.autoResize(), 0);
            this.textInput?.nativeElement.focus();
        }
    }

    /**
     * 自动调整输入框高度
     */
    private autoResize(): void {
        if (this.textInput?.nativeElement) {
            const textarea = this.textInput.nativeElement;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
    }

    /**
     * 获取字符计数
     */
    getCharCount(): number {
        return this.inputValue.length;
    }

    /**
     * 检查是否接近限制
     */
    isNearLimit(): boolean {
        return this.getCharCount() > this.charLimit * 0.8;
    }

    /**
     * 检查是否超过限制
     */
    isOverLimit(): boolean {
        return this.getCharCount() > this.charLimit;
    }

    /**
     * 转义 HTML 特殊字符
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
