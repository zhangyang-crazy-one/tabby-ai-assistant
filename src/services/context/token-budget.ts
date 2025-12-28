import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import { ContextConfig, TokenUsage } from '../../types/ai.types';

/**
 * 预算分配策略
 */
export interface BudgetAllocation {
    context: number;      // 上下文预算
    reserved: number;     // 预留预算
    buffer: number;       // 安全缓冲
    available: number;    // 可用预算
}

/**
 * 预算使用情况
 */
export interface BudgetUsage {
    current: TokenUsage;
    allocated: BudgetAllocation;
    utilizationRate: number;
    projectedUsage: number;
    remaining: number;
    warnings: string[];
}

/**
 * 预算策略配置
 */
export interface BudgetStrategy {
    conservative: boolean;    // 保守策略：更多缓冲
    aggressive: boolean;      // 激进策略：最大化使用
    adaptive: boolean;        // 自适应：根据历史调整
    dynamic: boolean;         // 动态：根据实时使用调整
}

/**
 * Token预算管理器
 * 负责动态分配和管理Token预算
 */
@Injectable({
    providedIn: 'root'
})
export class TokenBudget {
    private config: ContextConfig;
    private currentUsage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    private usageHistory: TokenUsage[] = [];
    private strategy: BudgetStrategy = {
        conservative: false,
        aggressive: false,
        adaptive: true,
        dynamic: true
    };

    constructor(
        private logger: LoggerService,
        config?: ContextConfig
    ) {
        this.config = config || {
            maxContextTokens: 200000,
            reservedOutputTokens: 16000,
            compactThreshold: 0.85,
            pruneThreshold: 0.70,
            messagesToKeep: 3,
            bufferPercentage: 0.10
        };

        this.logger.info('TokenBudget initialized', { config: this.config });
    }

    /**
     * 计算预算分配
     */
    calculateBudget(): BudgetAllocation {
        const { maxContextTokens, reservedOutputTokens, bufferPercentage } = this.config;

        // 基础预算计算
        let context = maxContextTokens - reservedOutputTokens;
        let reserved = reservedOutputTokens;
        let buffer = Math.floor(context * bufferPercentage);

        // 根据策略调整
        if (this.strategy.conservative) {
            // 保守策略：增加缓冲，减少可用预算
            buffer = Math.floor(context * (bufferPercentage * 1.5));
        } else if (this.strategy.aggressive) {
            // 激进策略：减少缓冲，增加可用预算
            buffer = Math.floor(context * (bufferPercentage * 0.5));
        }

        if (this.strategy.adaptive && this.usageHistory.length > 0) {
            // 自适应策略：根据历史使用情况调整
            const avgUsage = this.getAverageUsage();
            const usageVariation = this.calculateUsageVariation();
            const adjustmentFactor = 1 - (usageVariation * 0.1);

            buffer = Math.floor(buffer * adjustmentFactor);
        }

        const available = context - buffer;

        return {
            context,
            reserved,
            buffer,
            available: Math.max(0, available)
        };
    }

    /**
     * 检查预算阈值
     */
    checkThresholds(usage?: TokenUsage): {
        shouldPrune: boolean;
        shouldCompact: boolean;
        shouldTruncate: boolean;
        urgency: 'low' | 'medium' | 'high' | 'critical';
    } {
        const currentUsage = usage || this.currentUsage;
        const allocation = this.calculateBudget();
        const totalUsed = currentUsage.input + currentUsage.output;
        const usageRate = totalUsed / allocation.available;

        const result = {
            shouldPrune: usageRate >= this.config.pruneThreshold,
            shouldCompact: usageRate >= this.config.compactThreshold,
            shouldTruncate: usageRate >= 0.95,
            urgency: 'low' as 'low' | 'medium' | 'high' | 'critical'
        };

        if (usageRate >= 0.95) {
            result.urgency = 'critical';
        } else if (usageRate >= 0.85) {
            result.urgency = 'high';
        } else if (usageRate >= 0.70) {
            result.urgency = 'medium';
        }

        return result;
    }

    /**
     * 分配Token
     */
    allocateTokens(
        type: 'input' | 'output' | 'cache_read' | 'cache_write',
        amount: number,
        sessionId?: string
    ): boolean {
        const allocation = this.calculateBudget();
        const currentTotal = this.currentUsage.input + this.currentUsage.output;
        const projectedTotal = currentTotal + amount;

        // 检查是否超出预算
        if (projectedTotal > allocation.available) {
            const overage = projectedTotal - allocation.available;
            this.logger.warn('Token budget exceeded', {
                type,
                amount,
                overage,
                sessionId
            });

            // 根据策略决定是否允许
            if (this.strategy.aggressive) {
                // 激进策略：允许超出
                this.updateUsage(type, amount);
                return true;
            } else {
                // 保守策略：拒绝超出
                return false;
            }
        }

        this.updateUsage(type, amount);
        this.logger.debug('Tokens allocated', { type, amount, sessionId });

        return true;
    }

    /**
     * 追踪使用量
     */
    trackUsage(usage: TokenUsage): void {
        // 保存到历史
        this.usageHistory.push({ ...usage });

        // 限制历史记录数量
        if (this.usageHistory.length > 100) {
            this.usageHistory.shift();
        }

        // 更新当前使用量
        this.currentUsage = { ...usage };

        // 动态调整策略
        if (this.strategy.dynamic) {
            this.adjustStrategy();
        }

        this.logger.debug('Usage tracked', { usage });
    }

