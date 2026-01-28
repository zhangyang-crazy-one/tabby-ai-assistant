/**
 * AI相关类型定义
 */

// 消息角色
export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL = 'tool'      // 工具结果角色（部分 AI 需要）
}

// 聊天消息
export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
    // UI 渲染块（用于结构化渲染工具调用）
    uiBlocks?: Array<{
        type: 'text' | 'tool' | 'divider' | 'status' | 'task_summary' | 'async_task';
        id?: string;
        name?: string;
        icon?: string;
        status?: 'executing' | 'success' | 'error';
        content?: string;
        output?: {
            format: 'text' | 'code' | 'table' | 'json' | 'hidden';
            content: string;
            language?: string;
            truncated: boolean;
            originalLength: number;
            summary?: string;
        };
        duration?: number;
        errorMessage?: string;
        round?: number;
        text?: string;
        detail?: string;
        rounds?: number;
        // task_summary 专用字段
        success?: boolean;
        summary?: string;
        nextSteps?: string;
        // async_task 专用字段
        taskId?: string;
        command?: string;
        outputPreview?: string;
        expanded?: boolean;
    }>;
    // 工具调用相关字段（用于 Agent 循环和消息转换）
    toolCalls?: Array<{
        id: string;
        name: string;
        input?: Record<string, any>;
    }>;
    // 工具结果相关字段（供 transformMessages 识别）
    toolResults?: Array<{
        tool_use_id: string;
        name?: string;
        content: string;
        is_error?: boolean;
    }>;
    tool_use_id?: string;  // 简单工具 ID 标识
    // 摘要标记（用于上下文压缩）
    isSummary?: boolean;
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
    role: 'user' | 'assistant' | 'system' | 'tool' | 'function';
    content: string | ContentBlock[];
    ts: number;  // 时间戳（毫秒）

    // 压缩相关元数据
    isSummary?: boolean;        // 是否为摘要消息
    condenseId?: string;        // 摘要ID
    condenseParent?: string;    // 被哪个摘要压缩
    summaryMeta?: {             // 摘要元数据
        originalMessageCount: number;
        tokensCost: number;
        compressionRatio: number;
    };

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

// 压缩后的检查点数据接口
export interface CompressedCheckpointData {
    compressed: boolean;
    compressionRatio: number;
    originalSize: number;
    compressedSize: number;
    messages?: ApiMessage[]; // 可选，用于即时访问
    messagesJson: string; // 压缩后的JSON字符串
}

// 检查点接口
export interface Checkpoint {
    id: string;
    sessionId: string;
    messages: ApiMessage[];
    summary: string;
    createdAt: number;  // 时间戳（毫秒）
    tokenUsage: TokenUsage;
    compressedData?: CompressedCheckpointData; // 压缩数据（可选）

    // 新增字段
    tags?: string[];      // 标签列表
    isArchived?: boolean; // 是否已归档
}

// ============================================================================
// 流式响应相关类型定义
// ============================================================================

// 流式事件类型
export interface StreamEvent {
    type: 'text_delta' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'tool_result' | 'tool_error' | 'message_end' | 'error';
    // 文本增量
    textDelta?: string;
    // 工具调用（完整时才有）
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };
    // 工具结果（tool_result 事件）
    result?: {
        tool_use_id: string;
        content: string;
        is_error?: boolean;
    };
    // 错误信息
    error?: string;
    // 最终消息（message_end 时）
    message?: ChatMessage;
}

// ============================================================================
// Agent 循环相关类型定义
// ============================================================================

// 工具调用接口
export interface ToolCall {
    id: string;
    name: string;
    input: any;
}

// 工具结果接口
export interface ToolResult {
    tool_use_id: string;
    name?: string;        // 工具名称
    content: string;
    is_error?: boolean;
}

// Agent 事件类型
export type AgentEventType =
    | 'text_delta'           // 文本增量
    | 'tool_use_start'       // 工具开始
    | 'tool_use_end'         // 工具调用结束（收集参数）
    | 'tool_executing'       // 工具正在执行
    | 'tool_executed'        // 工具执行完成（带结果）
    | 'tool_error'           // 工具执行错误
    | 'round_start'          // 新一轮开始
    | 'round_end'            // 一轮结束
    | 'agent_complete'       // Agent 循环完成
    | 'error';               // 错误

// Agent 流式事件
export interface AgentStreamEvent {
    type: AgentEventType;

    // text_delta 事件
    textDelta?: string;

    // 工具相关事件
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };

    // tool_executed/tool_error 事件
    toolResult?: {
        tool_use_id: string;
        content: string;
        is_error?: boolean;
        duration?: number;
    };

    // round_start/round_end 事件
    round?: number;

    // agent_complete 事件
    reason?: TerminationReason;
    totalRounds?: number;
    terminationMessage?: string;  // 可选的终止详情消息

    // error 事件
    error?: string;

    // message_end 保留
    message?: ChatMessage;
}

// Agent 循环配置
export interface AgentLoopConfig {
    maxRounds?: number;           // 最大轮数，默认 15
    timeoutMs?: number;           // 默认 120000 (2分钟)
    repeatThreshold?: number;     // 默认 3 次
    failureThreshold?: number;    // 默认 2 次
    enableTaskComplete?: boolean; // 默认 true
    onRoundStart?: (round: number) => void;
    onRoundEnd?: (round: number) => void;
    onAgentComplete?: (reason: string, totalRounds: number) => void;
}

// ============================================================================
// 智能 Agent 终止相关类型定义
// ============================================================================

// 终止原因枚举
export type TerminationReason =
    | 'task_complete'      // AI 主动调用 task_complete 工具
    | 'no_tools'           // 本轮无工具调用
    | 'mentioned_tool'     // AI 提及工具但未调用
    | 'summarizing'        // 检测到 AI 正在总结
    | 'repeated_tool'      // 重复调用相同工具
    | 'high_failure_rate'  // 连续失败率过高
    | 'timeout'            // 总时间超时
    | 'max_rounds'         // 达到最大轮数（安全保底）
    | 'user_cancel';       // 用户取消

// Agent 状态追踪
export interface AgentState {
    currentRound: number;
    startTime: number;
    toolCallHistory: ToolCallRecord[];
    lastAiResponse: string;
    isActive: boolean;
}

// 工具调用记录
export interface ToolCallRecord {
    name: string;
    input: any;
    inputHash: string;  // 用于快速比较
    success: boolean;
    timestamp: number;
}

// 终止检测结果
export interface TerminationResult {
    shouldTerminate: boolean;
    reason: TerminationReason;
    message?: string;
}

// 扩展 ToolResult 添加任务完成标记
export interface ExtendedToolResult extends ToolResult {
    isTaskComplete?: boolean;  // 特殊标记：task_complete 工具调用
}
