import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import {
    ApiMessage,
    ContextConfig,
    DEFAULT_CONTEXT_CONFIG,
    CompactionResult,
    PruneResult,
    TruncationResult
} from '../../types/ai.types';
import { SummaryService } from './summary.service';

/**
 * 压缩算法实现类
 * 提供Prune、Compact、Truncate三种压缩算法的具体实现
 */
@Injectable({
    providedIn: 'root'
})
export class Compaction {
    private config: ContextConfig;

    constructor(
        private logger: LoggerService,
        private summaryService: SummaryService
    ) {
        this.config = { ...DEFAULT_CONTEXT_CONFIG };
    }

    /**
     * Prune算法 - 移除工具输出中的冗余信息
     * 保留关键信息，移除重复、冗长或无关的内容
     */
    async prune(messages: ApiMessage[]): Promise<PruneResult> {
        this.logger.info('Executing Prune algorithm', { messageCount: messages.length });

        let tokensSaved = 0;
        let partsCompacted = 0;
        const processedMessages: ApiMessage[] = [];

        for (const message of messages) {
            const processedMessage = await this.pruneMessage(message);
            if (processedMessage) {
                processedMessages.push(processedMessage);
                tokensSaved += processedMessage.tokensSaved || 0;
                partsCompacted += processedMessage.partsCompacted || 0;
            }
        }

        this.logger.info('Prune completed', {
            originalCount: messages.length,
            processedCount: processedMessages.length,
            tokensSaved,
            partsCompacted
        });

        return {
            pruned: tokensSaved > 0,
            tokensSaved,
            partsCompacted
        };
    }

