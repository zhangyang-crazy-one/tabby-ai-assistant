import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChatMessage } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { FileStorageService } from '../core/file-storage.service';

export interface SavedSession {
    sessionId: string;
    title: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    // 上下文工程相关字段
    contextInfo?: {
        tokenUsage?: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
        };
        compactionHistory?: Array<{
            timestamp: Date;
            type: 'prune' | 'compact' | 'truncate';
            tokensSaved: number;
            condenseId?: string;
        }>;
        hasCompression?: boolean;
        lastCompactionAt?: Date;
    };
}

const STORAGE_KEY = 'tabby-ai-assistant-chat-history';
const STORAGE_FILENAME = 'chat-sessions';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 1000;

/**
 * 聊天历史服务
 * 持久化存储和管理聊天会话历史
 */
@Injectable({
    providedIn: 'root'
})
export class ChatHistoryService {
    private sessionsSubject = new BehaviorSubject<SavedSession[]>([]);
    public sessions$ = this.sessionsSubject.asObservable();

    constructor(
        private logger: LoggerService,
        private fileStorage: FileStorageService
    ) {
        this.loadSessions();
    }

    /**
     * 保存会话
     */
    saveSession(sessionId: string, messages: ChatMessage[], title?: string): void {
        try {
            const sessions = this.sessionsSubject.value;
            const existingIndex = sessions.findIndex(s => s.sessionId === sessionId);

            const sessionTitle = title || this.generateSessionTitle(messages);
            const now = new Date();

            const session: SavedSession = {
                sessionId,
                title: sessionTitle,
                messages: this.trimMessages(messages),
                createdAt: existingIndex >= 0 ? sessions[existingIndex].createdAt : now,
                updatedAt: now,
                messageCount: messages.length
            };

            if (existingIndex >= 0) {
                sessions[existingIndex] = session;
            } else {
                sessions.unshift(session);
            }

            // 限制会话数量
            const trimmedSessions = sessions.slice(0, MAX_SESSIONS);
            this.sessionsSubject.next(trimmedSessions);
            this.saveToStorage(trimmedSessions);

            this.logger.info('Session saved', { sessionId, title: sessionTitle });

        } catch (error) {
            this.logger.error('Failed to save session', { error, sessionId });
            throw error;
        }
    }

    /**
     * 加载会话
     */
    loadSession(sessionId: string): SavedSession | undefined {
        const sessions = this.sessionsSubject.value;
        return sessions.find(s => s.sessionId === sessionId);
    }

    /**
     * 删除会话
     */
    deleteSession(sessionId: string): void {
        const sessions = this.sessionsSubject.value;
        const filteredSessions = sessions.filter(s => s.sessionId !== sessionId);
        this.sessionsSubject.next(filteredSessions);
        this.saveToStorage(filteredSessions);
        this.logger.info('Session deleted', { sessionId });
    }

    /**
     * 清空所有历史
     */
    clearAllHistory(): void {
        this.sessionsSubject.next([]);
        this.saveToStorage([]);
        this.logger.info('All chat history cleared');
    }

    /**
     * 搜索会话
     */
    searchSessions(query: string): SavedSession[] {
        const sessions = this.sessionsSubject.value;
        const lowercaseQuery = query.toLowerCase();

        return sessions.filter(session =>
            session.title.toLowerCase().includes(lowercaseQuery) ||
            session.messages.some(msg =>
                msg.content.toLowerCase().includes(lowercaseQuery)
            )
        );
    }

    /**
     * 获取最近的会话
     */
    getRecentSessions(count: number = 10): SavedSession[] {
        const sessions = this.sessionsSubject.value;
        return sessions.slice(0, count);
    }

    /**
     * 获取会话统计
     */
    getStatistics(): {
        totalSessions: number;
        totalMessages: number;
        averageMessagesPerSession: number;
        oldestSession?: Date;
        newestSession?: Date;
    } {
        const sessions = this.sessionsSubject.value;
        const totalSessions = sessions.length;
        const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
        const averageMessagesPerSession = totalSessions > 0 ? totalMessages / totalSessions : 0;

        const dates = sessions.map(s => s.createdAt.getTime());
        const oldestSession = dates.length > 0 ? new Date(Math.min(...dates)) : undefined;
        const newestSession = dates.length > 0 ? new Date(Math.max(...dates)) : undefined;

        return {
            totalSessions,
            totalMessages,
            averageMessagesPerSession: Math.round(averageMessagesPerSession * 100) / 100,
            oldestSession,
            newestSession
        };
    }

