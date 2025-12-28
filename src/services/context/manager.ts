import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import { ConfigProviderService } from '../core/config-provider.service';
import { ChatHistoryService, SavedSession } from '../chat/chat-history.service';
import { SummaryService } from './summary.service';
import { calculateCost, formatCost } from '../../utils/cost.utils';
import {
    ApiMessage,
    ContextConfig,
    DEFAULT_CONTEXT_CONFIG,
    TokenUsage,
    CompactionResult,
    PruneResult,
    TruncationResult,
    ChatMessage
} from '../../types/ai.types';

/**
 * 上下文管理器 - 上下文工程的核心组件
 * 负责Token预算管理、压缩触发决策、历史过滤等核心功能
 */
@Injectable({
    providedIn: 'root'
})
export class ContextManager {
    private config: ContextConfig;

    constructor(
        private logger: LoggerService,
        private chatHistoryService: ChatHistoryService,
        private configService: ConfigProviderService,
        private summaryService: SummaryService
    ) {
        this.config = { ...DEFAULT_CONTEXT_CONFIG };
        // 动态获取当前供应商的上下文限制
        this.updateContextLimit();
        this.logger.info('ContextManager initialized', { config: this.config });
    }

    /**
     * 更新上下文限制（根据当前供应商）
     */
    updateContextLimit(): void {
        const providerContextWindow = this.configService.getActiveProviderContextWindow();
        if (providerContextWindow !== this.config.maxContextTokens) {
            this.config.maxContextTokens = providerContextWindow;
            this.logger.info('Context limit updated', {
                newLimit: providerContextWindow
            });
        }
    }

    /**
     * 计算Token使用量
     */
    calculateTokenUsage(messages: ApiMessage[]): TokenUsage {
        let inputTokens = 0;
        let outputTokens = 0;

        for (const message of messages) {
            const content = typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content);

            const messageTokens = this.estimateTokens(content);

            if (message.role === 'user' || message.role === 'system') {
                inputTokens += messageTokens;
            } else if (message.role === 'assistant') {
                outputTokens += messageTokens;
            }
        }

