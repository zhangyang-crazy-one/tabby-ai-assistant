import { Injectable, NgZone } from '@angular/core';
import { Subject, Observable, Subscription, BehaviorSubject, interval } from 'rxjs';
import { AppService } from 'tabby-core';
import { BaseTerminalTabComponent } from 'tabby-terminal';
import { LoggerService } from '../core/logger.service';

// 使用 any 避免泛型版本兼容问题
type TerminalTab = BaseTerminalTabComponent<any>;

/**
 * 终端信息接口
 */
export interface TerminalInfo {
    id: string;
    title: string;
    isActive: boolean;
    cwd?: string;
}

/**
 * AI感知的终端上下文信息
 */
export interface TerminalContext {
    terminalId: string;
    currentDirectory: string;
    activeShell: string;
    prompt: string;
    lastCommand?: string;
    processes: ProcessInfo[];
    environment: Record<string, string>;
    timestamp: number;
}

/**
 * 进程信息
 */
export interface ProcessInfo {
    pid: number;
    name: string;
    command: string;
    status: 'running' | 'sleeping' | 'stopped';
    cpu?: number;
    memory?: number;
}

/**
 * 终端输出事件
 */
export interface TerminalOutputEvent {
    terminalId: string;
    data: string;
    timestamp: number;
    type: 'output' | 'command' | 'error' | 'prompt';
}

/**
 * 终端管理服务
 * 封装 Tabby 终端 API，提供读取、写入和管理终端的能力
 */
@Injectable({ providedIn: 'root' })
export class TerminalManagerService {
    private outputSubscriptions = new Map<string, Subscription>();
    private outputSubject = new Subject<{ terminalId: string; data: string }>();
    private terminalChangeSubject = new Subject<void>();

    // AI感知相关字段
    private contextCache = new Map<string, TerminalContext>();
    private outputEventSubject = new Subject<TerminalOutputEvent>();
    private processMonitoringSubject = new Subject<{ terminalId: string; processes: ProcessInfo[] }>();
    private promptDetectionSubject = new Subject<{ terminalId: string; prompt: string }>();
    private monitoringIntervals = new Map<string, Subscription>();

    public outputEvent$ = this.outputEventSubject.asObservable();
    public processMonitoring$ = this.processMonitoringSubject.asObservable();
    public promptDetection$ = this.promptDetectionSubject.asObservable();

    constructor(
        private app: AppService,
        private logger: LoggerService,
        private zone: NgZone
    ) {
        this.logger.info('TerminalManagerService initialized');

        // 监听标签页变化
        this.app.tabsChanged$.subscribe(() => {
            this.terminalChangeSubject.next();
        });
    }

    /**
     * 获取当前活动终端
     * 注意：Tabby 将终端包装在 SplitTabComponent 中
     */
    getActiveTerminal(): TerminalTab | null {
        const tab = this.app.activeTab;
        if (!tab) return null;

        // 直接是终端
        if (this.isTerminalTab(tab)) {
            return tab as TerminalTab;
        }

        // SplitTabComponent 包装 - 获取聚焦的子标签页
        if (tab.constructor.name === 'SplitTabComponent') {
            const splitTab = tab as any;
            // 尝试获取聚焦的子标签页
            if (typeof splitTab.getFocusedTab === 'function') {
                const focusedTab = splitTab.getFocusedTab();
                if (focusedTab && this.isTerminalTab(focusedTab)) {
                    return focusedTab as TerminalTab;
                }
            }
            // 备用：获取第一个终端
            if (typeof splitTab.getAllTabs === 'function') {
                const innerTabs = splitTab.getAllTabs() as any[];
                for (const innerTab of innerTabs) {
                    if (this.isTerminalTab(innerTab)) {
                        return innerTab as TerminalTab;
                    }
                }
            }
        }

        return null;
    }