    /**
     * 导出所有历史
     */
    exportAllHistory(): string {
        const sessions = this.sessionsSubject.value;
        const exportData = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            sessions
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导入历史
     */
    importHistory(data: string): void {
        try {
            const importData = JSON.parse(data);

            if (!importData.sessions || !Array.isArray(importData.sessions)) {
                throw new Error('Invalid history format');
            }

            const sessions = importData.sessions.map((s: any) => ({
                ...s,
                createdAt: new Date(s.createdAt),
                updatedAt: new Date(s.updatedAt)
            }));

            this.sessionsSubject.next(sessions);
            this.saveToStorage(sessions);

            this.logger.info('History imported', {
                sessionCount: sessions.length
            });

        } catch (error) {
            this.logger.error('Failed to import history', error);
            throw new Error('Invalid history file format');
        }
    }

    private loadSessions(): void {
        try {
            const data = this.fileStorage.load<SavedSession[]>(STORAGE_FILENAME, []);

            if (data.length > 0) {
                const sessions = data.map((s: any) => ({
                    ...s,
                    createdAt: new Date(s.createdAt),
                    updatedAt: new Date(s.updatedAt)
                }));
                this.sessionsSubject.next(sessions);
                this.logger.info('Loaded sessions from file storage', { count: sessions.length });
            }
        } catch (error) {
            this.logger.error('Failed to load sessions from storage', error);
            this.sessionsSubject.next([]);
        }
    }

    private saveToStorage(sessions: SavedSession[]): void {
        this.fileStorage.save(STORAGE_FILENAME, sessions);
    }

    private generateSessionTitle(messages: ChatMessage[]): string {
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (!firstUserMessage) {
            return `会话 ${new Date().toLocaleString()}`;
        }

        const content = firstUserMessage.content;
        return content.length > 50 ? content.substring(0, 50) + '...' : content;
    }

    private trimMessages(messages: ChatMessage[]): ChatMessage[] {
        if (messages.length <= MAX_MESSAGES_PER_SESSION) {
            return messages;
        }

        // 保留最近的messages
        return messages.slice(-MAX_MESSAGES_PER_SESSION);
    }

    /**
     * 更新会话的上下文信息（压缩标记支持）
     */
    updateContextInfo(sessionId: string, contextInfo: SavedSession['contextInfo']): void {
        const sessions = this.sessionsSubject.value;
        const existingIndex = sessions.findIndex(s => s.sessionId === sessionId);

        if (existingIndex >= 0) {
            sessions[existingIndex] = {
                ...sessions[existingIndex],
                contextInfo
            };
            this.sessionsSubject.next([...sessions]);
            this.saveToStorage(sessions);
            this.logger.info('Context info updated', { sessionId });
        }
    }

    /**
     * 导出会话（包含压缩状态）
     */
    exportSessionWithContext(sessionId: string): string | undefined {
        const session = this.loadSession(sessionId);
        if (!session) {
            return undefined;
        }

        const exportData = {
            exportDate: new Date().toISOString(),
            version: '2.0',
            session: {
                ...session,
                contextInfo: session.contextInfo || {}
            }
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导出会话历史（包含所有压缩状态）
     */
    exportAllHistoryWithContext(): string {
        const sessions = this.sessionsSubject.value;
        const exportData = {
            exportDate: new Date().toISOString(),
            version: '2.0',
            sessions: sessions.map(s => ({
                ...s,
                contextInfo: s.contextInfo || {}
            }))
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导入会话（包含压缩状态）
     */
    importSessionWithContext(data: string): void {
        try {
            const importData = JSON.parse(data);

            if (!importData.session && !importData.sessions) {
                throw new Error('Invalid session format');
            }

            const sessions = this.sessionsSubject.value;

            if (importData.session) {
                // 导入单个会话
                const session = importData.session;
                const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId);

                const processedSession = {
                    ...session,
                    createdAt: new Date(session.createdAt),
                    updatedAt: new Date(session.updatedAt),
                    contextInfo: session.contextInfo || undefined
                };

                if (existingIndex >= 0) {
                    sessions[existingIndex] = processedSession;
                } else {
                    sessions.unshift(processedSession);
                }
            } else if (importData.sessions) {
                // 批量导入会话
                const importedSessions = importData.sessions.map((s: any) => ({
                    ...s,
                    createdAt: new Date(s.createdAt),
                    updatedAt: new Date(s.updatedAt),
                    contextInfo: s.contextInfo || undefined
                }));

                // 合并现有会话，避免重复
                const mergedSessions = [...sessions];
                importedSessions.forEach(imported => {
                    const existingIndex = mergedSessions.findIndex(s => s.sessionId === imported.sessionId);
                    if (existingIndex >= 0) {
                        mergedSessions[existingIndex] = imported;
                    } else {
                        mergedSessions.unshift(imported);
                    }
                });

                // 限制会话数量
                this.sessionsSubject.next(mergedSessions.slice(0, MAX_SESSIONS));
                this.saveToStorage(mergedSessions.slice(0, MAX_SESSIONS));
            }

            this.logger.info('Session(s) with context imported successfully');
        } catch (error) {
            this.logger.error('Failed to import session with context', error);
            throw new Error('Invalid session file format');
        }
    }

    /**
     * 清理压缩数据
     */
    cleanupCompressedData(sessionId?: string): void {
        const sessions = this.sessionsSubject.value;

        if (sessionId) {
            // 清理指定会话的压缩数据
            const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
            if (sessionIndex >= 0 && sessions[sessionIndex].contextInfo) {
                sessions[sessionIndex] = {
                    ...sessions[sessionIndex],
                    contextInfo: undefined
                };
                this.sessionsSubject.next([...sessions]);
                this.saveToStorage(sessions);
                this.logger.info('Compressed data cleaned for session', { sessionId });
            }
        } else {
            // 清理所有会话的压缩数据
            sessions.forEach(session => {
                if (session.contextInfo) {
                    session.contextInfo = undefined;
                }
            });
            this.sessionsSubject.next([...sessions]);
            this.saveToStorage(sessions);
            this.logger.info('All compressed data cleaned');
        }
    }

    /**
     * 获取压缩统计信息
     */
    getCompressionStatistics(): {
        totalSessions: number;
        sessionsWithCompression: number;
        totalTokensSaved: number;
        averageTokensSaved: number;
        lastCompactionAt?: Date;
        compactionHistory: Array<{
            sessionId: string;
            type: 'prune' | 'compact' | 'truncate';
            timestamp: Date;
            tokensSaved: number;
        }>;
    } {
        const sessions = this.sessionsSubject.value;
        const sessionsWithCompression = sessions.filter(s => s.contextInfo?.hasCompression);
        let totalTokensSaved = 0;
        const allCompactionEvents: Array<{
            sessionId: string;
            type: 'prune' | 'compact' | 'truncate';
            timestamp: Date;
            tokensSaved: number;
        }> = [];
        let lastCompactionAt: Date | undefined;

        sessionsWithCompression.forEach(session => {
            if (session.contextInfo?.compactionHistory) {
                session.contextInfo.compactionHistory.forEach(event => {
                    totalTokensSaved += event.tokensSaved;
                    allCompactionEvents.push({
                        sessionId: session.sessionId,
                        type: event.type,
                        timestamp: event.timestamp,
                        tokensSaved: event.tokensSaved
                    });

                    if (!lastCompactionAt || event.timestamp > lastCompactionAt) {
                        lastCompactionAt = event.timestamp;
                    }
                });
            }
        });

        return {
            totalSessions: sessions.length,
            sessionsWithCompression: sessionsWithCompression.length,
            totalTokensSaved,
            averageTokensSaved: sessionsWithCompression.length > 0
                ? Math.round(totalTokensSaved / sessionsWithCompression.length)
                : 0,
            lastCompactionAt,
            compactionHistory: allCompactionEvents
        };
    }

    /**
     * 记录压缩事件
     */
    recordCompactionEvent(
        sessionId: string,
        type: 'prune' | 'compact' | 'truncate',
        tokensSaved: number,
        condenseId?: string
    ): void {
        const sessions = this.sessionsSubject.value;
        const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);

        if (sessionIndex >= 0) {
            const session = sessions[sessionIndex];
            const contextInfo = session.contextInfo || {};

            const compactionHistory = contextInfo.compactionHistory || [];
            compactionHistory.push({
                timestamp: new Date(),
                type,
                tokensSaved,
                condenseId
            });

            sessions[sessionIndex] = {
                ...session,
                contextInfo: {
                    ...contextInfo,
                    hasCompression: true,
                    lastCompactionAt: new Date(),
                    compactionHistory
                }
            };

            this.sessionsSubject.next([...sessions]);
            this.saveToStorage(sessions);
            this.logger.info('Compaction event recorded', { sessionId, type, tokensSaved });
        }
    }

    /**
     * 检查会话是否有压缩标记
     */
    hasCompressionMarkers(sessionId: string): boolean {
        const session = this.loadSession(sessionId);
        return session?.contextInfo?.hasCompression || false;
    }

    /**
     * 获取会话的压缩历史
     */
    getCompactionHistory(sessionId: string): Array<{
        timestamp: Date;
        type: 'prune' | 'compact' | 'truncate';
        tokensSaved: number;
        condenseId?: string;
    }> {
        const session = this.loadSession(sessionId);
        return session?.contextInfo?.compactionHistory || [];
    }

    /**
     * 更新Token使用统计
     */
    updateTokenUsage(sessionId: string, tokenUsage?: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
    }): void {
        const sessions = this.sessionsSubject.value;
        const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);

        if (sessionIndex >= 0) {
            const session = sessions[sessionIndex];
            sessions[sessionIndex] = {
                ...session,
                contextInfo: {
                    ...session.contextInfo,
                    tokenUsage
                }
            };
            this.sessionsSubject.next([...sessions]);
            this.saveToStorage(sessions);
        }
    }
}
