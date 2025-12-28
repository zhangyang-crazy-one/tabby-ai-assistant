/**
 * AI相关类型定义
 */

// 消息角色
export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system'
}

// 聊天消息
export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

// 聊天请求
export interface ChatRequest {
    messages: ChatMessage[];
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    model?: string;
    tools?: any[];  // 工具定义列表
    enableTools?: boolean;  // 是否启用工具调用
}

// 聊天响应
export interface ChatResponse {
    message: ChatMessage;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// 命令请求
export interface CommandRequest {
    naturalLanguage: string;
    context?: {
        currentDirectory?: string;
        operatingSystem?: string;
        shell?: string;
        environment?: Record<string, string>;
    };
    constraints?: {
        maxLength?: number;
        allowedCommands?: string[];
        forbiddenCommands?: string[];
    };
}

// 命令响应
export interface CommandResponse {
    command: string;
    explanation: string;
    confidence: number; // 0-1
    alternatives?: {
        command: string;
        explanation: string;
        confidence: number;
    }[];
}

// 解释请求
export interface ExplainRequest {
    command: string;
    context?: {
        currentDirectory?: string;
        operatingSystem?: string;
    };
}

// 解释响应
export interface ExplainResponse {
    explanation: string;
    breakdown: {
        part: string;
        description: string;
    }[];
    examples?: string[];
}

// 分析请求
export interface AnalysisRequest {
    output: string;
    command: string;
    exitCode?: number;
    context?: {
        timestamp?: Date;
        workingDirectory?: string;
    };
}

// 分析响应
export interface AnalysisResponse {
    summary: string;
    insights: string[];
    issues?: {
        severity: 'warning' | 'error' | 'info';
        message: string;
        suggestion?: string;
    }[];
    success: boolean;
}

// 提供商能力
export enum ProviderCapability {
    CHAT = 'chat',
    COMMAND_GENERATION = 'command_generation',
    COMMAND_EXPLANATION = 'command_explanation',
    REASONING = 'reasoning',
    FUNCTION_CALL = 'function_call',
    STREAMING = 'streaming'
}

// 健康状态
export enum HealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy'
}

// 验证结果
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}

// ============================================================================
// 上下文工程相关类型定义
// ============================================================================

// API消息接口（支持压缩标记）
export interface ApiMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | ContentBlock[];
    ts: number;  // 时间戳（毫秒）

    // 压缩相关元数据
    isSummary?: boolean;        // 是否为摘要消息
    condenseId?: string;        // 摘要ID
    condenseParent?: string;    // 被哪个摘要压缩

    // 截断相关元数据
    isTruncationMarker?: boolean;  // 是否为截断标记
    truncationId?: string;         // 截断ID
    truncationParent?: string;     // 被哪个截断隐藏
}

// 内容块类型（用于支持工具调用）
export interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, any>;
    tool_use_id?: string;
    content?: string;
}

// Token使用统计
export interface TokenUsage {
    input: number;        // 输入token数
    output: number;       // 输出token数
    cacheRead: number;    // 缓存读取token数
    cacheWrite: number;   // 缓存写入token数
}

// 会话状态
export interface SessionState {
    id: string;
    messages: ApiMessage[];
    tokens: TokenUsage;
    createdAt: number;    // 创建时间戳（毫秒）
    updatedAt: number;    // 更新时间戳（毫秒）
    checkpoints: string[]; // 检查点ID列表
}

// 上下文管理配置
export interface ContextConfig {
    maxContextTokens: number;      // 最大上下文窗口大小
    reservedOutputTokens: number;  // 输出预留token数
    compactThreshold: number;      // 压缩触发阈值 (0-1)
    pruneThreshold: number;        // 裁剪触发阈值 (0-1)
    messagesToKeep: number;        // 保留的最近消息数
    bufferPercentage: number;      // 安全缓冲区百分比
    summaryPrompt?: string;        // 自定义摘要提示词
}

// 默认配置
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
    maxContextTokens: 200000,
    reservedOutputTokens: 16000,
    compactThreshold: 0.85,
    pruneThreshold: 0.70,
    messagesToKeep: 3,
    bufferPercentage: 0.10,
    summaryPrompt: '请用一句话总结以下对话的要点，保留关键信息和用户意图：'
};
export interface CompactionResult {
    success: boolean;
    messages: ApiMessage[];
    summary?: string;
    condenseId?: string;
    tokensSaved: number;
    cost: number;  // API调用成本
    error?: string;
}

// 裁剪结果
export interface PruneResult {
    pruned: boolean;
    tokensSaved: number;
    partsCompacted: number;
}

// 截断结果
export interface TruncationResult {
    messages: ApiMessage[];
    truncationId: string;
    messagesRemoved: number;
}

// 扩展现有 ChatMessage，添加压缩标记支持
export interface ExtendedChatMessage extends ChatMessage {
    // 压缩相关元数据（可选）
    isSummary?: boolean;        // 是否为摘要消息
    condenseId?: string;        // 摘要ID
    condenseParent?: string;    // 被哪个摘要压缩

    // 截断相关元数据（可选）
    isTruncationMarker?: boolean;  // 是否为截断标记
    truncationId?: string;         // 截断ID
    truncationParent?: string;     // 被哪个截断隐藏

    // Token使用统计（可选）
    tokenUsage?: TokenUsage;
}

// 检查点接口
export interface Checkpoint {
    id: string;
    sessionId: string;
    messages: ApiMessage[];
    summary: string;
    createdAt: number;  // 时间戳（毫秒）
    tokenUsage: TokenUsage;
}

// ============================================================================
// 流式响应相关类型定义
// ============================================================================

// 流式事件类型
export interface StreamEvent {
    type: 'text_delta' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'message_end' | 'error';
    // 文本增量
    textDelta?: string;
    // 工具调用（完整时才有）
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };
    // 错误信息
    error?: string;
    // 最终消息（message_end 时）
    message?: ChatMessage;
}
