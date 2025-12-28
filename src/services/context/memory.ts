import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import { ApiMessage } from '../../types/ai.types';
import { SummaryService } from './summary.service';

/**
 * 记忆层类型
 */
export enum MemoryLayer {
    SHORT_TERM = 'short_term',   // 短期记忆：当前会话
    MID_TERM = 'mid_term',       // 中期记忆：跨会话摘要
    LONG_TERM = 'long_term'      // 长期记忆：项目级知识
}

/**
 * 记忆项接口
 */
export interface MemoryItem {
    id: string;
    layer: MemoryLayer;
    content: string;
    metadata: {
        timestamp: number;
        sessionId?: string;
        importance: number; // 0-1 重要性评分
        tags?: string[];
        source?: string;
    };
    accessCount: number;
    lastAccessed: number;
}

/**
 * 记忆摘要
 */
export interface MemorySummary {
    id: string;
    layer: MemoryLayer;
    summary: string;
    keyPoints: string[];
    createdAt: number;
    relatedMemories: string[]; // 相关记忆ID列表
}

/**
 * 记忆统计信息
 */
export interface MemoryStatistics {
    totalItems: number;
    shortTermCount: number;
    midTermCount: number;
    longTermCount: number;
    totalAccessCount: number;
    averageImportance: number;
    oldestMemory?: Date;
    newestMemory?: Date;
}

/**
 * 三层记忆系统
 * 实现 Claude Code 架构的记忆管理
 */
@Injectable({
    providedIn: 'root'
})
export class Memory {
    private shortTermMemories: Map<string, MemoryItem> = new Map();
    private midTermMemories: Map<string, MemoryItem> = new Map();
    private longTermMemories: Map<string, MemoryItem> = new Map();

    // LRU缓存管理
    private readonly MAX_SHORT_TERM_ITEMS = 100;
    private readonly MAX_MID_TERM_ITEMS = 50;
    private readonly MAX_LONG_TERM_ITEMS = 20;

    // 重要性阈值
    private readonly IMPORTANCE_THRESHOLD = 0.7;

    constructor(
        private logger: LoggerService,
        private summaryService: SummaryService
    ) {
        this.logger.info('Memory system initialized');
        this.loadFromStorage();
    }

    /**
     * 存储记忆
     */
    store(content: string, layer: MemoryLayer, metadata: Partial<MemoryItem['metadata']> = {}): string {
        const memoryId = this.generateMemoryId();
        const memory: MemoryItem = {
            id: memoryId,
            layer,
            content,
            metadata: {
                timestamp: Date.now(),
                importance: 0.5,
                tags: [],
                ...metadata
            },
            accessCount: 0,
            lastAccessed: Date.now()
        };

        // 根据层级存储
        switch (layer) {
            case MemoryLayer.SHORT_TERM:
                this.shortTermMemories.set(memoryId, memory);
                this.enforceLimit(this.shortTermMemories, this.MAX_SHORT_TERM_ITEMS);
                break;

            case MemoryLayer.MID_TERM:
                this.midTermMemories.set(memoryId, memory);
                this.enforceLimit(this.midTermMemories, this.MAX_MID_TERM_ITEMS);
                break;

            case MemoryLayer.LONG_TERM:
                this.longTermMemories.set(memoryId, memory);
                this.enforceLimit(this.longTermMemories, this.MAX_LONG_TERM_ITEMS);
                break;
        }

        // 持久化存储
        this.saveToStorage();

        this.logger.info('Memory stored', {
            id: memoryId,
            layer,
            contentLength: content.length
        });

        return memoryId;
    }

    /**
     * 检索记忆
     */
    retrieve(memoryId: string): MemoryItem | undefined {
        // 在所有层级中查找
        const memory = this.shortTermMemories.get(memoryId) ||
                      this.midTermMemories.get(memoryId) ||
                      this.longTermMemories.get(memoryId);

        if (memory) {
            // 更新访问统计
            memory.accessCount++;
            memory.lastAccessed = Date.now();

            // 重要性提升（基于访问次数）
            memory.metadata.importance = Math.min(1, memory.metadata.importance + 0.01);

            this.logger.debug('Memory retrieved', { id: memoryId });
            this.saveToStorage();
        }

        return memory;
    }

