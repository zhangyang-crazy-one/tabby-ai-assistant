import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
    MCPServerConfig,
    MCPTool,
    MCPResource,
    MCPCapabilities,
    MCPServerWithStatus,
    MCPServerStatus
} from './mcp-message.types';
import { BaseTransport } from './transports/base-transport';
import { StdioTransport } from './transports/stdio-transport';
import { SSETransport } from './transports/sse-transport';
import { HTTPStreamTransport } from './transports/http-transport';
import { LoggerService } from '../core/logger.service';
import { FileStorageService } from '../core/file-storage.service';
import { ToastService } from '../core/toast.service';

/**
 * MCP 客户端接口
 */
export interface MCPClient {
    id: string;
    config: MCPServerConfig;
    transport: BaseTransport;
    capabilities: MCPCapabilities;
    tools: MCPTool[];
    resources: MCPResource[];
    status: MCPServerStatus;
    error?: string;
}

/**
 * 工具调用记录
 */
export interface MCPToolCall {
    clientId: string;
    toolName: string;
    arguments: any;
    result?: any;
    success: boolean;
    error?: string;
    duration: number;
    timestamp: number;
}

/**
 * 工具调用统计
 */
export interface MCPToolCallStats {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    averageDuration: number;
}

/**
 * MCP 客户端管理器
 * 负责管理所有 MCP 服务器连接和工具调用
 */
@Injectable({
    providedIn: 'root'
})
export class MCPClientManager implements OnDestroy {
    private clients = new Map<string, MCPClient>();
    private destroy$ = new Subject<void>();
    private toolsChanged$ = new Subject<void>();
    private statusChanged$ = new Subject<MCPServerWithStatus>();

    /** 工具调用历史（最多保留1000条） */
    private toolCallHistory: MCPToolCall[] = [];

    /** 存储键名 */
    private readonly STORAGE_KEY = 'mcp-servers';

    /** 默认超时时间（毫秒） */
    private readonly DEFAULT_TIMEOUT = 30000;

    /** 最大重试次数 */
    private readonly MAX_RETRIES = 3;

    /** 最大历史记录数 */
    private readonly MAX_HISTORY_SIZE = 1000;

    constructor(
        private logger: LoggerService,
        private fileStorage: FileStorageService,
        private toast: ToastService
    ) {
        // 延迟加载已配置的服务器
        this.loadServerConfigs();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();

        // 断开所有连接
        this.disconnectAll();
    }

    /**
     * 连接到 MCP 服务器
     */
    async connect(config: MCPServerConfig): Promise<void> {
        const clientId = config.id;

        // 如果已连接，先断开
        if (this.clients.has(clientId)) {
            await this.disconnect(clientId);
        }

        // 更新状态为连接中
        this.updateStatus(clientId, 'connecting');

        try {
            // 创建传输层
            const transport = this.createTransport(config);

            // 连接
            await transport.connect();

            // 发送初始化请求
            const initResponse = await transport.send({
                jsonrpc: '2.0',
                id: this.generateId(),
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'tabby-ai-assistant',
                        version: '1.0.0'
                    }
                }
            });

            if (initResponse.error) {
                throw new Error(initResponse.error.message);
            }

            // 发送初始化完成通知
            await transport.send({
                jsonrpc: '2.0',
                id: this.generateId(),
                method: 'notifications/initialized'
            });

            // 获取工具列表
            let tools: MCPTool[] = [];
            try {
                const toolsResponse = await transport.send({
                    jsonrpc: '2.0',
                    id: this.generateId(),
                    method: 'tools/list'
                });
                tools = toolsResponse.result?.tools || [];
            } catch (e) {
                // 服务器可能不支持 tools/list
                this.logger.warn('Failed to list tools', { serverId: clientId, error: e });
            }

            // 获取资源列表（可选）
            let resources: MCPResource[] = [];
            try {
                const resourcesResponse = await transport.send({
                    jsonrpc: '2.0',
                    id: this.generateId(),
                    method: 'resources/list'
                });
                resources = resourcesResponse.result?.resources || [];
            } catch (e) {
                // 服务器可能不支持 resources/list
                this.logger.warn('Failed to list resources', { serverId: clientId, error: e });
            }