    /**
     * 获取所有终端标签
     * 注意：Tabby 将终端包装在 SplitTabComponent 中
     */
    getAllTerminals(): TerminalTab[] {
        const allTabs = this.app.tabs || [];
        const terminals: TerminalTab[] = [];

        for (const tab of allTabs) {
            // 如果是 SplitTabComponent，提取内部的终端
            if (tab.constructor.name === 'SplitTabComponent' && typeof (tab as any).getAllTabs === 'function') {
                const innerTabs = (tab as any).getAllTabs() as any[];
                for (const innerTab of innerTabs) {
                    if (this.isTerminalTab(innerTab)) {
                        terminals.push(innerTab as TerminalTab);
                    }
                }
            } else if (this.isTerminalTab(tab)) {
                // 也检查直接的终端标签
                terminals.push(tab as TerminalTab);
            }
        }

        this.logger.info('Getting all terminals', {
            topLevelTabs: allTabs.length,
            foundTerminals: terminals.length,
            terminalTitles: terminals.map(t => t.title)
        });

        return terminals;
    }

    /**
     * 获取所有终端信息
     */
    getAllTerminalInfo(): TerminalInfo[] {
        const activeTerminal = this.getActiveTerminal();
        return this.getAllTerminals().map((terminal, index) => ({
            id: `terminal-${index}`,
            title: terminal.title || `Terminal ${index + 1}`,
            isActive: terminal === activeTerminal,
            cwd: this.getTerminalCwd(terminal)
        }));
    }

    /**
     * 向当前终端发送命令
     */
    sendCommand(command: string, execute: boolean = true): boolean {
        const terminal = this.getActiveTerminal();
        if (!terminal) {
            this.logger.warn('No active terminal found');
            return false;
        }

        return this.sendCommandToTerminal(terminal, command, execute);
    }

    /**
     * 向指定终端发送命令
     */
    sendCommandToTerminal(terminal: TerminalTab, command: string, execute: boolean = true): boolean {
        try {
            const fullCommand = execute ? command + '\r' : command;

            // 调试：检查终端对象状态
            this.logger.info('Terminal object details', {
                hasSession: !!(terminal as any).session,
                hasFrontend: !!(terminal as any).frontend,
                hasSendInput: typeof terminal.sendInput === 'function',
                terminalTitle: terminal.title
            });

            // 优先使用 sendInput（标准 API）
            if (typeof terminal.sendInput === 'function') {
                this.logger.info('Using terminal.sendInput');
                terminal.sendInput(fullCommand);
                this.logger.info('Command sent via sendInput', { command, execute });
                return true;
            }

            // 备用：使用 session.write
            const session = (terminal as any).session;
            if (session && typeof session.write === 'function') {
                this.logger.info('Using session.write');
                session.write(fullCommand);
                this.logger.info('Command sent via session.write', { command, execute });
                return true;
            }

            this.logger.warn('No valid method to send command found');
            return false;
        } catch (error) {
            this.logger.error('Failed to send command to terminal', error);
            return false;
        }
    }

    /**
     * 向指定索引的终端发送命令
     */
    sendCommandToIndex(index: number, command: string, execute: boolean = true): boolean {
        const terminals = this.getAllTerminals();
        if (index < 0 || index >= terminals.length) {
            this.logger.warn('Invalid terminal index', { index, count: terminals.length });
            return false;
        }

        return this.sendCommandToTerminal(terminals[index], command, execute);
    }

    /**
     * 获取当前终端的选中文本
     */
    getSelection(): string {
        const terminal = this.getActiveTerminal();
        if (!terminal || !terminal.frontend) {
            return '';
        }

        try {
            // Tabby 使用 frontend.getSelection() 获取选中内容
            const selection = terminal.frontend.getSelection?.();
            return selection || '';
        } catch (error) {
            this.logger.error('Failed to get selection', error);
            return '';
        }
    }

