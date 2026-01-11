import { BaseTransport } from './base-transport';
import { MCPRequest, MCPResponse } from '../mcp-message.types';

/**
 * Streamable HTTP 传输层实现
 * 用于与远程 MCP 服务器通过 HTTP 通信
 * 支持双向流式传输
 */
export class HTTPStreamTransport extends BaseTransport {
    private sessionId: string | null = null;
    private messageQueue: MCPRequest[] = [];
    private requestId = 0;
    private pendingRequests = new Map<string | number, {
        resolve: (value: MCPResponse) => void;
        reject: (reason: any) => void;
    }>();
    private abortController: AbortController | null = null;

    constructor(
        private url: string,
        private headers: Record<string, string> = {},
        private options: { timeout?: number } = {}
    ) {
        super();
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        try {
            // 发送初始化请求
            const initRequest: MCPRequest = {
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
            };

            const response = await this.sendRaw(initRequest);

            // 提取 session ID（如果服务器支持）
            this.sessionId = this.extractSessionId(response);

            // 发送初始化完成通知
            await this.sendRaw({
                jsonrpc: '2.0',
                id: this.generateId(),
                method: 'notifications/initialized'
            });

            this.connected = true;

            // 开始接收服务器推送（如果支持）
            this.startServerSentEvents();
        } catch (error) {
            console.error('[MCP HTTP] Failed to connect:', error);
            this.connected = false;
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.connected = false;
        this.sessionId = null;
        this.messageQueue = [];

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
            this.sendRaw(request).catch((error) => {
                this.pendingRequests.delete(request.id);
                reject(error);
            });
        });
    }

    /**
     * 发送原始请求
     */
    private async sendRaw(request: MCPRequest): Promise<MCPResponse> {
        const timeout = this.options.timeout || 30000;

        try {
            const fetchOptions: RequestInit = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    ...this.headers
                },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(timeout)
            };

            // 添加 session ID 头（如果已获取）
            if (this.sessionId) {
                (fetchOptions.headers as Record<string, string>)['Mcp-Session-Id'] = this.sessionId;
            }

            const response = await fetch(this.url, fetchOptions);

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }

            // 检查内容类型
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                // 处理流式响应
                return await this.handleStreamResponse(response);
            }

            // 处理普通 JSON 响应
            return await response.json();
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                // fetch 不可用（Electron 旧版本）
                throw new Error('Network request failed. Please ensure the server URL is accessible.');
            }
            throw error;
        }
    }

    /**
     * 处理流式响应
     */
    private async handleStreamResponse(response: Response): Promise<MCPResponse> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body available');
        }

        const decoder = new TextDecoder();
        let result: MCPResponse | null = null;
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if ('id' in data && data.id !== null) {
                            // 这是一个响应
                            result = data;
                        } else if (data.jsonrpc && !('id' in data)) {
                            // 这是一个通知
                            this.emitMessage(data);
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }

        if (!result) {
            throw new Error('No response received from stream');
        }

        return result;
    }

    /**
     * 开始接收服务器推送事件
     */
    private startServerSentEvents(): void {
        // 如果服务器支持 SSE，创建一个新的请求来接收推送
        // 这是一个可选功能，主要用于接收 notifications
        const sseUrl = this.buildSSEUrl();
        if (!sseUrl) return;

        try {
            this.abortController = new AbortController();

            // 使用 fetch 进行长轮询或 SSE
            this.pollForMessages().catch((error) => {
                if (!this.isDestroyed()) {
                    console.error('[MCP HTTP] Polling error:', error);
                }
            });
        } catch (error) {
            console.warn('[MCP HTTP] Failed to start SSE:', error);
        }
    }

    /**
     * 长轮询接收消息
     */
    private async pollForMessages(): Promise<void> {
        while (this.connected && this.abortController && !this.abortController.signal.aborted) {
            try {
                const response = await fetch(this.buildPollUrl(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/event-stream',
                        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
                        ...this.headers
                    },
                    signal: this.abortController.signal
                });

                if (!response.ok) {
                    break;
                }

                const reader = response.body?.getReader();
                if (!reader) break;

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // 处理 SSE 格式
                    while (buffer.includes('\n\n')) {
                        const eventEnd = buffer.indexOf('\n\n');
                        const eventData = buffer.slice(0, eventEnd);
                        buffer = buffer.slice(eventEnd + 2);

                        if (eventData.startsWith('data: ')) {
                            try {
                                const message = JSON.parse(eventData.slice(6));
                                this.emitMessage(message);
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    break;
                }
                // 轮询出错，等待后重试
                await this.sleep(5000);
            }
        }
    }

    /**
     * 构建 SSE URL
     */
    private buildSSEUrl(): string | null {
        // 尝试将普通 URL 转换为 SSE 端点
        if (this.url.endsWith('/message')) {
            return this.url.replace('/message', '/events');
        }
        if (this.url.endsWith('/')) {
            return this.url + 'events';
        }
        return this.url + '/events';
    }

    /**
     * 构建轮询 URL
     */
    private buildPollUrl(): string {
        // 对于 HTTP 传输，通常使用相同的端点进行轮询
        return this.url;
    }

    /**
     * 从响应中提取 session ID
     */
    private extractSessionId(response: MCPResponse): string | null {
        // 尝试从响应头获取
        // 注意：由于我们使用 fetch，响应头可能不可用
        return null;
    }

    /**
     * 生成请求 ID
     */
    private generateId(): number {
        this.requestId++;
        return this.requestId;
    }

    /**
     * 休眠辅助函数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取 session ID
     */
    getSessionId(): string | null {
        return this.sessionId;
    }
}
