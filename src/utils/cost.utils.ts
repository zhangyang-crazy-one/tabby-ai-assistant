/**
 * API成本计算工具类
 * 提供各AI提供商的API调用成本估算功能
 */

/**
 * AI提供商类型
 */
export type AIProvider = 'openai' | 'anthropic' | 'minimax' | 'glm' | 'openai-compatible';

/**
 * 模型定价信息
 */
export interface ModelPricing {
    provider: AIProvider;
    model: string;
    inputPricePerMillion: number;  // 每百万输入token的价格（美元）
    outputPricePerMillion: number; // 每百万输出token的价格（美元）
}

/**
 * Token使用信息
 */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

/**
 * 成本计算结果
 */
export interface CostResult {
    inputCost: number;       // 输入成本（美元）
    outputCost: number;      // 输出成本（美元）
    totalCost: number;       // 总成本（美元）
    inputPricePerMillion: number;
    outputPricePerMillion: number;
}

/**
 * 默认模型定价表（2024年最新价格）
 */
const DEFAULT_PRICING: ModelPricing[] = [
    // OpenAI
    { provider: 'openai', model: 'gpt-4', inputPricePerMillion: 30, outputPricePerMillion: 60 },
    { provider: 'openai', model: 'gpt-4-turbo', inputPricePerMillion: 10, outputPricePerMillion: 30 },
    { provider: 'openai', model: 'gpt-4o', inputPricePerMillion: 5, outputPricePerMillion: 15 },
    { provider: 'openai', model: 'gpt-3.5-turbo', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },

    // Anthropic
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputPricePerMillion: 3, outputPricePerMillion: 15 },
    { provider: 'anthropic', model: 'claude-3-opus-20240229', inputPricePerMillion: 15, outputPricePerMillion: 75 },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307', inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },

    // Minimax (智谱AI)
    { provider: 'minimax', model: 'abab6.5s-chat', inputPricePerMillion: 0.3, outputPricePerMillion: 0.3 },
    { provider: 'minimax', model: 'abab6.5-chat', inputPricePerMillion: 0.5, outputPricePerMillion: 0.5 },
    { provider: 'minimax', model: 'abab5.5-chat', inputPricePerMillion: 1, outputPricePerMillion: 1 },

    // GLM (智谱AI)
    { provider: 'glm', model: 'glm-4', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    { provider: 'glm', model: 'glm-4v', inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    { provider: 'glm', model: 'glm-3-turbo', inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },
];

// 自定义定价表（可扩展）
let customPricing: ModelPricing[] = [];

/**
 * 设置自定义模型定价
 */
export function setCustomPricing(pricing: ModelPricing[]): void {
    customPricing = [...pricing];
}

/**
 * 获取模型定价信息
 */
export function getModelPricing(provider: AIProvider, model: string): ModelPricing | undefined {
    // 首先查找自定义定价
    const custom = customPricing.find(p => p.provider === provider && p.model === model);
    if (custom) {
        return custom;
    }

    // 然后查找默认定价
    const defaultPricing = DEFAULT_PRICING.find(p => p.provider === provider && p.model === model);

    if (defaultPricing) {
        return defaultPricing;
    }

    // 返回该提供商的通用定价
    return getDefaultPricingForProvider(provider);
}

/**
 * 获取提供商的默认定价
 */
function getDefaultPricingForProvider(provider: AIProvider): ModelPricing | undefined {
    const providerDefaults: Record<AIProvider, Partial<ModelPricing>> = {
        'openai': { inputPricePerMillion: 5, outputPricePerMillion: 15 },
        'anthropic': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
        'minimax': { inputPricePerMillion: 0.5, outputPricePerMillion: 0.5 },
        'glm': { inputPricePerMillion: 0.5, outputPricePerMillion: 1 },
        'openai-compatible': { inputPricePerMillion: 1, outputPricePerMillion: 2 }
    };

    const defaults = providerDefaults[provider];
    if (defaults) {
        return {
            provider,
            model: 'default',
            inputPricePerMillion: defaults.inputPricePerMillion ?? 1,
            outputPricePerMillion: defaults.outputPricePerMillion ?? 2
        };
    }

    return undefined;
}

/**
 * 计算API调用成本
 * @param provider AI提供商
 * @param model 模型名称
 * @param usage Token使用情况
 * @returns 成本计算结果
 */
export function calculateCost(
    provider: AIProvider,
    model: string,
    usage: TokenUsage
): CostResult {
    const pricing = getModelPricing(provider, model);

    if (!pricing) {
        // 未知提供商，返回零成本
        return {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            inputPricePerMillion: 0,
            outputPricePerMillion: 0
        };
    }

    const inputCost = (usage.inputTokens / 1000000) * pricing.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1000000) * pricing.outputPricePerMillion;

    return {
        inputCost: Math.round(inputCost * 1000000) / 1000000, // 保留6位小数
        outputCost: Math.round(outputCost * 1000000) / 1000000,
        totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
        inputPricePerMillion: pricing.inputPricePerMillion,
        outputPricePerMillion: pricing.outputPricePerMillion
    };
}

/**
 * 计算摘要生成成本
 */
export function calculateSummaryCost(
    provider: AIProvider,
    model: string,
    originalMessageCount: number,
    tokensUsed: number
): CostResult {
    // 摘要生成主要是输入成本
    const pricing = getModelPricing(provider, model);

    if (!pricing) {
        return {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            inputPricePerMillion: 0,
            outputPricePerMillion: 0
        };
    }

    // 估算摘要的输入和输出token（假设输出占输入的5%）
    const estimatedInputTokens = tokensUsed;
    const estimatedOutputTokens = Math.floor(tokensUsed * 0.05);

    return calculateCost(provider, model, {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens
    });
}

/**
 * 格式化成本为可读字符串
 */
export function formatCost(cost: number): string {
    if (cost < 0.001) {
        return `$${(cost * 1000000).toFixed(2)}`;
    } else if (cost < 1) {
        return `$${cost.toFixed(4)}`;
    } else {
        return `$${cost.toFixed(2)}`;
    }
}

/**
 * 格式化成本详细信息
 */
export function formatCostDetail(result: CostResult): string {
    const parts: string[] = [];

    if (result.inputCost > 0) {
        parts.push(`输入: ${formatCost(result.inputCost)}`);
    }
    if (result.outputCost > 0) {
        parts.push(`输出: ${formatCost(result.outputCost)}`);
    }

    return parts.join(', ') + ` (总计: ${formatCost(result.totalCost)})`;
}

/**
 * 估算消息的Token数量
 */
export function estimateTokenCount(text: string): number {
    // 粗略估算：1个Token约等于4个字符（英文）
    // 中文：1个Token约等于1.5个字符
    const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishCharCount = text.length - chineseCharCount;

    return Math.ceil(chineseCharCount / 1.5 + englishCharCount / 4);
}

/**
 * 计算批量请求的总成本
 */
export function calculateBatchCost(
    provider: AIProvider,
    model: string,
    requests: TokenUsage[]
): CostResult {
    const totalUsage = requests.reduce(
        (acc, usage) => ({
            inputTokens: acc.inputTokens + usage.inputTokens,
            outputTokens: acc.outputTokens + usage.outputTokens
        }),
        { inputTokens: 0, outputTokens: 0 }
    );

    return calculateCost(provider, model, totalUsage);
}
