import { BaseTransport } from './base-transport';
import { MCPRequest, MCPResponse } from '../mcp-message.types';

/**
 * Stdio 传输层实现
 * 用于与本地 MCP 服务器进程通信
 */
export class StdioTransport extends BaseTransport {
    private process: any = null; // ChildProcess
    private pendingRequests = new Map<string | number, {
        resolve: (value: MCPResponse) => void;
        reject: (reason: any) => void;
    }>();
    private buffer = '';
    private requestId = 0;

    constructor(
        private command: string,
        private args: string[] = [],
        private options: { env?: Record<string, string>; cwd?: string } = {}
    ) {
        super();
    }

    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        try {
            // 获取 Node.js 的 child_process 模块
            const { spawn } = (window as any).require?.('child_process') ||
                (typeof require !== 'undefined' ? require('child_process') : null);

            if (!spawn) {
                throw new Error('child_process module not available');
            }

            // 构建环境变量
            const env = {
                ...(typeof process !== 'undefined' ? process.env : {}),
                ...this.options.env,
                // 确保 NODE_ENV 设置正确
                NODE_ENV: 'production'
            };

            // 检测操作系统
            const isWindows = typeof process !== 'undefined' && process.platform === 'win32';

            // Windows 兼容性处理：对于 npx/npm/node 命令使用 shell 模式
            let command = this.command;
            const needsShell = ['npx', 'npm', 'node', 'yarn', 'pnpm'].some(
                cmd => this.command.toLowerCase() === cmd || this.command.toLowerCase().endsWith(`/${cmd}`) || this.command.toLowerCase().endsWith(`\\${cmd}`)
            );

            this.process = spawn(command, this.args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env,
                cwd: this.options.cwd || (typeof process !== 'undefined' ? process.cwd() : '.'),
                // Windows 上使用 shell 模式来解决 ENOENT 问题
                shell: isWindows && needsShell
            });

            // 设置 stdout 处理
            if (this.process.stdout) {
                this.process.stdout.on('data', (data: Buffer) => {
                    this.handleData(data.toString());
                });
            }

            // 设置 stderr 处理
            if (this.process.stderr) {
                this.process.stderr.on('data', (data: Buffer) => {
                    console.error('[MCP Stdio] stderr:', data.toString());
                });
            }

            // 设置进程关闭处理
            if (this.process.on) {
                this.process.on('close', (code: number) => {
                    this.handleClose(code);
                });

                this.process.on('error', (error: Error) => {
                    console.error('[MCP Stdio] Process error:', error);
                    this.handleError(error);
                });
            }

            this.connected = true;

            // 等待进程初始化
            await this.waitForProcess();
        } catch (error) {
            console.error('[MCP Stdio] Failed to connect:', error);
            this.connected = false;
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (!this.process) {
            return;
        }

        try {
            if (this.process.kill) {
                this.process.kill('SIGTERM');
            }
            if (this.process.stdin) {
                this.process.stdin.end();
            }
        } catch (error) {
            console.error('[MCP Stdio] Error during disconnect:', error);
        }

        this.process = null;
        this.connected = false;
        this.buffer = '';

        // 拒绝所有待处理的请求
        this.pendingRequests.forEach(({ reject }) => {
            reject(new Error('Transport disconnected'));
        });
        this.pendingRequests.clear();
    }

    async send(request: MCPRequest): Promise<MCPResponse> {
        if (!this.connected || !this.process) {
            throw new Error('Transport not connected');
        }

        // 确保请求有 ID
        if (!request.id) {
            request.id = this.generateId();
        }

        return new Promise((resolve, reject) => {
            try {
                this.pendingRequests.set(request.id, { resolve, reject });

                const message = JSON.stringify(request) + '\n';

                if (this.process.stdin && this.process.stdin.write) {
                    this.process.stdin.write(message);
                } else {
                    throw new Error('Process stdin not available');
                }
            } catch (error) {
                this.pendingRequests.delete(request.id);
                reject(error);
            }
        });
    }

    /**
     * 处理接收到的数据
     */
    private handleData(data: string): void {
        this.buffer += data;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                this.parseMessage(line);
            }
        }
    }

    /**
     * 解析 JSON-RPC 消息
     */
    private parseMessage(raw: string): void {
        try {
            const message = JSON.parse(raw);

            if ('id' in message) {
                // 这是一个响应
                const pending = this.pendingRequests.get(message.id);
                if (pending) {
                    this.pendingRequests.delete(message.id);
                    pending.resolve(message);
                } else {
                    console.warn('[MCP Stdio] Unexpected response ID:', message.id);
                }
            } else if (message.method) {
                // 这是一个通知
                this.emitMessage(message);
            }
        } catch (error) {
            this.handleParseError(error);
        }
    }

    /**
     * 处理进程关闭
     */
    private handleClose(code: number): void {
        if (!this.isDestroyed()) {
            console.log('[MCP Stdio] Process closed with code:', code);
            this.connected = false;

            // 拒绝所有待处理的请求
            this.pendingRequests.forEach(({ reject }) => {
                reject(new Error(`Process exited with code ${code}`));
            });
            this.pendingRequests.clear();
        }
    }

    /**
     * 处理进程错误
     */
    private handleError(error: Error): void {
        console.error('[MCP Stdio] Process error:', error);
        this.connected = false;

        this.pendingRequests.forEach(({ reject }) => {
            reject(error);
        });
        this.pendingRequests.clear();
    }

    /**
     * 等待进程就绪
     */
    private waitForProcess(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Process startup timeout'));
            }, 10000);

            const checkReady = setInterval(() => {
                if (!this.process || !this.connected) {
                    clearTimeout(timeout);
                    clearInterval(checkReady);
                    return;
                }

                // 发送一个 ping 请求来检查进程是否响应
                try {
                    if (this.process.stdin && this.process.stdin.writable) {
                        clearTimeout(timeout);
                        clearInterval(checkReady);
                        resolve();
                    }
                } catch {
                    // 忽略错误，继续等待
                }
            }, 100);

            // 如果进程已经关闭，清理定时器
            if (this.process?.killed) {
                clearTimeout(timeout);
                clearInterval(checkReady);
                reject(new Error('Process exited during startup'));
            }
        });
    }

    /**
     * 生成请求 ID
     */
    private generateId(): number {
        this.requestId++;
        return this.requestId;
    }

    /**
     * 获取进程对象（用于测试）
     */
    getProcess(): any {
        return this.process;
    }
}
