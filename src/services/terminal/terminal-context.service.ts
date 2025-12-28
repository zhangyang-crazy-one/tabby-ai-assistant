import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { TerminalContext, TerminalSession, TerminalError, CommandResult, SystemInfo, ProcessInfo, ProjectInfo } from '../../types/terminal.types';
import { LoggerService } from '../core/logger.service';

/**
 * 项目检测配置
 */
interface ProjectDetector {
    pattern: RegExp;
    type: ProjectInfo['type'];
    configFiles: string[];
    parseConfig: (content: string) => Partial<ProjectInfo>;
    language: string;
    framework?: string;
}

@Injectable({ providedIn: 'root' })
export class TerminalContextService {
    private currentContext: TerminalContext | null = null;
    private contextChange$ = new Subject<TerminalContext>();
    private errorDetected$ = new Subject<TerminalError>();
    private commandExecuted$ = new Subject<CommandResult>();

    // 项目检测器配置
    private readonly projectDetectors: ProjectDetector[] = [
        {
            pattern: /package\.json$/,
            type: 'npm',
            configFiles: ['package.json'],
            parseConfig: (content: string) => {
                try {
                    const pkg = JSON.parse(content);
                    return {
                        name: pkg.name,
                        version: pkg.version,
                        dependencies: Object.keys(pkg.dependencies || {}),
                        scripts: pkg.scripts,
                        description: pkg.description,
                        framework: pkg.dependencies ? this.detectFramework(Object.keys(pkg.dependencies)) : undefined
                    };
                } catch {
                    return {};
                }
            },
            language: 'JavaScript/TypeScript'
        },
        {
            pattern: /pom\.xml$/,
            type: 'maven',
            configFiles: ['pom.xml'],
            parseConfig: (content: string) => {
                const nameMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
                const versionMatch = content.match(/<version>([^<]+)<\/version>/);
                return {
                    name: nameMatch?.[1],
                    version: versionMatch?.[1],
                    language: 'Java'
                };
            },
            language: 'Java'
        },
        {
            pattern: /build\.gradle$/,
            type: 'gradle',
            configFiles: ['build.gradle', 'build.gradle.kts'],
            parseConfig: (content: string) => {
                const nameMatch = content.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/);
                const versionMatch = content.match(/version\s*=\s*['"]([^'"]+)['"]/);
                return {
                    name: nameMatch?.[1],
                    version: versionMatch?.[1],
                    language: 'Java/Kotlin'
                };
            },
            language: 'Java/Kotlin'
        },
        {
            pattern: /requirements\.txt$/,
            type: 'pip',
            configFiles: ['requirements.txt'],
            parseConfig: (content: string) => {
                const deps = content.split('\n')
                    .map(line => line.split(/[>=<!]/)[0].trim())
                    .filter(d => d.length > 0);
                return {
                    dependencies: deps,
                    language: 'Python',
                    framework: this.detectPythonFramework(deps)
                };
            },
            language: 'Python'
        },
        {
            pattern: /Cargo\.toml$/,
            type: 'cargo',
            configFiles: ['Cargo.toml'],
            parseConfig: (content: string) => {
                const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
                const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
                return {
                    name: nameMatch?.[1],
                    version: versionMatch?.[1],
                    language: 'Rust'
                };
            },
            language: 'Rust'
        },
        {
            pattern: /go\.mod$/,
            type: 'go',
            configFiles: ['go.mod'],
            parseConfig: (content: string) => {
                const moduleMatch = content.match(/module\s+([^\s]+)/);
                const versionMatch = content.match(/go\s+([\d.]+)/);
                return {
                    name: moduleMatch?.[1],
                    version: versionMatch?.[1],
                    language: 'Go'
                };
            },
            language: 'Go'
        },
        {
            pattern: /yarn\.lock$/,
            type: 'yarn',
            configFiles: ['package.json', 'yarn.lock'],
            parseConfig: (content: string) => {
                try {
                    const pkg = JSON.parse(content);
                    return {
                        name: pkg.name,
                        version: pkg.version,
                        dependencies: Object.keys(pkg.dependencies || {}),
                        scripts: pkg.scripts,
                        description: pkg.description
                    };
                } catch {
                    return {};
                }
            },
            language: 'JavaScript/TypeScript'
        }
    ];

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
                projectInfo: projectInfo || undefined
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
     * 根据当前工作目录中的配置文件检测项目类型和元数据
     */
    async detectProjectInfo(): Promise<ProjectInfo | null> {
        const cwd = this.currentContext?.session.cwd || process.cwd();

        // 检测 .git 目录（Git 项目）
        const hasGit = await this.checkFileExists('.git');
        if (hasGit) {
            return {
                type: 'git',
                root: cwd,
                name: this.extractProjectName(cwd),
                language: 'N/A'
            };
        }

        // 遍历项目检测器
        for (const detector of this.projectDetectors) {
            for (const configFile of detector.configFiles) {
                const content = await this.readFileContent(configFile);
                if (content) {
                    const config = detector.parseConfig(content);
                    return {
                        type: detector.type,
                        root: cwd,
                        name: config.name || this.extractProjectName(cwd),
                        version: config.version,
                        dependencies: config.dependencies,
                        scripts: config.scripts,
                        description: config.description,
                        language: detector.language,
                        framework: config.framework || detector.framework
                    };
                }
            }
        }

        // 未检测到项目
        return null;
    }

    /**
     * 手动触发项目重新检测
     */
    async refreshProjectInfo(): Promise<void> {
        if (!this.currentContext) return;

        const projectInfo = await this.detectProjectInfo();
        this.currentContext.projectInfo = projectInfo || undefined;
        this.contextChange$.next(this.currentContext);

        this.logger.info('Project info refreshed', { projectInfo });
    }

    /**
     * 获取所有检测到的项目类型
     */
    getSupportedProjectTypes(): ProjectInfo['type'][] {
        return this.projectDetectors.map(d => d.type);
    }

    /**
     * 检查文件是否存在（模拟实现）
     */
    private async checkFileExists(_filename: string): Promise<boolean> {
        // 在浏览器环境中，此方法需要与实际的 Tabby API 集成
        // 这里返回模拟值用于演示
        return false;
    }

    /**
     * 读取文件内容（模拟实现）
     */
    private async readFileContent(_filename: string): Promise<string | null> {
        // 在浏览器环境中，此方法需要与实际的 Tabby API 集成
        // 这里返回模拟值用于演示
        return null;
    }

    /**
     * 从路径提取项目名称
     */
    private extractProjectName(path: string): string {
        const parts = path.split('/');
        return parts[parts.length - 1] || 'unknown-project';
    }

    /**
     * 检测 JavaScript/TypeScript 项目框架
     */
    private detectFramework(dependencies: string[]): string | undefined {
        const frameworkIndicators: { [key: string]: string[] } = {
            'React': ['react', 'react-dom'],
            'Vue': ['vue'],
            'Angular': ['@angular/core'],
            'Next.js': ['next'],
            'Nuxt': ['nuxt'],
            'Svelte': ['svelte'],
            'Express': ['express'],
            'NestJS': ['@nestjs/core'],
            'Electron': ['electron'],
            'Expo': ['expo']
        };

        for (const [framework, indicators] of Object.entries(frameworkIndicators)) {
            if (indicators.some(ind => dependencies.includes(ind))) {
                return framework;
            }
        }
        return undefined;
    }

    /**
     * 检测 Python 项目框架
     */
    private detectPythonFramework(dependencies: string[]): string | undefined {
        const frameworkIndicators: { [key: string]: string[] } = {
            'Django': ['django'],
            'Flask': ['flask'],
            'FastAPI': ['fastapi'],
            'Pyramid': ['pyramid'],
            'Tornado': ['tornado'],
            'Web2py': ['web2py'],
            'CherryPy': ['cherrypy']
        };

        for (const [framework, indicators] of Object.entries(frameworkIndicators)) {
            if (indicators.some(ind => dependencies.includes(ind))) {
                return framework;
            }
        }
        return undefined;
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
