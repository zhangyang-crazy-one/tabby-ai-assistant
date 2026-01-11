/**
 * MCP (Model Context Protocol) 消息类型定义
 * 参考: https://modelcontextprotocol.io/
 */

/**
 * MCP 传输类型
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamable-http';

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
    id: string;
    name: string;
    transport: MCPTransportType;
    enabled: boolean;

    // stdio 配置
    command?: string;        // 启动命令，如 'npx'
    args?: string[];         // 命令参数，如 ['-y', '@modelcontextprotocol/server-filesystem']
    env?: Record<string, string>;
    cwd?: string;

    // HTTP/SSE 配置
    url?: string;            // 服务器 URL
    headers?: Record<string, string>;
    apiKey?: string;

    // 通用选项
    timeout?: number;        // 请求超时时间（毫秒）
    autoConnect?: boolean;   // 启动时自动连接
}

/**
 * MCP JSON-RPC 请求
 */
export interface MCPRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: any;
}

/**
 * MCP JSON-RPC 响应
 */
export interface MCPResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * MCP 通知（无需响应）
 */
export interface MCPNotification {
    jsonrpc: '2.0';
    method: string;
    params?: any;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

/**
 * MCP 提示定义
 */
export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

/**
 * MCP 能力声明
 */
export interface MCPCapabilities {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: { listChanged?: boolean };
}

/**
 * MCP 初始化参数
 */
export interface MCPInitializeParams {
    protocolVersion: string;
    capabilities: MCPCapabilities;
    clientInfo: {
        name: string;
        version: string;
    };
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolResult {
    content: Array<{
        type: 'text' | 'image' | 'audio' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
        uri?: string;
    }>;
    isError?: boolean;
}

/**
 * MCP 资源内容
 */
export interface MCPResourceContent {
    uri: string;
    mimeType: string;
    text: string;
}

/**
 * MCP 服务器状态
 */
export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * 带状态的 MCP 服务器
 */
export interface MCPServerWithStatus extends MCPServerConfig {
    status: MCPServerStatus;
    error?: string;
    toolCount?: number;
}

/**
 * MCP 传输层选项
 */
export interface MCPTransportOptions {
    // stdio 选项
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;

    // HTTP 选项
    url?: string;
    headers?: Record<string, string>;

    // 通用选项
    timeout?: number;
    retries?: number;
}