    /**
     * 搜索记忆
     */
    search(query: string, layer?: MemoryLayer): MemoryItem[] {
        const results: MemoryItem[] = [];
        const searchTerms = query.toLowerCase().split(' ');

        const searchInMap = (memories: Map<string, MemoryItem>) => {
            memories.forEach(memory => {
                const searchableText = `${memory.content} ${memory.metadata.tags?.join(' ') || ''}`.toLowerCase();
                const matchScore = searchTerms.reduce((score, term) => {
                    return score + (searchableText.includes(term) ? 1 : 0);
                }, 0);

                if (matchScore > 0) {
                    results.push({
                        ...memory,
                        metadata: {
                            ...memory.metadata,
                            importance: memory.metadata.importance * (matchScore / searchTerms.length)
                        }
                    });
                }
            });
        };

        if (layer) {
            switch (layer) {
                case MemoryLayer.SHORT_TERM:
                    searchInMap(this.shortTermMemories);
                    break;
                case MemoryLayer.MID_TERM:
                    searchInMap(this.midTermMemories);
                    break;
                case MemoryLayer.LONG_TERM:
                    searchInMap(this.longTermMemories);
                    break;
            }
        } else {
            // 搜索所有层级
            searchInMap(this.shortTermMemories);
            searchInMap(this.midTermMemories);
            searchInMap(this.longTermMemories);
        }

        // 按相关性和重要性排序
        return results.sort((a, b) => {
            // 首先按重要性排序
            if (Math.abs(a.metadata.importance - b.metadata.importance) > 0.1) {
                return b.metadata.importance - a.metadata.importance;
            }
            // 然后按访问次数排序
            return b.accessCount - a.accessCount;
        });
    }

    /**
     * 从消息创建记忆
     */
    createFromMessages(messages: ApiMessage[], layer: MemoryLayer): string[] {
        const memoryIds: string[] = [];

        for (const message of messages) {
            if (message.role === 'user' || message.role === 'assistant') {
                const content = typeof message.content === 'string'
                    ? message.content
                    : JSON.stringify(message.content);

                // 只保存较长的消息作为记忆
                if (content.length > 50) {
                    const memoryId = this.store(content, layer, {
                        timestamp: message.ts,
                        source: 'message'
                    });
                    memoryIds.push(memoryId);
                }
            }
        }

        this.logger.info('Created memories from messages', {
            messageCount: messages.length,
            memoryCount: memoryIds.length,
            layer
        });

        return memoryIds;
    }

    /**
     * 生成中期记忆摘要
     */
    async createMidTermSummary(sessionId: string): Promise<string> {
        // 获取短期记忆中的相关消息
        const sessionMemories = this.search('', MemoryLayer.SHORT_TERM)
            .filter(m => m.metadata.sessionId === sessionId);

        if (sessionMemories.length === 0) {
            return '无相关记忆';
        }

        // 将记忆转换为ApiMessage格式供AI摘要生成
        const messages: ApiMessage[] = sessionMemories.map(m => ({
            role: m.content.includes('assistant:') ? 'assistant' as const : 'user' as const,
            content: m.content,
            ts: m.metadata.timestamp
        }));

        // 使用AI生成摘要
        const summaryResult = await this.summaryService.generateSummary(messages);
        const summary = summaryResult.summary;

        // 保存为中期记忆
        const midTermId = this.store(summary, MemoryLayer.MID_TERM, {
            sessionId,
            importance: 0.8,
            tags: ['summary', 'session']
        });

        this.logger.info('Created mid-term summary', {
            sessionId,
            summaryLength: summary.length,
            originalMessageCount: summaryResult.originalMessageCount,
            tokensCost: summaryResult.tokensCost,
            memoryId: midTermId
        });

        return summary;
    }

    /**
     * 保存到长期记忆（项目级）
     */
    saveToLongTerm(content: string, metadata: Partial<MemoryItem['metadata']> = {}): string {
        return this.store(content, MemoryLayer.LONG_TERM, {
            importance: 0.9,
            tags: ['project', ...(metadata.tags || [])],
            ...metadata
        });
    }

    /**
     * 从长期记忆加载
     */
    loadFromLongTerm(query?: string): MemoryItem[] {
        if (query) {
            return this.search(query, MemoryLayer.LONG_TERM);
        }
        return Array.from(this.longTermMemories.values());
    }

    /**
     * 获取记忆统计
     */
    getStatistics(): MemoryStatistics {
        const allMemories = [
            ...this.shortTermMemories.values(),
            ...this.midTermMemories.values(),
            ...this.longTermMemories.values()
        ];

        const totalAccessCount = allMemories.reduce((sum, m) => sum + m.accessCount, 0);
        const averageImportance = allMemories.length > 0
            ? allMemories.reduce((sum, m) => sum + m.metadata.importance, 0) / allMemories.length
            : 0;

        const timestamps = allMemories.map(m => m.metadata.timestamp);
        const oldestMemory = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
        const newestMemory = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

        return {
            totalItems: allMemories.length,
            shortTermCount: this.shortTermMemories.size,
            midTermCount: this.midTermMemories.size,
            longTermCount: this.longTermMemories.size,
            totalAccessCount,
            averageImportance,
            oldestMemory,
            newestMemory
        };
    }