            // 创建客户端
            const client: MCPClient = {
                id: clientId,
                config,
                transport,
                capabilities: initResponse.result?.capabilities || {},
                tools,
                resources,
                status: 'connected'
            };

            this.clients.set(clientId, client);

            // 更新状态
            this.updateStatus(clientId, 'connected');

            // 通知工具变更
            this.toolsChanged$.next();

            this.logger.info('MCP server connected', {
                id: clientId,
                name: config.name,
                toolCount: tools.length,
                resourceCount: resources.length
            });

            // 显示成功提示
            this.toast.success(`已连接到 MCP 服务器: ${config.name}`);
        } catch (error: any) {
            this.logger.error('Failed to connect MCP server', { id: clientId, error });
            this.updateStatus(clientId, 'error', error.message);
            this.toast.error(`连接 MCP 服务器失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 断开 MCP 服务器连接
     */
    async disconnect(serverId: string): Promise<void> {
        const client = this.clients.get(serverId);
        if (!client) {
            return;
        }

        try {
            await client.transport.disconnect();
        } catch (error) {
            console.error('Error disconnecting MCP server:', error);
        }

        this.clients.delete(serverId);

        // 更新状态
        this.updateStatus(serverId, 'disconnected');

        // 通知工具变更
        this.toolsChanged$.next();

        this.logger.info('MCP server disconnected', { id: serverId });
    }

    /**
     * 断开所有连接
     */
    async disconnectAll(): Promise<void> {
        const ids = Array.from(this.clients.keys());
        await Promise.all(ids.map(id => this.disconnect(id)));
    }

    /**
     * 调用 MCP 工具（带超时和重试）
     */
    async callTool(serverId: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`MCP server ${serverId} not connected`);
        }

        if (client.status !== 'connected') {
            throw new Error(`MCP server ${serverId} is not connected`);
        }

        // 获取超时配置
        const timeout = client.config.timeout || this.DEFAULT_TIMEOUT;

        // 带超时的调用
        const callWithTimeout = async (): Promise<any> => {
            return Promise.race([
                this.callToolOnce(serverId, toolName, args),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Tool call timeout after ${timeout}ms`)), timeout)
                )
            ]);
        };

        // 记录开始时间
        const startTime = Date.now();

        // 带重试的调用
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                const result = await callWithTimeout();

                // 记录成功调用
                this.logToolCall({
                    clientId: serverId,
                    toolName,
                    arguments: args,
                    result,
                    success: true,
                    duration: Date.now() - startTime,
                    timestamp: Date.now()
                });

                return result;
            } catch (error: any) {
                lastError = error;

                // 如果还有重试次数，等待后重试
                if (attempt < this.MAX_RETRIES) {
                    const delay = 1000 * (attempt + 1); // 递增延迟: 1s, 2s, 3s
                    this.logger.warn(`Tool call failed, retrying in ${delay}ms`, {
                        serverId,
                        toolName,
                        attempt: attempt + 1,
                        error: error.message
                    });
                    await this.sleep(delay);
                }
            }
        }

        // 所有重试都失败了
        this.logToolCall({
            clientId: serverId,
            toolName,
            arguments: args,
            success: false,
            error: lastError?.message,
            duration: Date.now() - startTime,
            timestamp: Date.now()
        });

        this.logger.error('Tool call failed after all retries', {
            serverId,
            toolName,
            retries: this.MAX_RETRIES,
            error: lastError?.message
        });

        throw lastError;
    }

    /**
     * 实际执行一次工具调用（内部方法）
     */
    private async callToolOnce(serverId: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`MCP server ${serverId} not connected`);
        }

        const response = await client.transport.send({
            jsonrpc: '2.0',
            id: this.generateId(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.result;
    }

    /**
     * 记录工具调用
     */
    private logToolCall(call: MCPToolCall): void {
        this.toolCallHistory.unshift(call);

        // 限制历史记录数量
        if (this.toolCallHistory.length > this.MAX_HISTORY_SIZE) {
            this.toolCallHistory = this.toolCallHistory.slice(0, this.MAX_HISTORY_SIZE);
        }

        // 调试日志
        this.logger.debug('MCP tool call', {
            clientId: call.clientId,
            toolName: call.toolName,
            success: call.success,
            duration: call.duration
        });
    }

    /**
     * 调用工具并格式化结果
     */
    async callToolFormatted(serverId: string, toolName: string, args: any): Promise<string> {
        try {
            const result = await this.callTool(serverId, toolName, args);

            // 格式化结果
            if (typeof result === 'string') {
                return result;
            }

            if (Array.isArray(result)) {
                return result.map(item => {
                    if (typeof item === 'string') return item;
                    return JSON.stringify(item, null, 2);
                }).join('\n');
            }

            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    }

    /**
     * 获取所有可用工具
     */
    getAllTools(): Array<{ clientId: string; clientName: string; tool: MCPTool }> {
        const allTools: Array<{ clientId: string; clientName: string; tool: MCPTool }> = [];

        this.clients.forEach((client, clientId) => {
            if (client.status === 'connected') {
                client.tools.forEach(tool => {
                    allTools.push({
                        clientId,
                        clientName: client.config.name,
                        tool
                    });
                });
            }
        });

        return allTools;
    }

    /**
     * 获取所有工具（包括名称前缀）
     */
    getAllToolsWithPrefix(): Array<{ name: string; description: string; inputSchema: any }> {
        return this.getAllTools().map(({ clientId, clientName, tool }) => ({
            name: `mcp_${clientId}_${tool.name}`,
            description: `[MCP:${clientName}] ${tool.description}`,
            inputSchema: tool.inputSchema
        }));
    }

    /**
     * 解析工具调用
     */
    parseToolCall(toolName: string): { clientId: string; toolName: string } | null {
        if (!toolName.startsWith('mcp_')) {
            return null;
        }

        const parts = toolName.split('_');
        if (parts.length < 3) {
            return null;
        }

        const clientId = parts[1];
        const actualToolName = parts.slice(2).join('_');

        return { clientId, toolName: actualToolName };
    }

    /**
     * 执行 MCP 工具调用
     */
    async executeMCPTool(toolName: string, args: any): Promise<string> {
        const parsed = this.parseToolCall(toolName);
        if (!parsed) {
            return 'Error: Invalid MCP tool name format';
        }

        const { clientId, toolName: actualToolName } = parsed;

        try {
            return await this.callToolFormatted(clientId, actualToolName, args);
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    }

    /**
     * 获取所有服务器状态
     */
    getAllServers(): MCPServerWithStatus[] {
        const configs = this.fileStorage.load<MCPServerConfig[]>(this.STORAGE_KEY, []);

        return configs.map(config => {
            const client = this.clients.get(config.id);
            return {
                ...config,
                status: client?.status || 'disconnected',
                error: client?.error,
                toolCount: client?.tools.length || 0
            };
        });
    }

    /**
     * 获取单个服务器
     */
    getServer(serverId: string): MCPServerWithStatus | undefined {
        return this.getAllServers().find(s => s.id === serverId);
    }

    /**
     * 添加服务器配置
     */
    async addServer(config: MCPServerConfig): Promise<void> {
        const configs = this.fileStorage.load<MCPServerConfig[]>(this.STORAGE_KEY, []);
        configs.push(config);
        this.fileStorage.save(this.STORAGE_KEY, configs);

        // 如果启用，立即连接
        if (config.enabled) {
            await this.connect(config);
        }
    }

    /**
     * 更新服务器配置
     */
    async updateServer(config: MCPServerConfig): Promise<void> {
        const configs = this.fileStorage.load<MCPServerConfig[]>(this.STORAGE_KEY, []);
        const index = configs.findIndex(c => c.id === config.id);

        if (index !== -1) {
            // 如果服务器已连接，先断开
            if (this.clients.has(config.id)) {
                await this.disconnect(config.id);
            }

            configs[index] = config;
            this.fileStorage.save(this.STORAGE_KEY, configs);

            // 如果启用，重新连接
            if (config.enabled) {
                await this.connect(config);
            }
        }
    }

    /**
     * 删除服务器配置
     */
    async deleteServer(serverId: string): Promise<void> {
        // 断开连接
        await this.disconnect(serverId);

        // 删除配置
        const configs = this.fileStorage.load<MCPServerConfig[]>(this.STORAGE_KEY, []);
        const filtered = configs.filter(c => c.id !== serverId);
        this.fileStorage.save(this.STORAGE_KEY, filtered);

        // 通知变更
        this.toolsChanged$.next();
    }

    /**
     * 工具变更事件
     */
    get onToolsChanged(): Observable<void> {
        return this.toolsChanged$.asObservable();
    }

    /**
     * 服务器状态变更事件
     */
    get onStatusChanged(): Observable<MCPServerWithStatus> {
        return this.statusChanged$.asObservable();
    }

    /**
     * 生成唯一 ID
     */
    private generateId(): number {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    /**
     * 更新服务器状态
     */
    private updateStatus(serverId: string, status: MCPServerStatus, error?: string): void {
        const server = this.getServer(serverId);
        if (server) {
            const updated = { ...server, status, error };
            this.statusChanged$.next(updated);
        }
    }

    /**
     * 创建传输层
     */
    private createTransport(config: MCPServerConfig): BaseTransport {
        switch (config.transport) {
            case 'stdio':
                return new StdioTransport(
                    config.command!,
                    config.args || [],
                    { env: config.env, cwd: config.cwd }
                );

            case 'sse':
                return new SSETransport(config.url!, config.headers);

            case 'streamable-http':
                return new HTTPStreamTransport(config.url!, config.headers);

            default:
                throw new Error(`Unknown transport type: ${config.transport}`);
        }
    }

    /**
     * 加载已保存的服务器配置
     */
    private loadServerConfigs(): void {
        try {
            const configs = this.fileStorage.load<MCPServerConfig[]>(this.STORAGE_KEY, []);

            // 连接所有已启用的服务器
            configs.filter(c => c.enabled).forEach(config => {
                this.connect(config).catch(error => {
                    this.logger.error('Failed to auto-connect MCP server', {
                        id: config.id,
                        error
                    });
                });
            });
        } catch (error) {
            this.logger.error('Failed to load MCP server configs', error);
        }
    }

    /**
     * 生成服务器 ID
     */
    static generateServerId(): string {
        return `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取工具调用历史
     */
    getToolCallHistory(limit?: number): MCPToolCall[] {
        if (limit && limit > 0) {
            return this.toolCallHistory.slice(0, limit);
        }
        return [...this.toolCallHistory];
    }

    /**
     * 获取指定服务器的工具调用历史
     */
    getToolCallHistoryByClient(clientId: string, limit?: number): MCPToolCall[] {
        const filtered = this.toolCallHistory.filter(call => call.clientId === clientId);
        if (limit && limit > 0) {
            return filtered.slice(0, limit);
        }
        return filtered;
    }

    /**
     * 获取工具调用统计信息
     */
    getToolCallStats(): MCPToolCallStats {
        const totalCalls = this.toolCallHistory.length;
        const successCalls = this.toolCallHistory.filter(call => call.success).length;
        const failedCalls = totalCalls - successCalls;

        const averageDuration = totalCalls > 0
            ? this.toolCallHistory.reduce((sum, call) => sum + call.duration, 0) / totalCalls
            : 0;

        return {
            totalCalls,
            successCalls,
            failedCalls,
            averageDuration: Math.round(averageDuration)
        };
    }

    /**
     * 清除工具调用历史
     */
    clearToolCallHistory(): void {
        this.toolCallHistory = [];
        this.logger.info('Tool call history cleared');
    }

    /**
     * 延迟辅助方法
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