    /**
     * Compact算法 - 使用AI生成摘要压缩上下文
     * 将多个消息合并为一个摘要，保留核心信息
     */
    async compact(messages: ApiMessage[]): Promise<CompactionResult> {
        this.logger.info('Executing Compact algorithm', { messageCount: messages.length });

        const condenseId = `compact_${Date.now()}`;

        try {
            // 使用SummaryService生成AI摘要
            const summaryResult = await this.summaryService.generateSummary(messages);
            const summary = summaryResult.summary;

            // 创建摘要消息，包含元数据
            const summaryMessage: ApiMessage = {
                role: 'system',
                content: summary,
                ts: Date.now(),
                isSummary: true,
                condenseId,
                condenseParent: undefined,
                summaryMeta: {
                    originalMessageCount: summaryResult.originalMessageCount,
                    tokensCost: summaryResult.tokensCost,
                    compressionRatio: this.summaryService.calculateCompressionRatio(
                        summaryResult.originalMessageCount,
                        summary.length
                    )
                }
            };

            // 4. 标记被压缩的消息
            messages.forEach(msg => {
                msg.condenseParent = condenseId;
            });

            // 5. 计算节省的Token数
            const originalTokens = this.calculateTotalTokens(messages);
            const summaryTokens = this.estimateTokens(summary);
            const tokensSaved = originalTokens - summaryTokens;

            this.logger.info('Compact completed', {
                condenseId,
                originalTokens,
                summaryTokens,
                tokensSaved,
                compressionRatio: summaryMessage.summaryMeta?.compressionRatio
            });

            return {
                success: true,
                messages: [summaryMessage],
                summary,
                condenseId,
                tokensSaved,
                cost: summaryResult.tokensCost
            };

        } catch (error) {
            this.logger.error('Compact failed', { error });
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
     * Truncate算法 - 滑动窗口截断
     * 保留最近的消息，移除较早的消息
     */
    truncate(messages: ApiMessage[]): TruncationResult {
        this.logger.info('Executing Truncate algorithm', { messageCount: messages.length });

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

        // 估算节省的Token数（移除的消息）
        const removedTokens = this.calculateTotalTokens(removedMessages);

        this.logger.info('Truncate completed', {
            originalCount: messages.length,
            keptCount: keptMessages.length,
            removedCount: removedMessages.length,
            removedTokens
        });

        return {
            messages: resultMessages,
            truncationId,
            messagesRemoved: removedMessages.length
        };
    }

    /**
     * 智能压缩 - 根据消息类型和重要性选择最佳压缩策略
     */
    async smartCompact(messages: ApiMessage[], tokenBudget: number): Promise<{
        strategy: 'prune' | 'compact' | 'truncate';
        result: PruneResult | CompactionResult | TruncationResult;
        messages: ApiMessage[];
    }> {
        this.logger.info('Executing Smart Compact', {
            messageCount: messages.length,
            tokenBudget
        });

        const currentTokens = this.calculateTotalTokens(messages);
        const usageRate = currentTokens / tokenBudget;

        // 策略1：轻度压缩 - Prune（使用率 < 80%）
        if (usageRate < 0.8) {
            this.logger.info('Using Prune strategy (light compression)');
            const pruneResult = await this.prune(messages);
            return {
                strategy: 'prune',
                result: pruneResult,
                messages: await this.applyPruneResult(messages, pruneResult)
            };
        }

        // 策略2：中度压缩 - Compact（使用率 < 95%）
        if (usageRate < 0.95) {
            this.logger.info('Using Compact strategy (medium compression)');
            const compactResult = await this.compact(messages);
            return {
                strategy: 'compact',
                result: compactResult,
                messages: compactResult.messages
            };
        }

        // 策略3：重度压缩 - Truncate（使用率 >= 95%）
        this.logger.info('Using Truncate strategy (heavy compression)');
        const truncateResult = this.truncate(messages);
        return {
            strategy: 'truncate',
            result: truncateResult,
            messages: truncateResult.messages
        };
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<ContextConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Compaction config updated', { config: this.config });
    }

    /**
     * 获取当前配置
     */
    getConfig(): ContextConfig {
        return { ...this.config };
    }

    // ==================== 私有方法 ====================

    /**
     * 裁剪单条消息
     */
    private async pruneMessage(message: ApiMessage): Promise<(ApiMessage & { tokensSaved?: number; partsCompacted?: number }) | null> {
        const content = message.content;

        // 处理字符串内容
        if (typeof content === 'string') {
            return this.pruneStringContent(message, content);
        }

        // 处理复杂内容（工具调用结果等）
        if (Array.isArray(content)) {
            return this.pruneComplexContent(message, content);
        }

        return message;
    }

    /**
     * 裁剪字符串内容
     */
    private pruneStringContent(message: ApiMessage, content: string): ApiMessage & { tokensSaved?: number; partsCompacted?: number } {
        let tokensSaved = 0;
        let partsCompacted = 0;
        let prunedContent = content;

        // 1. 移除过长的重复行
        const lines = content.split('\n');
        const uniqueLines: string[] = [];
        const seenLines = new Set<string>();

        for (const line of lines) {
            // 跳过完全相同的重复行
            if (!seenLines.has(line)) {
                uniqueLines.push(line);
                seenLines.add(line);
            } else {
                partsCompacted++;
            }
        }

        if (uniqueLines.length < lines.length) {
            prunedContent = uniqueLines.join('\n');
            tokensSaved += (lines.length - uniqueLines.length) * 10; // 估算每行节省的token数
        }

        // 2. 截断过长的输出（保留前500字符和后100字符）
        if (prunedContent.length > 1000) {
            const preservedLength = 500 + 100;
            const removedLength = prunedContent.length - preservedLength;
            prunedContent = prunedContent.substring(0, 500) + `\n[...${removedLength}字符已裁剪...]` + prunedContent.substring(prunedContent.length - 100);
            tokensSaved += Math.floor(removedLength / 4);
            partsCompacted++;
        }

        // 3. 移除多余的空行（保留最多2个连续空行）
        prunedContent = prunedContent.replace(/\n{3,}/g, '\n\n');
        const removedBlankLines = (content.match(/\n{3,}/g) || []).length;
        tokensSaved += removedBlankLines * 5;
        partsCompacted += removedBlankLines;

        return {
            ...message,
            content: prunedContent,
            tokensSaved,
            partsCompacted
        };
    }

    /**
     * 裁剪复杂内容（工具调用结果等）
     * 智能裁剪长文本、JSON、代码块
     */
    private pruneComplexContent(message: ApiMessage, content: any[]): ApiMessage & { tokensSaved?: number; partsCompacted?: number } {
        let tokensSaved = 0;
        let partsCompacted = 0;
        const originalLength = JSON.stringify(content).length;

        // 处理每个内容块
        const prunedContent = content.map(block => {
            // 如果是文本块，尝试智能裁剪
            if (block.type === 'text' && typeof block.text === 'string') {
                const prunedText = this.pruneText(block.text, 500);
                if (prunedText.length < block.text.length) {
                    tokensSaved += this.estimateTokens(block.text) - this.estimateTokens(prunedText);
                    partsCompacted++;
                    return { ...block, text: prunedText };
                }
            }
            // 如果是工具调用结果，尝试精简
            if (block.type === 'tool_use') {
                const prunedTool = this.pruneToolResult(block);
                if (prunedTool !== block) {
                    partsCompacted++;
                    return prunedTool;
                }
            }
            return block;
        });

        // 如果内容类型不对，只返回原内容
        if (typeof message.content === 'string') {
            return {
                ...message,
                tokensSaved: 0,
                partsCompacted: 0
            };
        }

        return {
            ...message,
            content: prunedContent,
            tokensSaved,
            partsCompacted
        };
    }

    /**
     * 智能裁剪文本内容
     */
    private pruneText(content: string, maxLength: number = 500): string {
        // 如果内容不超过限制，直接返回
        if (content.length <= maxLength) {
            return content;
        }

        // JSON 内容：保留结构概要
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(content);
                const keys = Object.keys(parsed);
                return `[JSON对象，包含${keys.length}个字段: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}]`;
            } catch {
                // 非有效 JSON，继续处理
            }
        }

        // 代码块：保留头尾
        if (content.includes('\n') && content.split('\n').length > 10) {
            const lines = content.split('\n');
            const head = lines.slice(0, 5).join('\n');
            const tail = lines.slice(-3).join('\n');
            return `${head}\n[...省略${lines.length - 8}行...]\n${tail}`;
        }

        // 普通长文本：截断并添加省略标记
        return content.substring(0, maxLength) + '\n[...内容已裁剪...]';
    }