        return {
            input: inputTokens,
            output: outputTokens,
            cacheRead: 0,
            cacheWrite: 0
        };
    }

    /**
     * 计算使用率
     */
    calculateUsageRate(tokenUsage: TokenUsage): number {
        const totalUsed = tokenUsage.input + tokenUsage.output;
        const availableTokens = this.config.maxContextTokens - this.config.reservedOutputTokens;
        return totalUsed / availableTokens;
    }

    /**
     * 判断是否需要管理上下文
     */
    shouldManageContext(sessionId: string): boolean {
        // 动态更新上下文限制
        this.updateContextLimit();

        const session = this.chatHistoryService.loadSession(sessionId);
        if (!session) {
            return false;
        }
        if (!session.messages || session.messages.length < 2) {
            // 消息太少，不需要管理
            return false;
        }
        if (!session.contextInfo?.tokenUsage) {
            // 没有 token 使用统计，检查消息数量
            const messages = session.messages as unknown as ApiMessage[];
            const tokenUsage = this.calculateTokenUsage(messages);
            const usageRate = this.calculateUsageRate(tokenUsage);
            return usageRate >= this.config.pruneThreshold;
        }

        const usageRate = this.calculateUsageRate(session.contextInfo.tokenUsage);

        // 触发条件：使用率超过压缩阈值或裁剪阈值
        return usageRate >= this.config.compactThreshold ||
               usageRate >= this.config.pruneThreshold;
    }

    /**
     * 统一管理上下文入口
     */
    async manageContext(sessionId: string): Promise<{
        compactionResult?: CompactionResult;
        pruneResult?: PruneResult;
        truncationResult?: TruncationResult;
    }> {
        this.logger.info('Starting context management', { sessionId });

        const session = this.chatHistoryService.loadSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const messages = session.messages as unknown as ApiMessage[];
        const tokenUsage = this.calculateTokenUsage(messages);
        const usageRate = this.calculateUsageRate(tokenUsage);

        const results: any = {};

        // 更新Token使用统计
        this.chatHistoryService.updateTokenUsage(sessionId, tokenUsage);

        // 1. 首先尝试裁剪（Prune）- 移除工具输出中的冗余信息
        if (usageRate >= this.config.pruneThreshold) {
            this.logger.info('Prune threshold exceeded, applying prune', {
                sessionId,
                usageRate,
                threshold: this.config.pruneThreshold
            });
            results.pruneResult = await this.prune(sessionId, messages);
        }

        // 2. 如果裁剪后仍超过压缩阈值，进行压缩（Compact）
        const currentUsageRate = this.calculateUsageRate(
            this.calculateTokenUsage(results.pruneResult?.messages || messages)
        );

        if (currentUsageRate >= this.config.compactThreshold) {
            this.logger.info('Compact threshold exceeded, applying compact', {
                sessionId,
                usageRate: currentUsageRate,
                threshold: this.config.compactThreshold
            });
            results.compactionResult = await this.compact(sessionId, results.pruneResult?.messages || messages);
        }

        // 3. 如果压缩后仍超过阈值，使用截断（Truncate）
        const finalUsageRate = this.calculateUsageRate(
            this.calculateTokenUsage(results.compactionResult?.messages || results.pruneResult?.messages || messages)
        );

        if (finalUsageRate >= 0.95) {
            this.logger.info('Severe threshold exceeded, applying truncate', {
                sessionId,
                usageRate: finalUsageRate
            });
            results.truncationResult = await this.truncate(sessionId, results.compactionResult?.messages || results.pruneResult?.messages || messages);
        }

        this.logger.info('Context management completed', {
            sessionId,
            results: Object.keys(results)
        });

        return results;
    }

    /**
     * 获取有效历史（过滤被压缩/截断的消息）
     */
    getEffectiveHistory(sessionId: string): ApiMessage[] {
        const session = this.chatHistoryService.loadSession(sessionId);
        if (!session) {
            return [];
        }

        const messages = session.messages as unknown as ApiMessage[];

        // 过滤掉被压缩的消息
        const effectiveMessages = messages.filter(msg => {
            // 保留非压缩消息
            if (!msg.condenseParent && !msg.truncationParent) {
                return true;
            }

            // 保留摘要消息
            if (msg.isSummary) {
                return true;
            }

            // 保留截断标记
            if (msg.isTruncationMarker) {
                return true;
            }

            return false;
        });

        // 保留最近的N条消息作为锚点
        const messagesToKeep = Math.min(this.config.messagesToKeep, effectiveMessages.length);
        const recentMessages = effectiveMessages.slice(-messagesToKeep);
        const olderMessages = effectiveMessages.slice(0, -messagesToKeep);

        return [...olderMessages, ...recentMessages];
    }

    /**
     * 滑动窗口截断
     */
    async truncate(sessionId: string, messages: ApiMessage[]): Promise<TruncationResult> {
        this.logger.info('Applying truncate', { sessionId, messageCount: messages.length });

        const truncationId = `truncate_${Date.now()}`;
        const messagesToKeep = Math.min(this.config.messagesToKeep, messages.length);

        // 保留最近的N条消息
        const keptMessages = messages.slice(-messagesToKeep);
        const removedMessages = messages.slice(0, -messagesToKeep);

        // 添加截断标记
        const truncationMarker: ApiMessage = {
            role: 'system',
            content: `[${removedMessages.length}条消息已被截断以节省Token成本]`,
            ts: Date.now(),
            isTruncationMarker: true,
            truncationId,
            truncationParent: undefined
        };

        const resultMessages = [...keptMessages, truncationMarker];

        // 记录截断事件
        this.chatHistoryService.recordCompactionEvent(
            sessionId,
            'truncate',
            removedMessages.length * 100 // 估算节省的token数
        );

        return {
            messages: resultMessages,
            truncationId,
            messagesRemoved: removedMessages.length
        };
    }

    /**
     * 清理孤儿标记
     */
    cleanupOrphanedTags(sessionId: string): number {
        this.logger.info('Cleaning up orphaned tags', { sessionId });

        const session = this.chatHistoryService.loadSession(sessionId);
        if (!session) {
            return 0;
        }

        const messages = session.messages as unknown as ApiMessage[];
        let cleanedCount = 0;

        // 查找所有condenseId和truncationId
        const condenseIds = new Set(
            messages
                .filter(m => m.condenseId)
                .map(m => m.condenseId)
        );

        const truncationIds = new Set(
            messages
                .filter(m => m.truncationId)
                .map(m => m.truncationId)
        );

        // 检查并清理孤儿的摘要消息和截断标记
        messages.forEach(msg => {
            // 检查摘要消息是否有对应的condenseId引用
            if (msg.isSummary && msg.condenseId && !condenseIds.has(msg.condenseId)) {
                msg.isSummary = false;
                msg.condenseId = undefined;
                cleanedCount++;
            }

            // 检查截断标记是否有对应的truncationId引用
            if (msg.isTruncationMarker && msg.truncationId && !truncationIds.has(msg.truncationId)) {
                msg.isTruncationMarker = false;
                msg.truncationId = undefined;
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            this.logger.info('Cleaned orphaned tags', { sessionId, count: cleanedCount });
        }

        return cleanedCount;
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<ContextConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Context config updated', { config: this.config });
    }

    /**
     * 获取当前配置
     */
    getConfig(): ContextConfig {
        return { ...this.config };
    }

    /**
     * 压缩（Compact）- 使用AI生成摘要
     */
    private async compact(sessionId: string, messages: ApiMessage[]): Promise<CompactionResult> {
        this.logger.info('Applying compact', { sessionId, messageCount: messages.length });

        try {
            const condenseId = `compact_${Date.now()}`;
            const messagesToKeep = Math.min(this.config.messagesToKeep, messages.length);

            // 保留最近的N条消息
            const keptMessages = messages.slice(-messagesToKeep);
            const messagesToSummarize = messages.slice(0, -messagesToKeep);

            if (messagesToSummarize.length === 0) {
                return {
                    success: true,
                    messages,
                    tokensSaved: 0,
                    cost: 0
                };
            }

            // 格式化消息用于摘要
            const summaryInput = this.formatMessagesForSummary(messagesToSummarize);

            // 调用AI API生成摘要
            const summaryResult = await this.summaryService.generateSummary(messagesToSummarize);
            const summary = summaryResult.summary;

            // 创建摘要消息
            const summaryMessage: ApiMessage = {
                role: 'system',
                content: summary,
                ts: Date.now(),
                isSummary: true,
                condenseId,
                condenseParent: undefined,
                // 记录摘要元数据
                summaryMeta: {
                    originalMessageCount: summaryResult.originalMessageCount,
                    tokensCost: summaryResult.tokensCost,
                    compressionRatio: this.summaryService.calculateCompressionRatio(summaryResult.originalMessageCount, summary.length)
                }
            };

            // 标记被压缩的消息
            messagesToSummarize.forEach(msg => {
                msg.condenseParent = condenseId;
            });

            const resultMessages = [...keptMessages, summaryMessage];

            // 估算节省的Token数
            const originalTokens = this.calculateTokenUsage(messagesToSummarize);
            const summaryTokens = this.estimateTokens(summary);
            const tokensSaved = (originalTokens.input + originalTokens.output) - summaryTokens;

            // 记录压缩事件
            this.chatHistoryService.recordCompactionEvent(
                sessionId,
                'compact',
                tokensSaved,
                condenseId
            );

            // 计算API成本
            const provider = this.configService.getDefaultProvider();
            const providerConfig = this.configService.getProviderConfig(provider);
            const model = providerConfig?.model || 'gpt-4o';
            const costResult = calculateCost(
                provider as any,
                model,
                { inputTokens: summaryResult.tokensCost, outputTokens: Math.floor(summaryResult.tokensCost * 0.05) }
            );

            return {
                success: true,
                messages: resultMessages,
                summary,
                condenseId,
                tokensSaved,
                cost: costResult.totalCost
            };

        } catch (error) {
            this.logger.error('Compact failed', { sessionId, error });
            return {
                success: false,
                messages,
                tokensSaved: 0,
                cost: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * 裁剪（Prune）- 移除工具输出中的冗余信息
     */
    private async prune(sessionId: string, messages: ApiMessage[]): Promise<PruneResult> {
        this.logger.info('Applying prune', { sessionId, messageCount: messages.length });

        let tokensSaved = 0;
        let partsCompacted = 0;

        // 简化版实现：移除过长的工具输出
        const prunedMessages = messages.map(msg => {
            if (typeof msg.content === 'string' && msg.content.length > 1000) {
                partsCompacted++;
                const originalLength = msg.content.length;
                const prunedContent = msg.content.substring(0, 500) + '\n[...输出已裁剪以节省Token...]';

                // 估算节省的Token数
                tokensSaved += Math.floor((originalLength - prunedContent.length) / 4);

                return {
                    ...msg,
                    content: prunedContent
                };
            }
            return msg;
        });

        if (tokensSaved > 0) {
            // 记录裁剪事件
            this.chatHistoryService.recordCompactionEvent(
                sessionId,
                'prune',
                tokensSaved
            );
        }

        return {
            pruned: tokensSaved > 0,
            tokensSaved,
            partsCompacted
        };
    }

    /**
     * 格式化消息用于摘要
     */
    private formatMessagesForSummary(messages: ApiMessage[]): string {
        return messages.map(msg => {
            const content = typeof msg.content === 'string'
                ? msg.content
                : '[复杂内容]';
            return `${msg.role}: ${content}`;
        }).join('\n');
    }

    /**
     * 估算Token数量（简化版）
     */
    private estimateTokens(text: string): number {
        // 粗略估算：1个Token约等于4个字符
        return Math.ceil(text.length / 4);
    }
}
