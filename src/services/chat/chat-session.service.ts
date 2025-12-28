import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ChatMessage, ChatRequest, ChatResponse, MessageRole, Checkpoint, ApiMessage } from '../../types/ai.types';
import { AiAssistantService } from '../core/ai-assistant.service';
import { LoggerService } from '../core/logger.service';
import { ConfigProviderService } from '../core/config-provider.service';
import { ChatHistoryService } from './chat-history.service';
import { ContextManager } from '../context/manager';
import { CheckpointManager } from '../core/checkpoint.service';

/**
 * 聊天会话服务
 * 管理聊天会话的生命周期、消息历史和状态
 */
@Injectable({
    providedIn: 'root'
})
export class ChatSessionService {
    private currentSessionId: string | null = null;
    private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
    private isTypingSubject = new BehaviorSubject<boolean>(false);
    private errorSubject = new Subject<string>();
    private checkpointsSubject = new BehaviorSubject<Checkpoint[]>([]);

    public messages$ = this.messagesSubject.asObservable();
    public isTyping$ = this.isTypingSubject.asObservable();
    public error$ = this.errorSubject.asObservable();
    public checkpoints$ = this.checkpointsSubject.asObservable();

    constructor(
        private aiService: AiAssistantService,
        private logger: LoggerService,
        private chatHistoryService: ChatHistoryService,
        private contextManager: ContextManager,
        private configService: ConfigProviderService,
        private checkpointManager: CheckpointManager
    ) { }

    /**
     * 创建新会话
     */
    createSession(): string {
        this.currentSessionId = this.generateSessionId();
        this.messagesSubject.next([]);
        this.logger.info('Created new chat session', { sessionId: this.currentSessionId });
        return this.currentSessionId;
    }

    /**
     * 切换到指定会话
     * 从存储中加载会话历史
     */
    switchToSession(sessionId: string): void {
        this.currentSessionId = sessionId;

        // 从 ChatHistoryService 加载会话历史
        const sessionData = this.chatHistoryService.loadSession(sessionId);

        if (sessionData && sessionData.messages && sessionData.messages.length > 0) {
            // 恢复消息历史
            const chatMessages: ChatMessage[] = sessionData.messages.map((msg, index) => ({
                id: msg.id || `msg_${sessionId}_${index}`,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp || Date.now())
            }));

            this.messagesSubject.next(chatMessages);
            this.logger.info('Loaded session history', {
                sessionId,
                messageCount: chatMessages.length
            });
        } else {
            // 新会话，清空当前消息
            this.messagesSubject.next([]);
            this.logger.info('Started new session', { sessionId });
        }

