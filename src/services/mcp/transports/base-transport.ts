import { Subject, Observable } from 'rxjs';
import { MCPRequest, MCPResponse, MCPNotification } from '../mcp-message.types';

/**
 * 传输层抽象基类
 * 定义所有传输层实现的通用接口
 */
export abstract class BaseTransport {
    protected messageSubject = new Subject<MCPResponse | MCPNotification>();
    protected connected = false;
    protected destroyed = false;

    /**
     * 连接到服务器
     */
    abstract connect(): Promise<void>;

    /**
     * 断开连接
     */
    abstract disconnect(): Promise<void>;

    /**
     * 发送请求并等待响应
     */
    abstract send(request: MCPRequest): Promise<MCPResponse>;

    /**
     * 消息流 Observable
     */
    get messages$(): Observable<MCPResponse | MCPNotification> {
        return this.messageSubject.asObservable();
    }

    /**
     * 连接状态
     */
    get isConnected(): boolean {
        return this.connected;
    }

    /**
     * 是否已销毁
     */
    protected isDestroyed(): boolean {
        return this.destroyed;
    }

    /**
     * 销毁传输层
     */
    destroy(): void {
        this.destroyed = true;
        this.messageSubject.complete();
    }

    /**
     * 发送消息到消息流
     */
    protected emitMessage(message: MCPResponse | MCPNotification): void {
        if (!this.destroyed) {
            this.messageSubject.next(message);
        }
    }

    /**
     * 处理 JSON 解析错误
     */
    protected handleParseError(error: any): void {
        console.error('[MCP Transport] Failed to parse message:', error);
    }
}