    /**
     * 清理过期记忆
     */
    cleanup(): number {
        const now = Date.now();
        const DAY_IN_MS = 24 * 60 * 60 * 1000;

        let cleanedCount = 0;

        // 清理短期记忆（超过7天且低重要性）
        this.shortTermMemories.forEach((memory, id) => {
            const age = now - memory.metadata.timestamp;
            const isOld = age > 7 * DAY_IN_MS;
            const isLowImportance = memory.metadata.importance < 0.3;
            const isRarelyAccessed = memory.accessCount < 2;

            if (isOld && isLowImportance && isRarelyAccessed) {
                this.shortTermMemories.delete(id);
                cleanedCount++;
            }
        });

        // 清理中期记忆（超过30天且低重要性）
        this.midTermMemories.forEach((memory, id) => {
            const age = now - memory.metadata.timestamp;
            const isOld = age > 30 * DAY_IN_MS;
            const isLowImportance = memory.metadata.importance < 0.5;

            if (isOld && isLowImportance) {
                this.midTermMemories.delete(id);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            this.saveToStorage();
            this.logger.info('Cleaned up memories', { cleanedCount });
        }

        return cleanedCount;
    }

    /**
     * 清空指定层级
     */
    clearLayer(layer: MemoryLayer): void {
        switch (layer) {
            case MemoryLayer.SHORT_TERM:
                this.shortTermMemories.clear();
                break;
            case MemoryLayer.MID_TERM:
                this.midTermMemories.clear();
                break;
            case MemoryLayer.LONG_TERM:
                this.longTermMemories.clear();
                break;
        }

        this.saveToStorage();
        this.logger.info('Cleared memory layer', { layer });
    }

    /**
     * 获取相关记忆
     */
    getRelatedMemories(memoryId: string): MemoryItem[] {
        const memory = this.retrieve(memoryId);
        if (!memory) {
            return [];
        }

        // 基于标签和内容相似性查找相关记忆
        const allMemories = [
            ...this.shortTermMemories.values(),
            ...this.midTermMemories.values(),
            ...this.longTermMemories.values()
        ];

        return allMemories.filter(m => {
            if (m.id === memoryId) return false;

            // 标签匹配
            const commonTags = (m.metadata.tags || []).filter(tag =>
                memory.metadata.tags?.includes(tag)
            );

            if (commonTags.length > 0) {
                return true;
            }

            // 内容相似性（简化版）
            const similarity = this.calculateSimilarity(memory.content, m.content);
            return similarity > 0.3;
        }).slice(0, 10); // 最多返回10个相关记忆
    }

    // ==================== 私有方法 ====================

    private generateMemoryId(): string {
        return `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private enforceLimit(memories: Map<string, MemoryItem>, maxItems: number): void {
        if (memories.size <= maxItems) {
            return;
        }

        // 按访问时间和重要性排序，删除最不重要的
        const sorted = Array.from(memories.entries()).sort((a, b) => {
            const scoreA = a[1].metadata.importance * (1 / (a[1].accessCount + 1));
            const scoreB = b[1].metadata.importance * (1 / (b[1].accessCount + 1));
            return scoreA - scoreB;
        });

        const toDelete = sorted.slice(0, memories.size - maxItems);
        toDelete.forEach(([id]) => memories.delete(id));
    }

    private calculateSimilarity(text1: string, text2: string): number {
        // 简化的文本相似性计算
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    private saveToStorage(): void {
        try {
            const data = {
                shortTerm: Array.from(this.shortTermMemories.entries()),
                midTerm: Array.from(this.midTermMemories.entries()),
                longTerm: Array.from(this.longTermMemories.entries())
            };
            localStorage.setItem('tabby-ai-assistant-memories', JSON.stringify(data));
        } catch (error) {
            this.logger.error('Failed to save memories to storage', error);
        }
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem('tabby-ai-assistant-memories');
            if (stored) {
                const data = JSON.parse(stored);

                this.shortTermMemories = new Map(data.shortTerm || []);
                this.midTermMemories = new Map(data.midTerm || []);
                this.longTermMemories = new Map(data.longTerm || []);

                this.logger.info('Loaded memories from storage', {
                    shortTerm: this.shortTermMemories.size,
                    midTerm: this.midTermMemories.size,
                    longTerm: this.longTermMemories.size
                });
            }
        } catch (error) {
            this.logger.error('Failed to load memories from storage', error);
        }
    }
}
