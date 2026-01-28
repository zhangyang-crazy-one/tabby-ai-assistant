import { Injectable } from '@angular/core';
import { TerminalManagerService, TerminalInfo } from './terminal-manager.service';
import { AsyncTaskManagerService } from './async-task-manager.service';
import { LoggerService } from '../core/logger.service';
import { MCPClientManager } from '../mcp/mcp-client-manager.service';

/**
 * 终端工具定义
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {  // 使用 OpenAI 标准的 "parameters" 而非 "input_schema"
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
    isTaskComplete?: boolean;  // 特殊标记：task_complete 工具调用
}

/**
 * 终端工具服务
 * 定义 AI 可调用的终端相关工具
 */
@Injectable({ providedIn: 'root' })
export class TerminalToolsService {
    // ========== 智能等待配置 ==========
    // 命令类型与预估等待时间映射（毫秒）
    private readonly COMMAND_WAIT_TIMES: Record<string, number> = {
        // 快速命令 (< 500ms)
        'cd': 200,
        'pwd': 200,
        'echo': 200,
        'set': 300,
        'export': 200,
        'cls': 100,
        'clear': 100,
        'date': 200,
        'time': 200,

        // 标准命令 (500-1500ms)
        'dir': 500,
        'ls': 500,
        'cat': 500,
        'type': 500,
        'mkdir': 300,
        'rm': 500,
        'del': 500,
        'copy': 800,
        'xcopy': 1000,
        'move': 800,
        'ren': 300,
        'rename': 300,
        'tree': 1000,
        'find': 600,
        'grep': 500,
        'head': 200,
        'tail': 200,

        // 慢速命令 (1500-5000ms)
        'git': 3000,
        'npm': 5000,
        'yarn': 5000,
        'pnpm': 5000,
        'pip': 4000,
        'conda': 3000,
        'docker': 4000,
        'kubectl': 3000,
        'terraform': 4000,
        'make': 2000,
        'cmake': 3000,

        // 非常慢的命令 (> 5000ms)
        'systeminfo': 8000,
        'ipconfig': 2000,
        'ifconfig': 2000,
        'netstat': 3000,
        'ss': 2000,
        'ping': 10000,
        'tracert': 15000,
        'tracepath': 10000,
        'nslookup': 3000,
        'dig': 3000,
        'choco': 5000,
        'scoop': 5000,
        'apt-get': 5000,
        'apt': 4000,
        'yum': 5000,
        'dnf': 5000,
        'brew': 5000,
        'pacman': 5000,

        // 默认等待时间
        '__default__': 1500
    };