    /**
     * 精简工具调用结果
     */
    private pruneToolResult(block: any): any {
        // 如果是工具输出块
        if (block.type === 'tool_result' && block.content) {
            let content = block.content;
            if (typeof content === 'string') {
                // 对长文本结果进行裁剪
                if (content.length > 1000) {
                    content = content.substring(0, 500) + '\n[...输出已截断...]';
                }
            }
            return { ...block, content };
        }
        return block;
    }

    /**
     * 应用Prune结果到消息
     */
    private async applyPruneResult(messages: ApiMessage[], pruneResult: PruneResult): Promise<ApiMessage[]> {
        // 简化实现：假设prune已经处理了消息
        // 实际实现中需要更复杂的逻辑来处理prune结果
        return messages;
    }

    /**
     * 提取文本内容
     */
    private extractTextContent(content: string | any[]): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            return content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text)
                .join('\n');
        }

        return '[复杂内容]';
    }

    /**
     * 计算总Token数
     */
    private calculateTotalTokens(messages: ApiMessage[]): number {
        return messages.reduce((total, message) => {
            const content = this.extractTextContent(message.content);
            return total + this.estimateTokens(content);
        }, 0);
    }

    /**
     * 估算Token数量
     */
    private estimateTokens(text: string): number {
        // 中文：1个Token约等于1.5个字符
        // 英文：1个Token约等于4个字符
        // 混合：粗略估算为1个Token约等于2.5个字符
        const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishCharCount = text.length - chineseCharCount;
        return Math.ceil(chineseCharCount / 1.5 + englishCharCount / 4);
    }
}
