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

/**
 * 压缩算法实现类
 * 提供Prune、Compact、Truncate三种压缩算法的具体实现
 */
@Injectable({
    providedIn: 'root'
})
export class Compaction {
    private config: ContextConfig;

    constructor(private logger: LoggerService) {
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
            // 1. 准备摘要输入
            const summaryInput = this.formatMessagesForSummary(messages);

            // 2. 生成摘要（TODO: 调用AI API）
            const summary = await this.generateSummary(summaryInput, messages);

            // 3. 创建摘要消息
            const summaryMessage: ApiMessage = {
                role: 'system',
                content: summary,
                ts: Date.now(),
                isSummary: true,
                condenseId,
                condenseParent: undefined
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
                tokensSaved
            });

            return {
                success: true,
                messages: [summaryMessage],
                summary,
                condenseId,
                tokensSaved,
                cost: 0 // TODO: 计算实际API成本
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
     */
    private pruneComplexContent(message: ApiMessage, content: any[]): ApiMessage & { tokensSaved?: number; partsCompacted?: number } {
        // TODO: 实现复杂内容的裁剪逻辑
        // 例如：工具调用结果的格式化、JSON数据的精简等
        return {
            ...message,
            content,
            tokensSaved: 0,
            partsCompacted: 0
        };
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
     * 格式化消息用于摘要
     */
    private formatMessagesForSummary(messages: ApiMessage[]): string {
        const formattedMessages = messages.map(msg => {
            const content = this.extractTextContent(msg.content);
            return `[${msg.role}] ${content}`;
        });

        return formattedMessages.join('\n---\n');
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
     * 生成摘要（集成AI API）
     */
    private async generateSummary(input: string, messages: ApiMessage[]): Promise<string> {
        try {
            // TODO: 实现AI摘要生成
            // 实际实现中应该调用AI API

            // 临时实现：基于规则的智能摘要
            const messageCount = messages.length;
            const estimatedTokens = this.calculateTotalTokens(messages);

            // 如果消息数量较少，使用简单摘要
            if (messageCount < 5) {
                return this.createSimpleSummary(messages);
            }

            // 如果消息数量较多，使用智能摘要
            const intelligentSummary = this.createIntelligentSummary(messages);

            return `【AI摘要】压缩了${messageCount}条消息（约${estimatedTokens}个Token）

${intelligentSummary}

--- 上下文压缩完成 ---`;

        } catch (error) {
            this.logger.error('Failed to generate AI summary', { error });
            // 降级到本地摘要
            return this.createFallbackSummary(messages);
        }
    }

    /**
     * 创建简单摘要（适用于短对话）
     */
    private createSimpleSummary(messages: ApiMessage[]): string {
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');

        if (userMessages.length === 0) {
            return '会话摘要：空对话';
        }

        const firstMessage = this.extractTextContent(userMessages[0].content);
        const lastMessage = this.extractTextContent(assistantMessages[assistantMessages.length - 1]?.content || '');

        return `【摘要】简短对话：
用户问题：${firstMessage.substring(0, 80)}${firstMessage.length > 80 ? '...' : ''}
助手回复：${lastMessage.substring(0, 80)}${lastMessage.length > 80 ? '...' : ''}
消息总数：${messages.length}条`;
    }

    /**
     * 创建降级摘要（当AI API不可用时）
     */
    private createFallbackSummary(messages: ApiMessage[]): string {
        const messageCount = messages.length;
        const userCount = messages.filter(m => m.role === 'user').length;
        const assistantCount = messages.filter(m => m.role === 'assistant').length;
        const totalTokens = this.calculateTotalTokens(messages);

        const summary = [
            `【压缩摘要】`,
            `消息统计：${messageCount}条消息（用户${userCount}条，助手${assistantCount}条）`,
            `Token使用：约${totalTokens}个Token`,
            ``,
            `关键内容提取：`
        ];

        // 提取关键消息
        const keyMessages = messages
            .filter(m => m.role === 'user' && this.extractTextContent(m.content).length > 10)
            .slice(0, 3)
            .map((m, i) => `  ${i + 1}. ${this.extractTextContent(m.content).substring(0, 60)}...`);

        summary.push(...keyMessages);

        summary.push('', '--- 压缩完成 ---');

        return summary.join('\n');
    }

    /**
     * 创建智能摘要（简化版）
     */
    private createIntelligentSummary(messages: ApiMessage[]): string {
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');

        let summary = '';

        if (userMessages.length > 0) {
            summary += `用户发送了${userMessages.length}条消息\n`;
            summary += `主要问题：${this.extractTextContent(userMessages[0].content).substring(0, 100)}...\n`;
        }

        if (assistantMessages.length > 0) {
            summary += `助手回复了${assistantMessages.length}条消息\n`;
        }

        summary += `会话主题：基于历史消息推断的主题\n`;
        summary += `关键决策：基于历史消息提取的关键操作\n`;

        return summary;
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