        this.logger.info('Switched to session', { sessionId });
    }

    /**
     * 发送消息
     */
    async sendMessage(content: string, systemPrompt?: string): Promise<void> {
        if (!this.currentSessionId) {
            this.createSession();
        }
        try {
            // === 发送前检查并管理上下文 ===
            await this.checkAndManageContext();

            // 添加用户消息
            const userMessage: ChatMessage = {
                id: this.generateMessageId(),
                role: MessageRole.USER,
                content,
                timestamp: new Date()
            };

            const currentMessages = this.messagesSubject.value;
            this.messagesSubject.next([...currentMessages, userMessage]);

            // 显示打字状态
            this.isTypingSubject.next(true);

            // 构建请求
            const request: ChatRequest = {
                messages: [...currentMessages, userMessage],
                systemPrompt,
                maxTokens: 2000,
                temperature: 0.7
            };

            // 发送请求
            const response = await this.aiService.chat(request);

            // 添加AI响应
            const assistantMessage: ChatMessage = {
                ...response.message,
                id: this.generateMessageId()
            };

            this.messagesSubject.next([
                ...this.messagesSubject.value,
                assistantMessage
            ]);

            this.logger.info('Message sent successfully', {
                sessionId: this.currentSessionId,
                messageId: assistantMessage.id
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.errorSubject.next(errorMessage);
            this.logger.error('Failed to send message', {
                error,
                sessionId: this.currentSessionId,
                content
            });
            throw error;
        } finally {
            this.isTypingSubject.next(false);
        }
    }

    /**
     * 清空会话历史
     */
    clearSession(): void {
        this.messagesSubject.next([]);
        this.logger.info('Cleared chat session', {
            sessionId: this.currentSessionId
        });
    }

    /**
     * 删除消息
     */
    deleteMessage(messageId: string): void {
        const currentMessages = this.messagesSubject.value;
        const filteredMessages = currentMessages.filter(msg => msg.id !== messageId);
        this.messagesSubject.next(filteredMessages);
        this.logger.info('Deleted message', { messageId, sessionId: this.currentSessionId });
    }

    /**
     * 获取当前会话ID
     */
    getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }

    /**
     * 获取当前消息列表
     */
    getCurrentMessages(): ChatMessage[] {
        return this.messagesSubject.value;
    }

    /**
     * 导出会话
     */
    exportSession(): string {
        const sessionData = {
            sessionId: this.currentSessionId,
            messages: this.messagesSubject.value,
            timestamp: new Date().toISOString()
        };
        return JSON.stringify(sessionData, null, 2);
    }

    /**
     * 导入会话
     */
    importSession(sessionData: string): void {
        try {
            const data = JSON.parse(sessionData);
            this.currentSessionId = data.sessionId;
            this.messagesSubject.next(data.messages || []);
            this.logger.info('Imported session', { sessionId: this.currentSessionId });
        } catch (error) {
            this.logger.error('Failed to import session', error);
            throw new Error('Invalid session data format');
        }
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ==================== 检查点管理功能 ====================

    /**
     * 创建检查点
     */
    createCheckpoint(label?: string): Checkpoint {
        if (!this.currentSessionId) {
            throw new Error('No active session');
        }

        const checkpointId = this.generateCheckpointId();
        const currentMessages = this.messagesSubject.value;
        const apiMessages: ApiMessage[] = currentMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            ts: msg.timestamp.getTime()
        }));

        // 计算Token使用量
        const tokenUsage = {
            input: this.calculateInputTokens(apiMessages),
            output: this.calculateOutputTokens(apiMessages),
            cacheRead: 0,
            cacheWrite: 0
        };

        // 生成摘要
        const summary = label || this.generateCheckpointSummary(currentMessages);

        const checkpoint: Checkpoint = {
            id: checkpointId,
            sessionId: this.currentSessionId,
            messages: apiMessages,
            summary,
            createdAt: Date.now(),
            tokenUsage
        };

        // 保存到会话历史（保留现有contextInfo）
        const existingContextInfo = this.chatHistoryService.loadSession(this.currentSessionId)?.contextInfo;
        this.chatHistoryService.updateContextInfo(this.currentSessionId, {
            ...existingContextInfo
        });

        // 更新本地检查点列表
        const currentCheckpoints = this.checkpointsSubject.value;
        this.checkpointsSubject.next([...currentCheckpoints, checkpoint]);

        this.logger.info('Checkpoint created', {
            checkpointId,
            sessionId: this.currentSessionId,
            messageCount: currentMessages.length
        });

        return checkpoint;
    }

    /**
     * 恢复检查点
     */
    restoreCheckpoint(checkpointId: string): void {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        if (checkpoint.sessionId !== this.currentSessionId) {
            throw new Error('Checkpoint belongs to different session');
        }

        // 恢复消息
        const restoredMessages: ChatMessage[] = checkpoint.messages.map(msg => ({
            id: this.generateMessageId(),
            role: msg.role as any,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: new Date(msg.ts)
        }));

        this.messagesSubject.next(restoredMessages);

        this.logger.info('Checkpoint restored', {
            checkpointId,
            sessionId: this.currentSessionId,
            messageCount: restoredMessages.length
        });
    }

    /**
     * 删除检查点
     */
    deleteCheckpoint(checkpointId: string): void {
        const currentCheckpoints = this.checkpointsSubject.value;
        const filteredCheckpoints = currentCheckpoints.filter(cp => cp.id !== checkpointId);

        this.checkpointsSubject.next(filteredCheckpoints);

        this.logger.info('Checkpoint deleted', { checkpointId, sessionId: this.currentSessionId });
    }

    /**
     * 获取指定检查点
     */
    getCheckpoint(checkpointId: string): Checkpoint | undefined {
        return this.checkpointsSubject.value.find(cp => cp.id === checkpointId);
    }

    /**
     * 列出所有检查点
     */
    listCheckpoints(sessionId?: string): Checkpoint[] {
        const allCheckpoints = this.checkpointsSubject.value;
        if (sessionId) {
            return allCheckpoints.filter(cp => cp.sessionId === sessionId);
        }
        return [...allCheckpoints];
    }

    /**
     * 清空检查点
     */
    clearCheckpoints(sessionId?: string): void {
        if (sessionId) {
            // 清空指定会话的检查点
            const currentCheckpoints = this.checkpointsSubject.value;
            const filteredCheckpoints = currentCheckpoints.filter(cp => cp.sessionId !== sessionId);
            this.checkpointsSubject.next(filteredCheckpoints);
        } else {
            // 清空所有检查点
            this.checkpointsSubject.next([]);
        }

        this.logger.info('Checkpoints cleared', { sessionId: sessionId || 'all' });
    }

    /**
     * 压缩存储检查点
     */
    async compressCheckpoint(checkpointId: string): Promise<void> {
        try {
            // 使用 CheckpointManager 的压缩功能
            await this.checkpointManager.compressForCheckpoint(checkpointId);
            this.logger.info('Checkpoint compressed', { checkpointId });
        } catch (error) {
            this.logger.error('Failed to compress checkpoint', { checkpointId, error });
            throw error;
        }
    }

    /**
     * 导出会话（包含检查点）
     */
    exportSessionWithCheckpoints(): string {
        const sessionData = {
            sessionId: this.currentSessionId,
            messages: this.messagesSubject.value,
            checkpoints: this.checkpointsSubject.value,
            timestamp: new Date().toISOString(),
            version: '2.0'
        };
        return JSON.stringify(sessionData, null, 2);
    }

    /**
     * 导入会话（包含检查点）
     */
    importSessionWithCheckpoints(sessionData: string): void {
        try {
            const data = JSON.parse(sessionData);
            this.currentSessionId = data.sessionId;
            this.messagesSubject.next(data.messages || []);

            // 恢复检查点
            if (data.checkpoints) {
                const restoredCheckpoints: Checkpoint[] = data.checkpoints.map((cp: any) => ({
                    ...cp,
                    createdAt: typeof cp.createdAt === 'number' ? cp.createdAt : new Date(cp.createdAt).getTime(),
                    messages: cp.messages.map((msg: any) => ({
                        ...msg,
                        ts: typeof msg.ts === 'number' ? msg.ts : new Date(msg.ts).getTime()
                    }))
                }));
                this.checkpointsSubject.next(restoredCheckpoints);
            }

            this.logger.info('Session with checkpoints imported', {
                sessionId: this.currentSessionId,
                checkpointCount: data.checkpoints?.length || 0
            });
        } catch (error) {
            this.logger.error('Failed to import session with checkpoints', error);
            throw new Error('Invalid session data format');
        }
    }

    /**
     * 获取检查点统计信息
     */
    getCheckpointStatistics(): {
        totalCheckpoints: number;
        averageMessagesPerCheckpoint: number;
        totalTokenUsage: number;
        oldestCheckpoint?: Date;
        newestCheckpoint?: Date;
    } {
        const checkpoints = this.checkpointsSubject.value;
        const totalCheckpoints = checkpoints.length;

        const totalMessages = checkpoints.reduce((sum, cp) => sum + cp.messages.length, 0);
        const averageMessagesPerCheckpoint = totalCheckpoints > 0 ? totalMessages / totalCheckpoints : 0;

        const totalTokenUsage = checkpoints.reduce((sum, cp) => {
            return sum + cp.tokenUsage.input + cp.tokenUsage.output;
        }, 0);

        const timestamps = checkpoints.map(cp => cp.createdAt);
        const oldestCheckpoint = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
        const newestCheckpoint = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

        return {
            totalCheckpoints,
            averageMessagesPerCheckpoint: Math.round(averageMessagesPerCheckpoint * 100) / 100,
            totalTokenUsage,
            oldestCheckpoint,
            newestCheckpoint
        };
    }

    // ==================== 私有辅助方法 ====================

    private generateCheckpointId(): string {
        return `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateCheckpointSummary(messages: ChatMessage[]): string {
        if (messages.length === 0) {
            return '空检查点';
        }

        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];
        const messageCount = messages.length;

        return `检查点：${messageCount}条消息 | 从 "${this.truncateText(firstMessage.content, 30)}" 到 "${this.truncateText(lastMessage.content, 30)}"`;
    }

    private truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    private calculateInputTokens(messages: ApiMessage[]): number {
        return messages
            .filter(msg => msg.role === 'user' || msg.role === 'system')
            .reduce((sum, msg) => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                return sum + Math.ceil(content.length / 4);
            }, 0);
    }

    private calculateOutputTokens(messages: ApiMessage[]): number {
        return messages
            .filter(msg => msg.role === 'assistant')
            .reduce((sum, msg) => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                return sum + Math.ceil(content.length / 4);
            }, 0);
    }

    // ==================== 上下文自动管理 ====================

    /**
     * 检查并管理上下文（自动压缩）
     */
    private async checkAndManageContext(): Promise<void> {
        if (!this.currentSessionId) {
            return;
        }
        // 检查自动压缩开关是否启用
        if (!this.configService.isAutoCompactEnabled()) {
            return;
        }
        // 同步当前消息到 ChatHistoryService
        this.syncMessagesToHistory();
        // 检查是否需要管理上下文
        if (this.contextManager.shouldManageContext(this.currentSessionId)) {
            this.logger.info('Context management triggered', {
                sessionId: this.currentSessionId
            });
            try {
                const results = await this.contextManager.manageContext(this.currentSessionId);
                // 记录压缩结果
                if (results.compactionResult) {
                    this.logger.info('Context compacted', {
                        tokensSaved: results.compactionResult.tokensSaved,
                        summary: results.compactionResult.summary?.substring(0, 100)
                    });
                }
                if (results.pruneResult && results.pruneResult.pruned) {
                    this.logger.info('Context pruned', {
                        tokensSaved: results.pruneResult.tokensSaved,
                        partsCompacted: results.pruneResult.partsCompacted
                    });
                }
                if (results.truncationResult) {
                    this.logger.info('Context truncated', {
                        messagesRemoved: results.truncationResult.messagesRemoved
                    });
                }
                // 重新加载压缩后的消息
                this.reloadMessagesFromHistory();
            } catch (error) {
                this.logger.error('Context management failed', {
                    error,
                    sessionId: this.currentSessionId
                });
                // 即使压缩失败，也继续发送消息
            }
        }
    }

    /**
     * 同步当前消息到历史存储
     */
    private syncMessagesToHistory(): void {
        if (!this.currentSessionId) return;
        const currentMessages = this.messagesSubject.value;
        // 将当前会话保存到历史
        this.chatHistoryService.saveSession(this.currentSessionId, currentMessages);
    }

    /**
     * 从历史存储重新加载消息（压缩后）
     */
    private reloadMessagesFromHistory(): void {
        if (!this.currentSessionId) return;
        // 获取有效历史（已被压缩过滤）
        const effectiveMessages = this.contextManager.getEffectiveHistory(this.currentSessionId);
        // 转换为 ChatMessage 格式
        const chatMessages: ChatMessage[] = effectiveMessages.map(msg => ({
            id: this.generateMessageId(),
            role: msg.role as any,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: new Date(msg.ts)
        }));
        this.messagesSubject.next(chatMessages);
        this.logger.info('Messages reloaded after context management', {
            messageCount: chatMessages.length,
            sessionId: this.currentSessionId
        });
    }
}