    // 工具定义
    private tools: ToolDefinition[] = [
        // ========== 任务完成工具 ==========
        {
            name: 'task_complete',
            description: `【重要】当你完成了用户请求的所有任务后，必须调用此工具来结束任务循环。
 调用此工具后，Agent 将停止继续执行，你的 summary 将作为最终回复展示给用户。
 使用场景：
 - 所有工具调用都成功完成
 - 遇到无法解决的问题需要停止
 - 用户请求已被完整满足
 注意：如果还有未完成的任务，请先完成它们再调用此工具。`,
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: '任务完成总结，描述做了什么、结果如何'
                    },
                    success: {
                        type: 'boolean',
                        description: '是否成功完成所有任务'
                    },
                    next_steps: {
                        type: 'string',
                        description: '可选，建议用户的后续操作'
                    }
                },
                required: ['summary', 'success']
            }
        },
        // ========== 终端操作工具 ==========
        {
            name: 'read_terminal_output',
            description: '读取指定终端的最近输出内容。用于获取命令执行结果或终端状态。',
            parameters: {
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
            parameters: {
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
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_cwd',
            description: '获取当前终端的工作目录。',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_selection',
            description: '获取当前终端中选中的文本。',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'focus_terminal',
            description: '切换到指定索引的终端，使其成为活动终端。',
            parameters: {
                type: 'object',
                properties: {
                    terminal_index: {
                        type: 'number',
                        description: '目标终端索引（从 0 开始）'
                    }
                },
                required: ['terminal_index']
            }
        },
        // ========== 异步任务工具 ==========
        {
            name: 'async_terminal_command',
            description: `【异步命令执行】用于执行可能需要较长时间的终端命令。
调用后立即返回 task_id，命令在后台执行。
使用 check_task_status 工具查看任务状态和输出。

适用场景：
- npm install / yarn install / pnpm install
- 编译/构建项目 (npm run build, make, cargo build 等)
- 部署脚本
- 任何执行时间可能超过 10 秒的命令

注意：如果命令执行时间很短（如 ls, cd, echo），请使用普通的 write_to_terminal 工具。`,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: '要执行的命令'
                    },
                    terminal_index: {
                        type: 'number',
                        description: '目标终端索引（可选，默认使用活动终端）'
                    },
                    timeout_seconds: {
                        type: 'number',
                        description: '超时时间（秒），默认 300 秒（5分钟）'
                    }
                },
                required: ['command']
            }
        },
        {
            name: 'check_task_status',
            description: `【查询异步任务状态】获取异步命令的执行状态和输出。

返回信息包括：
- 任务状态：running/completed/failed/timeout
- 已执行时间
- 最新输出内容
- 完成时的退出码（如果可获取）

使用场景：
- 在调用 async_terminal_command 后，需要检查命令是否完成
- 获取长时间命令的中间输出
- 确认任务成功/失败`,
            parameters: {
                type: 'object',
                properties: {
                    task_id: {
                        type: 'string',
                        description: '要查询的任务 ID'
                    },
                    full_output: {
                        type: 'boolean',
                        description: '是否获取完整输出，默认 false（只获取最新部分）'
                    }
                },
                required: ['task_id']
            }
        }
    ];

    // 终端输出缓存
    private outputBuffer: string[] = [];
    private maxBufferLines = 500;

    constructor(
        private terminalManager: TerminalManagerService,
        private asyncTaskManager: AsyncTaskManagerService,
        private logger: LoggerService,
        private mcpManager: MCPClientManager
    ) {
        // 不再需要静态订阅输出，直接从 xterm buffer 动态读取
    }

    /**
     * 获取所有工具定义（包括 MCP 工具）
     */
    getToolDefinitions(): ToolDefinition[] {
        // 获取 MCP 工具
        const mcpTools = this.mcpManager.getAllToolsWithPrefix().map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));

        // 合并内置工具和 MCP 工具
        return [...this.tools, ...mcpTools];
    }

    /**
     * 执行工具调用
     */
    async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
        this.logger.info('Executing tool call', { name: toolCall.name, input: toolCall.input });

        try {
            let result: string;
            let isTaskComplete = false;

            switch (toolCall.name) {
                // ========== 任务完成工具 ==========
                case 'task_complete': {
                    const input = toolCall.input;
                    const successStatus = input.success ? '成功' : '未能';
                    const nextStepsText = input.next_steps
                        ? `\n\n建议后续操作：${input.next_steps}`
                        : '';
                    result = `任务${successStatus}完成。\n\n${input.summary}${nextStepsText}`;
                    isTaskComplete = true;
                    this.logger.info('Task completed via task_complete tool', { success: input.success });
                    break;
                }
                // ========== 终端操作工具 ==========
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
                // ========== 异步任务工具 ==========
                case 'async_terminal_command': {
                    const command = toolCall.input.command;
                    const terminalIndex = toolCall.input.terminal_index;
                    const timeoutSeconds = toolCall.input.timeout_seconds || 300;
                    
                    // 创建异步任务
                    const task = this.asyncTaskManager.createTask({
                        command,
                        timeout: timeoutSeconds * 1000
                    });
                    
                    result = JSON.stringify({
                        success: true,
                        task_id: task.taskId,
                        message: `命令已在后台启动，请使用 check_task_status 工具查询任务状态`,
                        command: command,
                        timeout_seconds: timeoutSeconds
                    }, null, 2);
                    break;
                }
                case 'check_task_status': {
                    const taskId = toolCall.input.task_id;
                    const fullOutput = toolCall.input.full_output || false;
                    
                    const taskResult = this.asyncTaskManager.getTaskResult(taskId, fullOutput);
                    
                    if (!taskResult) {
                        result = JSON.stringify({
                            success: false,
                            error: `找不到任务 ${taskId}`,
                            hint: '任务可能已完成并被清理，或 task_id 无效'
                        }, null, 2);
                    } else {
                        result = JSON.stringify({
                            success: true,
                            task_id: taskId,
                            status: taskResult.status,
                            elapsed_seconds: Math.round(taskResult.elapsedMs / 1000),
                            output: taskResult.output,
                            is_complete: taskResult.isComplete,
                            exit_code: taskResult.exitCode,
                            error: taskResult.errorMessage
                        }, null, 2);
                    }
                    break;
                }
                default:
                    // 检查是否是 MCP 工具
                    if (toolCall.name.startsWith('mcp_')) {
                        result = await this.mcpManager.executeMCPTool(toolCall.name, toolCall.input);
                        this.logger.info('MCP tool executed', { name: toolCall.name });
                    } else {
                        throw new Error(`Unknown tool: ${toolCall.name}`);
                    }
            }

            this.logger.info('Tool call completed', { name: toolCall.name, resultLength: result.length });

            return {
                tool_use_id: toolCall.id,
                content: result,
                isTaskComplete
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
     * 写入终端 - 带执行反馈和智能等待
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

        // ========== 智能等待机制 ==========
        const baseCommand = this.extractBaseCommand(command);
        const waitTime = this.getWaitTimeForCommand(baseCommand);

        this.logger.info('Smart wait for command', { command, baseCommand, waitTime });

        // 初始等待
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 直接从 xterm buffer 读取
        const terminals = this.terminalManager.getAllTerminals();
        const terminal = terminalIndex !== undefined
            ? terminals[terminalIndex]
            : this.terminalManager.getActiveTerminal();

        let output = '(终端输出为空)';
        if (terminal) {
            output = this.readFromXtermBuffer(terminal, 50);

            // 对于慢命令，轮询检查是否完成
            if (waitTime >= 3000) {
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries && !this.isCommandComplete(output)) {
                    this.logger.info(`Command still running, retry ${retryCount + 1}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    output = this.readFromXtermBuffer(terminal, 50);
                    retryCount++;
                }
            }
        }

        // 返回执行结果
        return [
            `✅ 命令已执行: ${command}`,
            `⏱️ 等待时间: ${waitTime}ms`,
            '',
            '=== 终端输出 ===',
            output,
            '=== 输出结束 ==='
        ].join('\n');
    }

    /**
     * 提取命令基础名称
     */
    private extractBaseCommand(command: string): string {
        const trimmed = command.trim().toLowerCase();
        // 处理 Windows 路径 (如 C:\Windows\System32\systeminfo.exe)
        const parts = trimmed.split(/[\s\/\\]+/);
        const executable = parts[0].replace(/\.exe$/i, '');
        // 移除常见前缀
        return executable.replace(/^(winpty|busybox|gtimeout|command|-)/, '');
    }

    /**
     * 获取命令等待时间
     */
    private getWaitTimeForCommand(baseCommand: string): number {
        return this.COMMAND_WAIT_TIMES[baseCommand] || this.COMMAND_WAIT_TIMES['__default__'];
    }

    /**
     * 检查命令是否完成（检测提示符）
     */
    private isCommandComplete(output: string): boolean {
        const promptPatterns = [
            /\n[A-Za-z]:.*>\s*$/,           // Windows: C:\Users\xxx>
            /\$\s*$/,                       // Linux/Mac: $
            /\n#\s*$/,                      // Root: #
            /\n.*@.*:\~.*\$\s*$/,           // bash: user@host:~$
            /PS\s+[A-Za-z]:.*>\s*$/,        // PowerShell: PS C:\>
            /\[.*@\S+\s+.*\]\$\s*$/,        // modern bash
        ];

        return promptPatterns.some(pattern => pattern.test(output));
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
