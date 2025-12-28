import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { TerminalContext, TerminalSession, TerminalError, CommandResult, SystemInfo, ProcessInfo } from '../../types/terminal.types';
import { LoggerService } from '../core/logger.service';

@Injectable({ providedIn: 'root' })
export class TerminalContextService {
    private currentContext: TerminalContext | null = null;
    private contextChange$ = new Subject<TerminalContext>();
    private errorDetected$ = new Subject<TerminalError>();
    private commandExecuted$ = new Subject<CommandResult>();

    constructor(private logger: LoggerService) {
        this.initializeContext();
    }

    private async initializeContext(): Promise<void> {
        try {
            const session = await this.getCurrentSession();
            const systemInfo = await this.getSystemInfo();
            const projectInfo = await this.detectProjectInfo();

            this.currentContext = {
                session,
                isRunning: false,
                recentCommands: [],
                systemInfo,
                projectInfo
            };

            this.logger.info('Terminal context initialized', { context: this.currentContext });
        } catch (error) {
            this.logger.error('Failed to initialize terminal context', error);
        }
    }

    /**
     * 获取当前终端上下文
     */
    getCurrentContext(): TerminalContext | null {
        return this.currentContext;
    }

    /**
     * 订阅上下文变化
     */
    onContextChange(): Observable<TerminalContext> {
        return this.contextChange$.asObservable();
    }

    /**
     * 订阅错误检测
     */
    onError(): Observable<TerminalError> {
        return this.errorDetected$.asObservable();
    }

    /**
     * 订阅命令执行
     */
    onCommandExecuted(): Observable<CommandResult> {
        return this.commandExecuted$.asObservable();
    }

    /**
     * 更新当前命令
     */
    updateCurrentCommand(command: string): void {
        if (!this.currentContext) return;

        this.currentContext.currentCommand = command;
        this.contextChange$.next(this.currentContext);
        this.logger.debug('Current command updated', { command });
    }

    /**
     * 设置命令执行结果
     */
    setCommandResult(result: CommandResult): void {
        if (!this.currentContext) return;

        this.currentContext.lastCommand = result.command;
        this.currentContext.lastOutput = result.stdout;
        this.currentContext.lastError = result.stderr;
        this.currentContext.exitCode = result.exitCode;
        this.currentContext.isRunning = false;

        // 添加到历史
        this.currentContext.recentCommands.unshift(result.command);
        if (this.currentContext.recentCommands.length > 50) {
            this.currentContext.recentCommands = this.currentContext.recentCommands.slice(0, 50);
        }

        // 检查是否出错
        if (!result.success || result.exitCode !== 0) {
            const error = this.analyzeError(result);
            this.errorDetected$.next(error);
        }

        this.commandExecuted$.next(result);
        this.contextChange$.next(this.currentContext);

        this.logger.debug('Command result set', { result });
    }

    /**
     * 设置运行状态
     */
    setRunningStatus(isRunning: boolean, process?: ProcessInfo): void {
        if (!this.currentContext) return;

        this.currentContext.isRunning = isRunning;
        this.currentContext.runningProcess = process || undefined;
        this.contextChange$.next(this.currentContext);
    }

    /**
     * 更改当前工作目录
     */
    changeDirectory(path: string): void {
        if (!this.currentContext) return;

        this.currentContext.session.cwd = path;
        this.currentContext.session.lastActivity = new Date();
        this.contextChange$.next(this.currentContext);

        this.logger.debug('Directory changed', { path });
    }

    /**
     * 检测错误并生成分析
     */
    private analyzeError(result: CommandResult): TerminalError {
        let type: TerminalError['type'] = 'unknown';
        let message = result.stderr || 'Unknown error';

        // 基于错误消息和退出码确定错误类型
        if (result.stderr.includes('command not found')) {
            type = 'command_not_found';
        } else if (result.stderr.includes('Permission denied')) {
            type = 'permission_denied';
        } else if (result.stderr.includes('No such file or directory')) {
            type = 'file_not_found';
        } else if (result.stderr.includes('Syntax error')) {
            type = 'syntax_error';
        }

        // 生成修复建议
        const suggestions = this.generateSuggestions(type, result.command, result.stderr);

        return {
            type,
            message,
            command: result.command,
            exitCode: result.exitCode,
            suggestions,
            timestamp: new Date()
        };
    }