    /**
     * 获取终端工作目录
     */
    getTerminalCwd(terminal?: TerminalTab): string | undefined {
        const t = terminal || this.getActiveTerminal();
        if (!t) return undefined;

        try {
            // 尝试从会话获取 cwd
            const session = (t as any).session;
            if (session?.cwd) {
                return session.cwd;
            }
            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * 切换到指定终端
     * 修复：需要选择顶层 Tab (SplitTabComponent)，而非内部终端
     */
    focusTerminal(index: number): boolean {
        const allTabs = this.app.tabs || [];
        const terminals = this.getAllTerminals();

        if (index < 0 || index >= terminals.length) {
            this.logger.warn('Invalid terminal index', { index, count: terminals.length });
            return false;
        }

        const targetTerminal = terminals[index];

        try {
            // 步骤1：查找包含目标终端的顶层 Tab
            let topLevelTab: any = null;
            let splitTabRef: any = null;

            for (const tab of allTabs) {
                // 情况1：直接是终端 Tab（不在 SplitTabComponent 内）
                if (this.isTerminalTab(tab) && tab === targetTerminal) {
                    topLevelTab = tab;
                    break;
                }

                // 情况2：终端在 SplitTabComponent 内部
                if (tab.constructor.name === 'SplitTabComponent') {
                    const splitTab = tab as any;
                    if (typeof splitTab.getAllTabs === 'function') {
                        const innerTabs = splitTab.getAllTabs() as any[];
                        if (innerTabs.includes(targetTerminal)) {
                            topLevelTab = tab;       // 顶层 SplitTabComponent
                            splitTabRef = splitTab;  // 保存引用，用于内部聚焦
                            break;
                        }
                    }
                }
            }

            if (!topLevelTab) {
                this.logger.warn('Target terminal not found', { index });
                return false;
            }

            // 步骤2：在 Angular Zone 内执行 UI 变更，确保触发变更检测
            this.zone.run(() => {
                // 1. 选择顶层 Tab（如果不是当前的，避免重复调用 selectTab）
                if (this.app.activeTab !== topLevelTab) {
                    this.app.selectTab(topLevelTab);
                }

                // 2. 关键修复：调用 SplitTabComponent.focus() 切换内部焦点
                if (splitTabRef && typeof splitTabRef.focus === 'function') {
                    splitTabRef.focus(targetTerminal);
                }

                // 3. 确保终端获得输入焦点
                const terminalAny = targetTerminal as any;
                if (typeof terminalAny.focus === 'function') {
                    terminalAny.focus();
                }
            });

            this.logger.info('Focused terminal', {
                index,
                title: targetTerminal.title,
                isInSplitTab: !!splitTabRef
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to focus terminal', error);
            return false;
        }
    }

    /**
     * 订阅当前终端输出
     */
    subscribeToActiveTerminalOutput(callback: (data: string) => void): Subscription | null {
        const terminal = this.getActiveTerminal();
        if (!terminal) {
            this.logger.warn('No active terminal to subscribe');
            return null;
        }

        return this.subscribeToTerminalOutput(terminal, callback);
    }

    /**
     * 订阅指定终端输出
     */
    subscribeToTerminalOutput(terminal: TerminalTab, callback: (data: string) => void): Subscription {
        return terminal.output$.subscribe(data => {
            callback(data);
        });
    }

    /**
     * 获取终端变化事件流
     */
    onTerminalChange(): Observable<void> {
        return this.terminalChangeSubject.asObservable();
    }

    /**
     * 获取终端数量
     */
    getTerminalCount(): number {
        return this.getAllTerminals().length;
    }

    /**
     * 检查是否有可用终端
     */
    hasTerminal(): boolean {
        return this.getTerminalCount() > 0;
    }

    /**
     * 检查标签页是否是终端
     * 使用特征检测避免 instanceof 在 webpack 打包后失效
     */
    private isTerminalTab(tab: any): boolean {
        if (!tab) return false;

        // 方法1: instanceof 检测
        if (tab instanceof BaseTerminalTabComponent) {
            this.logger.debug('Terminal detected via instanceof');
            return true;
        }

        // 方法2: 使用 in 操作符检测 sendInput（包括原型链）
        if ('sendInput' in tab && 'frontend' in tab) {
            this.logger.debug('Terminal detected via sendInput in proto');
            return true;
        }

        // 方法3: 检测 session 和 frontend 属性
        if (tab.session !== undefined && tab.frontend !== undefined) {
            this.logger.debug('Terminal detected via session+frontend');
            return true;
        }

        // 方法4: 检查原型链名称
        let proto = Object.getPrototypeOf(tab);
        while (proto && proto.constructor) {
            const protoName = proto.constructor.name || '';
            if (protoName.includes('Terminal') || protoName.includes('SSH') ||
                protoName.includes('Local') || protoName.includes('Telnet') ||
                protoName.includes('Serial') || protoName.includes('BaseTerminal')) {
                this.logger.debug('Terminal detected via prototype:', protoName);
                return true;
            }
            if (proto === Object.prototype) break;
            proto = Object.getPrototypeOf(proto);
        }

        return false;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.outputSubscriptions.forEach(sub => sub.unsubscribe());
        this.outputSubscriptions.clear();
        this.monitoringIntervals.forEach(sub => sub.unsubscribe());
        this.monitoringIntervals.clear();
    }

    // ==================== AI感知能力 ====================

    /**
     * 检测当前目录
     */
    async detectCurrentDirectory(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return process.cwd();
        }

        try {
            // 首先尝试从会话获取
            const cwd = this.getTerminalCwd(t);
            if (cwd) {
                return cwd;
            }

            // 如果无法从会话获取，使用 pwd 命令
            const originalPrompt = await this.getPrompt(t);
            this.sendCommandToTerminal(t, 'pwd', true);

            // 等待输出（简化实现）
            await new Promise(resolve => setTimeout(resolve, 500));

            const newPrompt = await this.getPrompt(t);
            const pwdOutput = this.extractCommandOutput(originalPrompt, newPrompt, 'pwd');

            return pwdOutput || process.cwd();
        } catch (error) {
            this.logger.error('Failed to detect current directory', error);
            return process.cwd();
        }
    }

    /**
     * 获取活跃Shell
     */
    async getActiveShell(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return 'unknown';
        }

        try {
            // 尝试从环境变量获取
            const shell = process.env.SHELL || process.env.COMSPEC || 'unknown';

            // 如果无法从环境变量获取，使用 echo $SHELL (Unix) 或 echo %COMSPEC% (Windows)
            const shellCommand = process.platform === 'win32' ? 'echo %COMSPEC%' : 'echo $SHELL';
            this.sendCommandToTerminal(t, shellCommand, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            return shell;
        } catch (error) {
            this.logger.error('Failed to detect active shell', error);
            return 'unknown';
        }
    }

    /**
     * 监控输出流
     */
    monitorOutput(terminal?: TerminalTab): Observable<TerminalOutputEvent> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            throw new Error('No terminal available for monitoring');
        }

        const terminalId = this.getTerminalId(t);

        // 订阅终端输出
        const subscription = t.output$.subscribe(data => {
            const event: TerminalOutputEvent = {
                terminalId,
                data,
                timestamp: Date.now(),
                type: this.detectOutputType(data)
            };

            this.outputEventSubject.next(event);
        });

        this.monitoringIntervals.set(terminalId, subscription);

        return this.outputEvent$.pipe(
            // 只返回当前终端的事件
            // 注意：实际实现中需要过滤
        );
    }

    /**
     * 检测提示符
     */
    async getPrompt(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return '';
        }

        try {
            // 发送一个空命令来触发提示符显示
            this.sendCommandToTerminal(t, '', true);
            await new Promise(resolve => setTimeout(resolve, 200));

            // 简化实现：返回默认提示符格式
            const shell = await this.getActiveShell(t);
            const cwd = await this.detectCurrentDirectory(t);

            return this.formatPrompt(shell, cwd);
        } catch (error) {
            this.logger.error('Failed to detect prompt', error);
            return '$ ';
        }
    }

