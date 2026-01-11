import { BaseTransport } from './base-transport';
import { MCPRequest, MCPResponse } from '../mcp-message.types';

/**
 * SSE (Server-Sent Events) 传输层实现
 * 用于只读的远程 MCP 服务器通信
 * 通过 HTTP POST 发送请求，通过 SSE 接收事件
 */
export class SSETransport extends BaseTransport {
    private eventSource: EventSource | null = null;
    private pendingRequests = new Map<string | number, {
        resolve: (value: MCPResponse) => void;
        reject: (reason: any) => void;
    }>();
    private requestId = 0;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 3000;
    private eventsUrl: string;
    private messageUrl: string;

    constructor(
        private url: string,
        private headers: Record<string, string> = {}
    ) {
        super();
        // 分离事件 URL 和消息 URL
        this.eventsUrl = this.buildEventsUrl();
        this.messageUrl = this.buildMessageUrl();
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        try {
            // 创建 EventSource 用于接收服务器推送
            this.createEventSource();

            this.connected = true;
            this.reconnectAttempts = 0;
        } catch (error) {
            console.error('[MCP SSE] Failed to connect:', error);
            this.connected = false;
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.connected = false;

        // 拒绝所有待处理的请求
        this.pendingRequests.forEach(({ reject }) => {
            reject(new Error('Transport disconnected'));
        });
        this.pendingRequests.clear();
    }

    async send(request: MCPRequest): Promise<MCPResponse> {
        if (!this.connected) {
            throw new Error('Transport not connected');
        }

        if (!request.id) {
            request.id = this.generateId();
        }

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(request.id, { resolve, reject });
            this.sendRequest(request).catch((error) => {
                this.pendingRequests.delete(request.id);
                reject(error);
            });
        });
    }

    /**
     * 创建 EventSource
     */
    private createEventSource(): void {
        // 构建 EventSource URL（带认证头）
        const url = new URL(this.eventsUrl);

        // 如果有 API Key，添加到 URL 参数
        if (this.headers['Authorization']) {
            url.searchParams.set('auth', this.headers['Authorization']);
        }

        // 添加时间戳防止缓存
        url.searchParams.set('_t', Date.now().toString());

        try {
            this.eventSource = new EventSource(url.toString());

            this.eventSource.onopen = () => {
                console.log('[MCP SSE] Connection opened');
                this.reconnectAttempts = 0;
            };

            this.eventSource.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.eventSource.onerror = (error) => {
                console.error('[MCP SSE] Connection error:', error);
                this.handleError();
            };
        } catch (error) {
            console.error('[MCP SSE] Failed to create EventSource:', error);
            throw error;
        }
    }

    /**
     * 处理接收到的消息
     */
    private handleMessage(data: string): void {
        try {
            const message = JSON.parse(data);

            if ('id' in message && message.id !== null) {
                // 这是一个响应
                const pending = this.pendingRequests.get(message.id);
                if (pending) {
                    this.pendingRequests.delete(message.id);
                    pending.resolve(message);
                }
            } else if (message.jsonrpc && message.method) {
                // 这是一个通知
                this.emitMessage(message);
            }
        } catch (error) {
            this.handleParseError(error);
        }
    }

    /**
     * 处理连接错误
     */
    private handleError(): void {
        this.connected = false;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[MCP SSE] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

            setTimeout(() => {
                this.createEventSource();
                this.connected = true;
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            console.error('[MCP SSE] Max reconnect attempts reached');

            // 拒绝所有待处理的请求
            this.pendingRequests.forEach(({ reject }) => {
                reject(new Error('Connection failed after max reconnect attempts'));
            });
            this.pendingRequests.clear();
        }
    }

    /**
     * 发送 HTTP POST 请求
     */
    private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
        const timeout = 30000;

        try {
            const response = await fetch(this.messageUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.headers
                },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(timeout)
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error('Network request failed. Please ensure the server URL is accessible.');
            }
            throw error;
        }
    }

    /**
     * 构建事件 URL
     */
    private buildEventsUrl(): string {
        // 常见模式: /events, /sse, /stream
        if (this.url.endsWith('/')) {
            return this.url + 'events';
        }
        if (this.url.includes('/message')) {
            return this.url.replace('/message', '/events');
        }
        if (this.url.includes('/send')) {
            return this.url.replace('/send', '/events');
        }
        return this.url + '/events';
    }

    /**
     * 构建消息 URL
     */
    private buildMessageUrl(): string {
        // 常见模式: /message, /send, /rpc
        if (this.url.endsWith('/events')) {
            return this.url.replace('/events', '/message');
        }
        if (this.url.endsWith('/sse')) {
            return this.url.replace('/sse', '/message');
        }
        if (this.url.includes('/events')) {
            return this.url.replace('/events', '/message');
        }
        // 默认添加 /message
        if (this.url.endsWith('/')) {
            return this.url + 'message';
        }
        return this.url + '/message';
    }

    /**
     * 生成请求 ID
     */
    private generateId(): number {
        this.requestId++;
        return this.requestId;
    }

    /**
     * 获取连接状态
     */
    get readyState(): number | undefined {
        return this.eventSource?.readyState;
    }
}