    /**
     * 生成错误修复建议
     */
    private generateSuggestions(type: TerminalError['type'], _command?: string, _errorMsg?: string): string[] {
        const suggestions: string[] = [];

        switch (type) {
            case 'command_not_found':
                suggestions.push('检查命令拼写是否正确');
                suggestions.push('使用 `which <command>` 或 `command -v <command>` 确认命令是否存在');
                suggestions.push('使用 `apt install <package>` (Ubuntu/Debian) 或 `brew install <package>` (macOS) 安装缺失命令');
                break;

            case 'permission_denied':
                suggestions.push('使用 `sudo` 提升权限');
                suggestions.push('检查文件权限：`ls -l <file>`');
                suggestions.push('使用 `chmod` 修改文件权限');
                break;

            case 'file_not_found':
                suggestions.push('检查文件路径是否正确');
                suggestions.push('使用 `pwd` 确认当前目录');
                suggestions.push('使用 `ls` 查看当前目录内容');
                break;

            case 'syntax_error':
                suggestions.push('检查命令语法');
                suggestions.push('使用 `man <command>` 查看命令手册');
                suggestions.push('使用 `--help` 或 `-h` 查看帮助信息');
                break;
        }

        return suggestions;
    }

    /**
     * 获取当前会话信息
     */
    private async getCurrentSession(): Promise<TerminalSession> {
        // 这里应该从Tabby API获取真实的会话信息
        const env: Record<string, string> = {};
        Object.keys(process.env).forEach(key => {
            const value = process.env[key];
            if (value !== undefined) {
                env[key] = value;
            }
        });

        return {
            sessionId: this.generateSessionId(),
            cwd: process.cwd(),
            shell: this.detectShell(),
            user: env.USER || env.USERNAME,
            hostname: env.HOSTNAME || 'localhost',
            environment: env,
            startTime: new Date(),
            lastActivity: new Date()
        };
    }

    /**
     * 获取系统信息
     */
    private async getSystemInfo(): Promise<SystemInfo> {
        // 使用静态信息代替动态检测（避免Node.js模块依赖）
        return {
            platform: 'browser',
            arch: 'unknown',
            type: 'Browser',
            release: 'N/A',
            cpus: 0,
            totalMemory: 0,
            availableMemory: 0,
            nodeVersion: 'N/A'
        };
    }

    /**
     * 获取系统信息 - 公共接口
     */
    getSystemInfoPublic(): SystemInfo | null {
        return this.currentContext?.systemInfo || null;
    }

    /**
     * 检测项目信息
     */
    private async detectProjectInfo(): Promise<any> {
        // TODO: 实现项目检测逻辑
        // 检测 .git, package.json, pom.xml, build.gradle 等
        return null;
    }

    /**
     * 检测当前Shell
     */
    private detectShell(): string {
        return process.env.SHELL || process.env.COMSPEC || 'unknown';
    }

    /**
     * 生成会话ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取环境变量
     */
    getEnvironmentVariables(): Record<string, string> {
        return this.currentContext?.session.environment || {};
    }

    /**
     * 获取当前工作目录
     */
    getCurrentDirectory(): string {
        return this.currentContext?.session.cwd || '';
    }

    /**
     * 获取最近命令历史
     */
    getRecentCommands(): string[] {
        return this.currentContext?.recentCommands || [];
    }

    /**
     * 获取项目信息
     */
    getProjectInfo(): any {
        return this.currentContext?.projectInfo || null;
    }

    /**
     * 检查是否有错误
     */
    hasError(): boolean {
        return !!(this.currentContext?.lastError && this.currentContext.exitCode !== 0);
    }

    /**
     * 获取最后一条错误
     */
    getLastError(): TerminalError | null {
        if (!this.hasError()) return null;

        return {
            type: 'unknown',
            message: this.currentContext?.lastError || '',
            command: this.currentContext?.lastCommand,
            exitCode: this.currentContext?.exitCode,
            timestamp: new Date()
        };
    }
}
