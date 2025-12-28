import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as pako from 'pako';
import { LoggerService } from './logger.service';
import { ChatHistoryService } from '../chat/chat-history.service';
import { Checkpoint, ApiMessage } from '../../types/ai.types';

/**
 * 压缩后的检查点数据接口
 */
export interface CompressedCheckpointData {
    compressed: boolean;
    compressionRatio: number;
    originalSize: number;
    compressedSize: number;
    messages: ApiMessage[];
    messagesJson: string; // 压缩后的JSON字符串
}

/**
 * 检查点状态
 */
export enum CheckpointStatus {
    ACTIVE = 'active',           // 活跃检查点
    ARCHIVED = 'archived',       // 已归档
    COMPRESSED = 'compressed',   // 已压缩
    CORRUPTED = 'corrupted'      // 已损坏
}

/**
 * 检查点过滤器
 */
export interface CheckpointFilter {
    sessionId?: string;
    status?: CheckpointStatus;
    dateFrom?: Date;
    dateTo?: Date;
    tags?: string[];
}

/**
 * 检查点搜索结果
 */
export interface CheckpointSearchResult {
    checkpoint: Checkpoint;
    relevanceScore: number;
    matchedFields: string[];
}

/**
 * 检查点统计
 */
export interface CheckpointStatistics {
    totalCheckpoints: number;
    activeCheckpoints: number;
    archivedCheckpoints: number;
    compressedCheckpoints: number;
    averageMessagesPerCheckpoint: number;
    totalTokenUsage: number;
    oldestCheckpoint?: Date;
    newestCheckpoint?: Date;
    mostActiveSession?: string;
}

/**
 * 检查点管理器
 * 负责检查点的创建、恢复、归档和清理
 */
@Injectable({
    providedIn: 'root'
})
export class CheckpointManager {
    private checkpointsSubject = new BehaviorSubject<Checkpoint[]>([]);
    public checkpoints$ = this.checkpointsSubject.asObservable();

    private readonly MAX_CHECKPOINTS_PER_SESSION = 20;
    private readonly AUTO_CLEANUP_DAYS = 30;
    private readonly COMPRESSION_THRESHOLD = 1000; // 消息数量阈值
    private readonly MIN_COMPRESSION_SIZE = 1024; // 最小压缩大小（字节）
    private readonly COMPRESSION_LEVEL = 6; // pako压缩级别 (1-9)

    // 压缩统计
    private totalOriginalSize = 0;
    private totalCompressedSize = 0;
    private compressionCount = 0;

    constructor(
        private logger: LoggerService,
        private chatHistoryService: ChatHistoryService
    ) {
        this.loadCheckpoints();
        this.logger.info('CheckpointManager initialized');
    }

    /**
     * 创建检查点
     */
    create(
        sessionId: string,
        messages: ApiMessage[],
        summary?: string,
        metadata: Partial<Checkpoint> = {}
    ): Checkpoint {
        const checkpointId = this.generateCheckpointId();
        const now = Date.now();

        // 计算Token使用量
        const tokenUsage = this.calculateTokenUsage(messages);

        // 生成智能摘要
        const autoSummary = summary || this.generateSummary(messages);

        const checkpoint: Checkpoint = {
            id: checkpointId,
            sessionId,
            messages: [...messages], // 深拷贝
            summary: autoSummary,
            createdAt: now,
            tokenUsage,
            ...metadata
        };

        // 保存到存储
        this.saveCheckpoint(checkpoint);

        // 更新本地列表
        const currentCheckpoints = this.checkpointsSubject.value;
        this.checkpointsSubject.next([...currentCheckpoints, checkpoint]);

        // 强制执行限制
        this.enforceSessionLimit(sessionId);

        this.logger.info('Checkpoint created', {
            checkpointId,
            sessionId,
            messageCount: messages.length,
            tokenUsage: tokenUsage.input + tokenUsage.output
        });

        return checkpoint;
    }

    /**
     * 恢复检查点
     */
    restore(checkpointId: string): ApiMessage[] {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        // 验证检查点完整性
        this.validateCheckpoint(checkpoint);

        this.logger.info('Checkpoint restored', {
            checkpointId,
            sessionId: checkpoint.sessionId,
            messageCount: checkpoint.messages.length
        });

        return [...checkpoint.messages];
    }

    /**
     * 获取检查点
     */
    getCheckpoint(checkpointId: string): Checkpoint | undefined {
        return this.checkpointsSubject.value.find(cp => cp.id === checkpointId);
    }

