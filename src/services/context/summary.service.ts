import { Injectable } from '@angular/core';
import { AiAssistantService } from '../core/ai-assistant.service';
import { LoggerService } from '../core/logger.service';
import { ChatMessage, MessageRole, ApiMessage } from '../../types/ai.types';

/**
 * 摘要生成结果
 */
export interface SummaryResult {
    summary: string;
    tokensCost: number;
    originalMessageCount: number;
}

/**
 * 摘要服务
 * 使用 AI 生成消息摘要，用于上下文压缩和记忆管理
 */
@Injectable({ providedIn: 'root' })
export class SummaryService {
    constructor(
        private aiService: AiAssistantService,
        private logger: LoggerService
    ) {}

    /**
     * 使用 AI 生成消息摘要
     * @param messages 要摘要的消息数组（支持 ApiMessage 和 ChatMessage）
     * @param maxLength 摘要最大长度（默认200字）
     */
    async generateSummary(messages: (ChatMessage | ApiMessage)[], maxLength: number = 200): Promise<SummaryResult> {
        try {
            if (!messages || messages.length === 0) {
                return {
                    summary: '',
                    tokensCost: 0,
                    originalMessageCount: 0
                };
            }

            // 构建摘要提示
            const prompt = this.buildSummaryPrompt(messages, maxLength);

            // 调用 AI 生成摘要
            const response = await this.aiService.chat({
                messages: [{
                    role: MessageRole.USER,
                    content: prompt,
                    id: 'summary-request',
                    timestamp: new Date()
                }],
                maxTokens: 500,
                temperature: 0.3 // 低温度以获得更稳定的摘要
            });

            const summary = response.message?.content?.trim() || '';

            this.logger.debug('Summary generated', {
                originalCount: messages.length,
                summaryLength: summary.length,
                tokensCost: response.usage?.totalTokens || 0
            });

            return {
                summary,
                tokensCost: response.usage?.totalTokens || 0,
                originalMessageCount: messages.length
            };
        } catch (error) {
            this.logger.error('Failed to generate summary', error);
            // 返回空摘要作为降级方案
            return {
                summary: `[摘要失败，共 ${messages.length} 条消息]`,
                tokensCost: 0,
                originalMessageCount: messages.length
            };
        }
    }

    /**
     * 从消息列表生成简化的消息数组
     */
    private formatMessagesForSummary(messages: (ChatMessage | ApiMessage)[]): { role: string; content: string; timestamp?: Date }[] {
        return messages.map(msg => {
            // 处理 ChatMessage (有 timestamp: Date)
            if ('timestamp' in msg && msg.timestamp instanceof Date) {
                return {
                    role: String(msg.role),
                    content: typeof msg.content === 'string' ? msg.content : '[复杂内容]',
                    timestamp: msg.timestamp
                };
            }
            // 处理 ApiMessage (有 ts: number)
            return {
                role: String(msg.role),
                content: typeof msg.content === 'string' ? msg.content : '[复杂内容]'
            };
        });
    }

    /**
     * 构建摘要提示词
     */
    private buildSummaryPrompt(messages: (ChatMessage | ApiMessage)[], maxLength: number): string {
        const formattedMessages = this.formatMessagesForSummary(messages);

        // 如果消息太多，截取最后N条
        const maxMessages = 20;
        const recentMessages = formattedMessages.slice(-maxMessages);
        const truncated = formattedMessages.length > maxMessages;

        const content = recentMessages.map(m =>
            `[${m.role}]: ${m.content}`
        ).join('\n');

        return `请简洁概括以下对话的主要内容和结论，不超过${maxLength}字。\n${truncated ? `(共 ${formattedMessages.length} 条消息，显示最后 ${maxMessages} 条)\n` : ''}\n${content}\n\n请直接返回摘要，不需要其他解释。`;
    }

    /**
     * 检查是否需要对消息进行摘要
     * 基于消息数量和token数量判断
     */
    shouldSummarize(messageCount: number, tokenCount: number, thresholdCount: number = 30, thresholdTokens: number = 8000): boolean {
        return messageCount > thresholdCount || tokenCount > thresholdTokens;
    }

    /**
     * 计算摘要的压缩率
     */
    calculateCompressionRatio(originalCount: number, summaryLength: number): number {
        if (originalCount === 0) return 0;
        // 假设平均每条消息50个字符，计算理论压缩比
        const originalLength = originalCount * 50;
        return originalLength > 0 ? Math.round((1 - summaryLength / originalLength) * 100) : 0;
    }
}