    /**
     * 获取预算使用情况
     */
    getBudgetUsage(): BudgetUsage {
        const allocation = this.calculateBudget();
        const currentTotal = this.currentUsage.input + this.currentUsage.output;
        const utilizationRate = currentTotal / allocation.available;
        const projectedUsage = this.projectUsage();
        const remaining = allocation.available - currentTotal;

        const warnings: string[] = [];
        const thresholds = this.checkThresholds();

        if (thresholds.shouldPrune) {
            warnings.push('建议进行Prune操作以节省Token');
        }
        if (thresholds.shouldCompact) {
            warnings.push('建议进行Compact操作以节省Token');
        }
        if (thresholds.shouldTruncate) {
            warnings.push('严重警告：必须进行Truncate操作');
        }

        if (utilizationRate > 0.9) {
            warnings.push('Token使用率过高，请注意预算管理');
        }

        return {
            current: this.currentUsage,
            allocated: allocation,
            utilizationRate,
            projectedUsage,
            remaining,
            warnings
        };
    }

    /**
     * 预估未来使用量
     */
    projectUsage(horizon: number = 10): number {
        if (this.usageHistory.length < 2) {
            return this.currentUsage.input + this.currentUsage.output;
        }

        // 简化的线性预测
        const recentHistory = this.usageHistory.slice(-horizon);
        const avgGrowth = this.calculateAverageGrowth(recentHistory);
        const currentTotal = this.currentUsage.input + this.currentUsage.output;

        return currentTotal + (avgGrowth * horizon);
    }

    /**
     * 重置预算
     */
    reset(sessionId?: string): void {
        this.currentUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

        this.logger.info('Token budget reset', { sessionId });
    }

    /**
     * 更新策略
     */
    updateStrategy(strategy: Partial<BudgetStrategy>): void {
        this.strategy = { ...this.strategy, ...strategy };
        this.logger.info('Budget strategy updated', { strategy: this.strategy });
    }

    /**
     * 获取策略
     */
    getStrategy(): BudgetStrategy {
        return { ...this.strategy };
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<ContextConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.info('TokenBudget config updated', { config: this.config });
    }

    /**
     * 获取配置
     */
    getConfig(): ContextConfig {
        return { ...this.config };
    }

    /**
     * 估算消息Token成本
     */
    estimateMessageCost(message: string, role: 'user' | 'assistant' | 'system'): number {
        // 粗略估算
        const baseCost = Math.ceil(message.length / 4);

        // 角色调整
        const roleMultiplier = {
            user: 1.0,
            assistant: 1.2,  // 输出通常更复杂
            system: 0.8      // 系统提示通常简洁
        }[role];

        return Math.ceil(baseCost * roleMultiplier);
    }

    /**
     * 优化预算分配
     */
    optimizeAllocation(): BudgetAllocation {
        const current = this.calculateBudget();
        const usage = this.getBudgetUsage();

        // 如果使用率过低，减少缓冲
        if (usage.utilizationRate < 0.5) {
            const newBuffer = Math.floor(current.buffer * 0.8);
            return {
                ...current,
                buffer: newBuffer,
                available: current.context - newBuffer
            };
        }

        // 如果使用率过高，增加缓冲
        if (usage.utilizationRate > 0.85) {
            const newBuffer = Math.floor(current.buffer * 1.2);
            return {
                ...current,
                buffer: newBuffer,
                available: Math.max(0, current.context - newBuffer)
            };
        }

        return current;
    }

    // ==================== 私有方法 ====================

    private updateUsage(type: string, amount: number): void {
        switch (type) {
            case 'input':
                this.currentUsage.input += amount;
                break;
            case 'output':
                this.currentUsage.output += amount;
                break;
            case 'cache_read':
                this.currentUsage.cacheRead += amount;
                break;
            case 'cache_write':
                this.currentUsage.cacheWrite += amount;
                break;
        }
    }

    private getAverageUsage(): number {
        if (this.usageHistory.length === 0) {
            return 0;
        }

        const total = this.usageHistory.reduce((sum, usage) => {
            return sum + usage.input + usage.output;
        }, 0);

        return total / this.usageHistory.length;
    }

    private calculateUsageVariation(): number {
        if (this.usageHistory.length < 2) {
            return 0;
        }

        const usage = this.usageHistory.map(u => u.input + u.output);
        const mean = usage.reduce((a, b) => a + b, 0) / usage.length;
        const variance = usage.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / usage.length;

        return Math.sqrt(variance) / mean;
    }

    private calculateAverageGrowth(history: TokenUsage[]): number {
        if (history.length < 2) {
            return 0;
        }

        let totalGrowth = 0;
        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const curr = history[i];
            const prevTotal = prev.input + prev.output;
            const currTotal = curr.input + curr.output;
            totalGrowth += currTotal - prevTotal;
        }

        return totalGrowth / (history.length - 1);
    }

    private adjustStrategy(): void {
        const usage = this.getBudgetUsage();

        // 如果使用率持续过高，转向保守策略
        if (usage.utilizationRate > 0.9) {
            this.strategy.conservative = true;
            this.strategy.aggressive = false;
        }
        // 如果使用率持续过低，转向激进策略
        else if (usage.utilizationRate < 0.4) {
            this.strategy.conservative = false;
            this.strategy.aggressive = true;
        }
        // 否则保持平衡
        else {
            this.strategy.conservative = false;
            this.strategy.aggressive = false;
        }
    }
}