    /**
     * 追踪进程
     */
    async trackProcesses(terminal?: TerminalTab): Promise<ProcessInfo[]> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return [];
        }

        try {
            // 使用 ps 命令获取进程列表
            const psCommand = process.platform === 'win32' ? 'tasklist' : 'ps aux';
            this.sendCommandToTerminal(t, psCommand, true);

            await new Promise(resolve => setTimeout(resolve, 1000));

            // 简化实现：返回模拟进程信息
            const processes: ProcessInfo[] = [
                {
                    pid: process.pid,
                    name: process.platform === 'win32' ? 'node.exe' : 'node',
                    command: process.argv0,
                    status: 'running'
                }
            ];

            this.processMonitoringSubject.next({
                terminalId: this.getTerminalId(t),
                processes
            });

            return processes;
        } catch (error) {
            this.logger.error('Failed to track processes', error);
            return [];
        }
    }

    /**
     * 获取终端AI上下文
     */
    async getTerminalContext(terminal?: TerminalTab): Promise<TerminalContext> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            throw new Error('No terminal available');
        }

        const terminalId = this.getTerminalId(t);

        // 检查缓存
        if (this.contextCache.has(terminalId)) {
            const cached = this.contextCache.get(terminalId)!;
            // 如果缓存不超过5秒，直接返回
            if (Date.now() - cached.timestamp < 5000) {
                return cached;
            }
        }

        // 获取最新的上下文信息
        const [currentDirectory, activeShell, prompt, processes] = await Promise.all([
            this.detectCurrentDirectory(t),
            this.getActiveShell(t),
            this.getPrompt(t),
            this.trackProcesses(t)
        ]);

        const context: TerminalContext = {
            terminalId,
            currentDirectory,
            activeShell,
            prompt,
            processes,
            environment: this.filterEnvVariables(process.env),
            timestamp: Date.now()
        };

        // 更新缓存
        this.contextCache.set(terminalId, context);

        return context;
    }

    /**
     * 清理终端上下文缓存
     */
    clearContextCache(terminalId?: string): void {
        if (terminalId) {
            this.contextCache.delete(terminalId);
        } else {
            this.contextCache.clear();
        }
    }

    /**
     * 开始持续监控终端
     */
    startContinuousMonitoring(intervalMs: number = 5000): void {
        const terminals = this.getAllTerminals();

        terminals.forEach(terminal => {
            const terminalId = this.getTerminalId(terminal);

            // 如果已在监控，先停止
            if (this.monitoringIntervals.has(terminalId)) {
                return;
            }

            const subscription = interval(intervalMs).subscribe(async () => {
                try {
                    await this.getTerminalContext(terminal);
                } catch (error) {
                    this.logger.error('Failed to monitor terminal', { terminalId, error });
                }
            });

            this.monitoringIntervals.set(terminalId, subscription);
        });

        this.logger.info('Started continuous monitoring', {
            terminalCount: terminals.length,
            intervalMs
        });
    }

    /**
     * 停止持续监控
     */
    stopContinuousMonitoring(terminalId?: string): void {
        if (terminalId) {
            const subscription = this.monitoringIntervals.get(terminalId);
            if (subscription) {
                subscription.unsubscribe();
                this.monitoringIntervals.delete(terminalId);
            }
        } else {
            this.monitoringIntervals.forEach(sub => sub.unsubscribe());
            this.monitoringIntervals.clear();
        }

        this.logger.info('Stopped continuous monitoring', { terminalId: terminalId || 'all' });
    }

    // ==================== 私有辅助方法 ====================

    private getTerminalId(terminal: TerminalTab): string {
        return terminal.title || `terminal-${Math.random().toString(36).substr(2, 9)}`;
    }

    private detectOutputType(data: string): 'output' | 'command' | 'error' | 'prompt' {
        if (data.includes('error') || data.includes('Error') || data.includes('ERROR')) {
            return 'error';
        }
        if (data.includes('$') || data.includes('#') || data.includes('>')) {
            return 'prompt';
        }
        if (data.includes('\r\n') || data.includes('\n')) {
            return 'output';
        }
        return 'command';
    }

    private formatPrompt(shell: string, cwd: string): string {
        const shellName = shell.split('/').pop() || shell;
        return `${shellName}:${cwd}$ `;
    }

    private extractCommandOutput(originalPrompt: string, newPrompt: string, command: string): string {
        // 简化实现：实际应该解析终端输出
        const lines = newPrompt.split('\n');
        return lines.find(line => line.includes(command) && !line.includes('$')) || '';
    }

    private filterEnvVariables(env: NodeJS.ProcessEnv): Record<string, string> {
        const result: Record<string, string> = {};
        for (const key of Object.keys(env)) {
            const value = env[key];
            if (value !== undefined) {
                result[key] = value;
            }
        }
        return result;
    }
}