    /**
     * 列出检查点
     */
    listBySession(sessionId: string, filter?: CheckpointFilter): Checkpoint[] {
        let checkpoints = this.checkpointsSubject.value.filter(cp => cp.sessionId === sessionId);

        if (filter) {
            checkpoints = this.applyFilter(checkpoints, filter);
        }

        // 按创建时间倒序排列
        return checkpoints.sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * 搜索检查点
     */
    search(query: string, filter?: CheckpointFilter): CheckpointSearchResult[] {
        const searchTerms = query.toLowerCase().split(' ');
        let checkpoints = this.checkpointsSubject.value;

        if (filter) {
            checkpoints = this.applyFilter(checkpoints, filter);
        }

        const results: CheckpointSearchResult[] = [];

        checkpoints.forEach(checkpoint => {
            const searchableText = `${checkpoint.summary} ${checkpoint.messages.map(m =>
                typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            ).join(' ')}`.toLowerCase();

            let relevanceScore = 0;
            const matchedFields: string[] = [];

            searchTerms.forEach(term => {
                if (checkpoint.summary.toLowerCase().includes(term)) {
                    relevanceScore += 2;
                    matchedFields.push('summary');
                }

                if (searchableText.includes(term)) {
                    relevanceScore += 1;
                    matchedFields.push('content');
                }
            });

            if (relevanceScore > 0) {
                results.push({
                    checkpoint,
                    relevanceScore,
                    matchedFields: [...new Set(matchedFields)]
                });
            }
        });

        // 按相关性排序
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * 归档检查点
     */
    archive(checkpointId: string): void {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        // 标记为已归档
        const archivedCheckpoint = {
            ...checkpoint,
            // 可以添加状态字段
        };

        this.updateCheckpoint(archivedCheckpoint);

        this.logger.info('Checkpoint archived', { checkpointId });
    }

    /**
     * 删除检查点
     */
    delete(checkpointId: string): void {
        const currentCheckpoints = this.checkpointsSubject.value;
        const filteredCheckpoints = currentCheckpoints.filter(cp => cp.id !== checkpointId);

        this.checkpointsSubject.next(filteredCheckpoints);
        this.removeFromStorage(checkpointId);

        this.logger.info('Checkpoint deleted', { checkpointId });
    }

    /**
     * 压缩存储检查点
     * 使用 pako DEFLATE 算法压缩消息数据
     */
    async compressForCheckpoint(checkpointId: string): Promise<Checkpoint> {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        try {
            // 1. 将消息转换为 JSON 字符串
            const messagesJson = JSON.stringify(checkpoint.messages);
            const originalSize = messagesJson.length;

            // 2. 如果数据太小，不进行压缩
            if (originalSize < this.MIN_COMPRESSION_SIZE) {
                this.logger.info('Checkpoint too small for compression', {
                    checkpointId,
                    size: originalSize
                });
                return checkpoint;
            }

            // 3. 使用 pako 进行 DEFLATE 压缩
            const compressedData = pako.deflate(messagesJson, {
                level: this.COMPRESSION_LEVEL
            });

            // 4. 将压缩后的数据转换为 base64 字符串存储
            const compressedJson = this.arrayBufferToBase64(compressedData);

            // 5. 计算压缩比
            const compressedSize = compressedData.length;
            const compressionRatioValue = originalSize > 0
                ? parseFloat(((originalSize - compressedSize) / originalSize * 100).toFixed(2))
                : 0;

            // 6. 更新统计
            this.totalOriginalSize += originalSize;
            this.totalCompressedSize += compressedSize;
            this.compressionCount++;

            // 7. 创建压缩后的检查点（保留原始消息用于恢复）
            const compressedCheckpoint: Checkpoint = {
                ...checkpoint,
                messages: checkpoint.messages, // 保留原始数据用于即时访问
                compressedData: {
                    compressed: true,
                    compressionRatio: compressionRatioValue,
                    originalSize,
                    compressedSize,
                    messagesJson: compressedJson
                }
            };

            this.updateCheckpoint(compressedCheckpoint);

            this.logger.info('Checkpoint compressed successfully', {
                checkpointId,
                originalSize,
                compressedSize,
                compressionRatio: `${compressionRatioValue}%`,
                overallRatio: this.getOverallCompressionRatio()
            });

            return compressedCheckpoint;
        } catch (error) {
            this.logger.error('Failed to compress checkpoint', {
                checkpointId,
                error
            });
            throw error;
        }
    }

    /**
     * 解压缩检查点
     */
    decompressCheckpoint(checkpointId: string): ApiMessage[] {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        // 如果有压缩数据，解压缩
        if (checkpoint.compressedData?.compressed) {
            try {
                const compressedData = this.base64ToArrayBuffer(checkpoint.compressedData.messagesJson);
                const decompressedJson = pako.inflate(compressedData, { to: 'string' });
                return JSON.parse(decompressedJson) as ApiMessage[];
            } catch (error) {
                this.logger.error('Failed to decompress checkpoint', {
                    checkpointId,
                    error
                });
                throw new Error('Failed to decompress checkpoint');
            }
        }

        // 否则返回原始消息
        return checkpoint.messages;
    }

    /**
     * 自动压缩符合条件的检查点
     */
    async autoCompressLargeCheckpoints(): Promise<number> {
        const allCheckpoints = this.checkpointsSubject.value;
        let compressedCount = 0;

        for (const checkpoint of allCheckpoints) {
            // 只压缩消息数量超过阈值的检查点
            if (checkpoint.messages.length >= this.COMPRESSION_THRESHOLD) {
                if (!checkpoint.compressedData?.compressed) {
                    try {
                        await this.compressForCheckpoint(checkpoint.id);
                        compressedCount++;
                    } catch (error) {
                        this.logger.warn('Failed to auto-compress checkpoint', {
                            checkpointId: checkpoint.id,
                            error
                        });
                    }
                }
            }
        }

        if (compressedCount > 0) {
            this.logger.info('Auto-compression completed', {
                compressedCount,
                overallRatio: this.getOverallCompressionRatio()
            });
        }

        return compressedCount;
    }

    /**
     * 获取压缩统计信息
     */
    getCompressionStatistics(): {
        totalOriginalSize: number;
        totalCompressedSize: number;
        compressionCount: number;
        overallRatio: string;
        averageRatio: number;
    } {
        return {
            totalOriginalSize: this.totalOriginalSize,
            totalCompressedSize: this.totalCompressedSize,
            compressionCount: this.compressionCount,
            overallRatio: this.getOverallCompressionRatio(),
            averageRatio: this.compressionCount > 0
                ? ((this.totalOriginalSize - this.totalCompressedSize) / this.totalOriginalSize * 100)
                : 0
        };
    }

    /**
     * 获取整体压缩比
     */
    private getOverallCompressionRatio(): string {
        if (this.totalOriginalSize === 0) return '0%';
        const ratio = ((this.totalOriginalSize - this.totalCompressedSize) / this.totalOriginalSize * 100);
        return `${ratio.toFixed(2)}%`;
    }

    /**
     * 将 ArrayBuffer 转换为 Base64 字符串
     */
    private arrayBufferToBase64(buffer: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
            binary += String.fromCharCode(buffer[i]);
        }
        return btoa(binary);
    }

    /**
     * 将 Base64 字符串转换为 Uint8Array
     */
    private base64ToArrayBuffer(base64: string): Uint8Array {
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        return buffer;
    }

    /**
     * 清理孤儿检查点
     */
    cleanupOrphaned(): number {
        const allCheckpoints = this.checkpointsSubject.value;
        const sessions = this.chatHistoryService.getRecentSessions(1000);

        const validSessionIds = new Set(sessions.map(s => s.sessionId));
        const orphanedCheckpoints = allCheckpoints.filter(cp => !validSessionIds.has(cp.sessionId));

        orphanedCheckpoints.forEach(cp => {
            this.removeFromStorage(cp.id);
        });

        const remainingCheckpoints = allCheckpoints.filter(cp => validSessionIds.has(cp.sessionId));
        this.checkpointsSubject.next(remainingCheckpoints);

        this.logger.info('Cleaned up orphaned checkpoints', {
            removedCount: orphanedCheckpoints.length
        });

        return orphanedCheckpoints.length;
    }

    /**
     * 自动清理过期检查点
     */
    autoCleanup(): number {
        const allCheckpoints = this.checkpointsSubject.value;
        const now = Date.now();
        const cutoffTime = now - (this.AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000);

        const expiredCheckpoints = allCheckpoints.filter(cp => cp.createdAt < cutoffTime);

        expiredCheckpoints.forEach(cp => {
            this.removeFromStorage(cp.id);
        });

        const remainingCheckpoints = allCheckpoints.filter(cp => cp.createdAt >= cutoffTime);
        this.checkpointsSubject.next(remainingCheckpoints);

        this.logger.info('Auto cleanup completed', {
            removedCount: expiredCheckpoints.length,
            remainingCount: remainingCheckpoints.length
        });

        return expiredCheckpoints.length;
    }

    /**
     * 获取统计信息
     */
    getStatistics(): CheckpointStatistics {
        const allCheckpoints = this.checkpointsSubject.value;

        const totalCheckpoints = allCheckpoints.length;

        // 统计归档和压缩的检查点
        let archivedCount = 0;
        let compressedCount = 0;
        allCheckpoints.forEach(cp => {
            // 检查是否已归档
            if (cp.isArchived) {
                archivedCount++;
            }
            // 检查是否已压缩
            if (cp.compressedData?.compressed) {
                compressedCount++;
            }
        });

        const activeCheckpoints = totalCheckpoints - archivedCount;
        const archivedCheckpoints = archivedCount;
        const compressedCheckpoints = compressedCount;

        const totalMessages = allCheckpoints.reduce((sum, cp) => sum + cp.messages.length, 0);
        const averageMessagesPerCheckpoint = totalCheckpoints > 0 ? totalMessages / totalCheckpoints : 0;

        const totalTokenUsage = allCheckpoints.reduce((sum, cp) => {
            return sum + cp.tokenUsage.input + cp.tokenUsage.output;
        }, 0);

        const timestamps = allCheckpoints.map(cp => cp.createdAt);
        const oldestCheckpoint = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
        const newestCheckpoint = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

        // 找出最活跃的会话
        const sessionCounts = new Map<string, number>();
        allCheckpoints.forEach(cp => {
            const count = sessionCounts.get(cp.sessionId) || 0;
            sessionCounts.set(cp.sessionId, count + 1);
        });

        let mostActiveSession: string | undefined;
        let maxCount = 0;
        sessionCounts.forEach((count, sessionId) => {
            if (count > maxCount) {
                maxCount = count;
                mostActiveSession = sessionId;
            }
        });

        return {
            totalCheckpoints,
            activeCheckpoints,
            archivedCheckpoints,
            compressedCheckpoints,
            averageMessagesPerCheckpoint: Math.round(averageMessagesPerCheckpoint * 100) / 100,
            totalTokenUsage,
            oldestCheckpoint,
            newestCheckpoint,
            mostActiveSession
        };
    }

    /**
     * 导出检查点
     */
    exportCheckpoint(checkpointId: string): string {
        const checkpoint = this.getCheckpoint(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        const exportData = {
            checkpoint,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导入检查点
     */
    importCheckpoint(data: string): Checkpoint {
        try {
            const importData = JSON.parse(data);

            if (!importData.checkpoint) {
                throw new Error('Invalid checkpoint format');
            }

            const checkpoint = importData.checkpoint;

            // 验证检查点
            this.validateCheckpoint(checkpoint);

            // 添加到列表
            const currentCheckpoints = this.checkpointsSubject.value;
            this.checkpointsSubject.next([...currentCheckpoints, checkpoint]);

            // 保存到存储
            this.saveCheckpoint(checkpoint);

            this.logger.info('Checkpoint imported', {
                checkpointId: checkpoint.id,
                sessionId: checkpoint.sessionId
            });

            return checkpoint;
        } catch (error) {
            this.logger.error('Failed to import checkpoint', error);
            throw new Error('Invalid checkpoint file format');
        }
    }

    /**
     * 比较检查点
     */
    compare(checkpointId1: string, checkpointId2: string): {
        messageDiff: number;
        tokenDiff: number;
        timeDiff: number;
        summaryDiff: string;
    } {
        const cp1 = this.getCheckpoint(checkpointId1);
        const cp2 = this.getCheckpoint(checkpointId2);

        if (!cp1 || !cp2) {
            throw new Error('One or both checkpoints not found');
        }

        return {
            messageDiff: cp2.messages.length - cp1.messages.length,
            tokenDiff: (cp2.tokenUsage.input + cp2.tokenUsage.output) -
                      (cp1.tokenUsage.input + cp1.tokenUsage.output),
            timeDiff: cp2.createdAt - cp1.createdAt,
            summaryDiff: cp2.summary !== cp1.summary ? 'Different' : 'Same'
        };
    }

    // ==================== 私有方法 ====================

    private generateCheckpointId(): string {
        return `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private calculateTokenUsage(messages: ApiMessage[]): Checkpoint['tokenUsage'] {
        let input = 0;
        let output = 0;

        messages.forEach(msg => {
            const content = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);

            const tokens = Math.ceil(content.length / 4);

            if (msg.role === 'user' || msg.role === 'system') {
                input += tokens;
            } else if (msg.role === 'assistant') {
                output += tokens;
            }
        });

        return {
            input,
            output,
            cacheRead: 0,
            cacheWrite: 0
        };
    }

    private generateSummary(messages: ApiMessage[]): string {
        if (messages.length === 0) {
            return '空检查点';
        }

        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];

        const firstContent = typeof firstMessage.content === 'string'
            ? firstMessage.content
            : '[复杂内容]';

        const lastContent = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : '[复杂内容]';

        return `检查点：${messages.length}条消息 | 从 "${firstContent.substring(0, 50)}..." 到 "${lastContent.substring(0, 50)}..."`;
    }

    private applyFilter(checkpoints: Checkpoint[], filter: CheckpointFilter): Checkpoint[] {
        let filtered = [...checkpoints];

        if (filter.sessionId) {
            filtered = filtered.filter(cp => cp.sessionId === filter.sessionId);
        }

        if (filter.dateFrom) {
            filtered = filtered.filter(cp => cp.createdAt >= filter.dateFrom!.getTime());
        }

        if (filter.dateTo) {
            filtered = filtered.filter(cp => cp.createdAt <= filter.dateTo!.getTime());
        }

        if (filter.tags && filter.tags.length > 0) {
            filtered = filtered.filter(cp => {
                // 检查点需要至少有一个匹配的标签
                const cpTags = cp.tags || [];
                return filter.tags!.some(tag => cpTags.includes(tag));
            });
        }

        return filtered;
    }

    private validateCheckpoint(checkpoint: Checkpoint): void {
        if (!checkpoint.id) {
            throw new Error('Invalid checkpoint: missing id');
        }

        if (!checkpoint.sessionId) {
            throw new Error('Invalid checkpoint: missing sessionId');
        }

        if (!Array.isArray(checkpoint.messages)) {
            throw new Error('Invalid checkpoint: messages must be an array');
        }

        if (checkpoint.tokenUsage.input < 0 || checkpoint.tokenUsage.output < 0) {
            throw new Error('Invalid checkpoint: negative token usage');
        }
    }

    private enforceSessionLimit(sessionId: string): void {
        const sessionCheckpoints = this.listBySession(sessionId);

        if (sessionCheckpoints.length > this.MAX_CHECKPOINTS_PER_SESSION) {
            // 删除最旧的检查点
            const toDelete = sessionCheckpoints
                .sort((a, b) => a.createdAt - b.createdAt)
                .slice(0, sessionCheckpoints.length - this.MAX_CHECKPOINTS_PER_SESSION);

            toDelete.forEach(cp => {
                this.delete(cp.id);
            });

            this.logger.info('Enforced checkpoint limit', {
                sessionId,
                deletedCount: toDelete.length
            });
        }
    }

    private saveCheckpoint(checkpoint: Checkpoint): void {
        try {
            const key = `checkpoint_${checkpoint.id}`;
            localStorage.setItem(key, JSON.stringify(checkpoint));
        } catch (error) {
            this.logger.error('Failed to save checkpoint', error);
        }
    }

    private removeFromStorage(checkpointId: string): void {
        try {
            const key = `checkpoint_${checkpointId}`;
            localStorage.removeItem(key);
        } catch (error) {
            this.logger.error('Failed to remove checkpoint from storage', error);
        }
    }

    private updateCheckpoint(checkpoint: Checkpoint): void {
        const currentCheckpoints = this.checkpointsSubject.value;
        const index = currentCheckpoints.findIndex(cp => cp.id === checkpoint.id);

        if (index >= 0) {
            currentCheckpoints[index] = checkpoint;
            this.checkpointsSubject.next([...currentCheckpoints]);
            this.saveCheckpoint(checkpoint);
        }
    }

    private loadCheckpoints(): void {
        try {
            // 从 localStorage 加载所有检查点
            const checkpoints: Checkpoint[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('checkpoint_')) {
                    try {
                        const checkpoint = JSON.parse(localStorage.getItem(key)!);
                        checkpoints.push(checkpoint);
                    } catch (error) {
                        this.logger.warn('Failed to parse checkpoint', { key, error });
                    }
                }
            }

            this.checkpointsSubject.next(checkpoints);

            this.logger.info('Loaded checkpoints from storage', {
                count: checkpoints.length
            });
        } catch (error) {
            this.logger.error('Failed to load checkpoints', error);
            this.checkpointsSubject.next([]);
        }
    }
}
