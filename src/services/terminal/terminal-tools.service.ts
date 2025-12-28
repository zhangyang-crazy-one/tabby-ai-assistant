import { Injectable } from '@angular/core';
import { TerminalManagerService, TerminalInfo } from './terminal-manager.service';
import { LoggerService } from '../core/logger.service';

/**
 * 终端工具定义
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * 工具调用请求
 */
export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, any>;
}

/**
 * 工具调用结果
 */
export interface ToolResult {
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

/**
 * 终端工具服务
 * 定义 AI 可调用的终端相关工具
 */
@Injectable({ providedIn: 'root' })
export class TerminalToolsService {
    // 工具定义
    private tools: ToolDefinition[] = [
        {
            name: 'read_terminal_output',
            description: '读取指定终端的最近输出内容。用于获取命令执行结果或终端状态。',
            input_schema: {
                type: 'object',
                properties: {
                    lines: {
                        type: 'number',
                        description: '要读取的行数，默认为 50'
                    },
                    terminal_index: {
                        type: 'number',
                        description: '目标终端索引。如不指定则读取活动终端。'
                    }
                },
                required: []
            }
        },
        {
            name: 'write_to_terminal',
            description: '向终端写入命令。可以指定终端索引或使用当前活动终端。',
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: '要写入的命令'
                    },
                    execute: {
                        type: 'boolean',
                        description: '是否立即执行命令（添加回车），默认为 true'
                    },
                    terminal_index: {
                        type: 'number',
                        description: '目标终端索引（从 0 开始）。如不指定则使用当前活动终端。'
                    }
                },
                required: ['command']
            }
        },
        {
            name: 'get_terminal_list',
            description: '获取所有打开的终端列表，包括终端 ID、标题、活动状态等。',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_cwd',
            description: '获取当前终端的工作目录。',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_selection',
            description: '获取当前终端中选中的文本。',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'focus_terminal',
            description: '切换到指定索引的终端，使其成为活动终端。',
            input_schema: {
                type: 'object',
                properties: {
                    terminal_index: {
                        type: 'number',
                        description: '目标终端索引（从 0 开始）'
                    }
                },
                required: ['terminal_index']
            }
        }
    ];

    // 终端输出缓存
    private outputBuffer: string[] = [];
    private maxBufferLines = 500;

    constructor(
        private terminalManager: TerminalManagerService,
        private logger: LoggerService
    ) {
        // 不再需要静态订阅输出，直接从 xterm buffer 动态读取
    }

    /**
     * 获取所有工具定义
     */
    getToolDefinitions(): ToolDefinition[] {
        return this.tools;
    }

    /**
     * 执行工具调用
     */
    async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
        this.logger.info('Executing tool call', { name: toolCall.name, input: toolCall.input });

        try {
            let result: string;

            switch (toolCall.name) {
                case 'read_terminal_output':
                    result = this.readTerminalOutput(
                        toolCall.input.lines || 50,
                        toolCall.input.terminal_index
                    );
                    break;
                case 'write_to_terminal':
                    result = await this.writeToTerminal(
                        toolCall.input.command,
                        toolCall.input.execute ?? true,
                        toolCall.input.terminal_index
                    );
                    break;
                case 'get_terminal_list':
                    result = this.getTerminalList();
                    break;
                case 'get_terminal_cwd':
                    result = this.getTerminalCwd();
                    break;
                case 'get_terminal_selection':
                    result = this.getTerminalSelection();
                    break;
                case 'focus_terminal':
                    result = this.focusTerminal(toolCall.input.terminal_index);
                    break;
                default:
                    throw new Error(`Unknown tool: ${toolCall.name}`);
            }

            this.logger.info('Tool call completed', { name: toolCall.name, resultLength: result.length });

            return {
                tool_use_id: toolCall.id,
                content: result
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Tool call failed', { name: toolCall.name, error: errorMessage });

            return {
                tool_use_id: toolCall.id,
                content: `错误: ${errorMessage}`,
                is_error: true
            };
        }
    }

    /**
     * 从 xterm buffer 读取内容
     * 包含详细调试日志以定位白屏问题
     */
    private readFromXtermBuffer(terminal: any, lines: number): string {
        try {
            // === 调试代码：记录终端结构 ===
            this.logger.info('【DEBUG】Terminal structure debug', {
                hasTerminal: !!terminal,
                terminalType: terminal?.constructor?.name,
                hasFrontend: !!terminal?.frontend,
                frontendType: terminal?.frontend?.constructor?.name,
                frontendKeys: terminal?.frontend ? Object.keys(terminal.frontend).slice(0, 15) : [],
                hasXterm: !!terminal?.frontend?.xterm,
                xtermType: terminal?.frontend?.xterm?.constructor?.name,
                hasBuffer: !!terminal?.frontend?.xterm?.buffer,
                bufferActive: !!terminal?.frontend?.xterm?.buffer?.active
            });

            // 尝试多种可能的 xterm buffer 访问路径
            let buffer: any = null;
            let bufferSource = '';

            // 路径1: frontend.xterm.buffer.active (xterm.js 标准)
            if (terminal.frontend?.xterm?.buffer?.active) {
                buffer = terminal.frontend.xterm.buffer.active;
                bufferSource = 'frontend.xterm.buffer.active';
                this.logger.info('【DEBUG】Using buffer path: ' + bufferSource);
            }
            // 路径2: frontend.buffer (可能是直接暴露)
            else if (terminal.frontend?.buffer?.active) {
                buffer = terminal.frontend.buffer.active;
                bufferSource = 'frontend.buffer.active';
                this.logger.info('【DEBUG】Using buffer path: ' + bufferSource);
            }
            // 路径3: frontend._core.buffer (私有属性)
            else if (terminal.frontend?._core?.buffer?.active) {
                buffer = terminal.frontend._core.buffer.active;
                bufferSource = 'frontend._core.buffer.active';
                this.logger.info('【DEBUG】Using buffer path: ' + bufferSource);
            }
            // 路径4: 尝试通过 terminal 上的其他属性
            else {
                this.logger.warn('【DEBUG】No standard buffer path found, trying alternatives', {
                    hasContent: !!terminal.content,
                    hasContent$: !!terminal.content$,
                    hasSession: !!terminal.session,
                    allFrontendKeys: terminal?.frontend ? Object.keys(terminal.frontend) : []
                });

                // 如果有 content 属性，尝试使用它
                if (terminal.content) {
                    return `[DEBUG] 终端内容:\n${terminal.content}`;
                }

                return '(无法访问终端 buffer，请检查终端是否就绪)';
            }

            if (!buffer) {
                this.logger.warn('【DEBUG】Buffer is null after all path attempts');
                return '(无法访问终端 buffer，buffer 为空)';
            }

            const totalLines = buffer.length || 0;
            this.logger.info('【DEBUG】Buffer info', {
                totalLines,
                requestedLines: lines,
                bufferSource
            });

            if (totalLines === 0) {
                return '(终端 buffer 为空)';
            }

            const startLine = Math.max(0, totalLines - lines);
            const result: string[] = [];

            for (let i = startLine; i < totalLines; i++) {
                try {
                    const line = buffer.getLine(i);
                    if (line && typeof line.translateToString === 'function') {
                        result.push(line.translateToString(true));
                    }
                } catch (e) {
                    this.logger.warn('【DEBUG】Failed to read line ' + i, e);
                    // 跳过无法读取的行
                }
            }

            const finalOutput = result.join('\n') || '(终端输出为空)';
            this.logger.info('【DEBUG】Read completed', {
                linesRead: result.length,
                outputLength: finalOutput.length
            });

            return finalOutput;
        } catch (error) {
            this.logger.error('【DEBUG】Failed to read xterm buffer', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : ''
            });
            return '(读取终端失败，请重试)';
        }
    }

    /**
     * 读取终端输出
     */
    private readTerminalOutput(lines: number, terminalIndex?: number): string {
        // 尝试从缓冲区获取
        if (this.outputBuffer.length > 0) {
            const recentLines = this.outputBuffer.slice(-lines);
            return recentLines.join('\n');
        }

        // 直接从指定终端的 xterm buffer 读取
        const terminals = this.terminalManager.getAllTerminals();
        const terminal = terminalIndex !== undefined
            ? terminals[terminalIndex]
            : this.terminalManager.getActiveTerminal();

        if (!terminal) {
            return '(无可用终端)';
        }

        return this.readFromXtermBuffer(terminal, lines);
    }

    /**
     * 写入终端 - 带执行反馈
     */
    private async writeToTerminal(command: string, execute: boolean, terminalIndex?: number): Promise<string> {
        this.logger.info('writeToTerminal called', { command, execute, terminalIndex });

        let success: boolean;
        let targetTerminalIndex: number;

        if (terminalIndex !== undefined) {
            // 向指定索引的终端写入
            this.logger.info('Sending command to terminal index', { terminalIndex });
            success = this.terminalManager.sendCommandToIndex(terminalIndex, command, execute);
            targetTerminalIndex = terminalIndex;
            this.logger.info('sendCommandToIndex result', { success });
        } else {
            // 向当前活动终端写入
            this.logger.info('Sending command to active terminal');
            success = this.terminalManager.sendCommand(command, execute);
            targetTerminalIndex = 0; // 默认活动终端
            this.logger.info('sendCommand result', { success });
        }

        if (!success) {
            throw new Error(terminalIndex !== undefined
                ? `无法写入终端 ${terminalIndex}，索引无效或终端不可用`
                : '无法写入终端，请确保有活动的终端窗口');
        }

        // 等待命令执行（给终端一些时间处理）
        await new Promise(resolve => setTimeout(resolve, 800));

        // 直接从 xterm buffer 读取（而非依赖订阅）
        const terminals = this.terminalManager.getAllTerminals();
        const terminal = terminalIndex !== undefined
            ? terminals[terminalIndex]
            : this.terminalManager.getActiveTerminal();

        let output = '(终端输出为空)';
        if (terminal) {
            output = this.readFromXtermBuffer(terminal, 30);
        }

        // 返回执行结果而非指导
        return [
            `✅ 命令已执行: ${command}`,
            '',
            '=== 终端输出 ===',
            output,
            '=== 输出结束 ==='
        ].join('\n');
    }

    /**
     * 获取终端列表
     */
    private getTerminalList(): string {
        const terminals: TerminalInfo[] = this.terminalManager.getAllTerminalInfo();
        if (terminals.length === 0) {
            return '(没有打开的终端)';
        }

        // 检测操作系统
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const osInfo = isWindows ? 'Windows' : (platform === 'darwin' ? 'macOS' : 'Linux');

        const list = terminals.map((t, i) =>
            `[${i}] ${t.title}${t.isActive ? ' (活动)' : ''}${t.cwd ? ` - ${t.cwd}` : ''}`
        ).join('\n');

        return `操作系统: ${osInfo}\n共 ${terminals.length} 个终端:\n${list}\n\n注意: ${isWindows ? '请使用 Windows 命令 (如 dir, cd, type 等)' : '请使用 Unix 命令 (如 ls, cd, cat 等)'}`;
    }



    /**
     * 获取终端工作目录
     */
    private getTerminalCwd(): string {
        const cwd = this.terminalManager.getTerminalCwd();
        if (cwd) {
            return `当前工作目录: ${cwd}`;
        } else {
            return '(无法获取工作目录)';
        }
    }

    /**
     * 获取终端选中文本
     */
    private getTerminalSelection(): string {
        const selection = this.terminalManager.getSelection();
        if (selection) {
            return selection;
        } else {
            return '(没有选中的文本)';
        }
    }

    /**
     * 切换终端焦点
     */
    private focusTerminal(index: number): string {
        const success = this.terminalManager.focusTerminal(index);
        if (success) {
            return `✅ 已切换到终端 ${index}`;
        } else {
            return `❌ 无法切换到终端 ${index}，索引无效`;
        }
    }
}
