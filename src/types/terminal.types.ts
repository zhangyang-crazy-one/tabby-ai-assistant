/**
 * 终端相关类型定义
 */

// 终端会话信息
export interface TerminalSession {
    sessionId: string;
    pid?: number;
    cwd: string;
    shell: string;
    user?: string;
    hostname?: string;
    environment: Record<string, string>;
    startTime: Date;
    lastActivity: Date;
}

// 终端上下文
export interface TerminalContext {
    session: TerminalSession;
    currentCommand?: string;
    lastCommand?: string;
    lastOutput?: string;
    lastError?: string;
    exitCode?: number;
    isRunning: boolean;
    runningProcess?: ProcessInfo;
    recentCommands: string[];
    systemInfo: SystemInfo;
    projectInfo?: ProjectInfo;
}

// 进程信息
export interface ProcessInfo {
    pid: number;
    name: string;
    status: 'running' | 'sleeping' | 'stopped' | 'zombie';
    cpu?: number;
    memory?: number;
    startTime?: Date;
    command: string;
}

// 系统信息
export interface SystemInfo {
    platform: 'win32' | 'linux' | 'darwin' | 'freebsd' | 'sunos' | 'browser';
    arch: string;
    type: string;
    release: string;
    version?: string;
    cpus: number;
    totalMemory: number;
    availableMemory?: number;
    nodeVersion?: string;
}

// 项目信息（如果检测到）
export interface ProjectInfo {
    type?: 'git' | 'npm' | 'yarn' | 'maven' | 'gradle' | 'pip' | 'cargo' | 'go' | 'rust';
    root: string;
    name?: string;
    version?: string;
    dependencies?: string[];
    scripts?: Record<string, string>;
    description?: string;
    language?: string;
    framework?: string;
}

// 错误信息
export interface TerminalError {
    type: 'command_not_found' | 'permission_denied' | 'file_not_found' | 'syntax_error' | 'runtime_error' | 'network_error' | 'unknown';
    message: string;
    command?: string;
    exitCode?: number;
    stack?: string;
    suggestions?: string[];
    timestamp: Date;
}

// 缓冲区内容
export interface BufferContent {
    content: string;
    cursorPosition: number;
    selectionStart?: number;
    selectionEnd?: number;
}

// 命令执行结果
export interface CommandResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    timestamp: Date;
    success: boolean;
}

// 历史条目
export interface HistoryEntry {
    command: string;
    timestamp: Date;
    exitCode?: number;
    duration?: number;
    cwd?: string;
}

// 环境变量变更
export interface EnvironmentChange {
    key: string;
    oldValue?: string;
    newValue: string;
    timestamp: Date;
}

// 终端主题
export interface TerminalTheme {
    name: string;
    foreground: string;
    background: string;
    colors: string[];
    cursor: string;
}

// 文件系统状态
export interface FileSystemState {
    currentPath: string;
    files: FileInfo[];
    permissions: Record<string, string>;
}

// 文件信息
export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink' | 'device' | 'pipe' | 'socket';
    size: number;
    modified: Date;
    permissions: string;
    owner?: string;
    group?: string;
}

// 快捷键定义
export interface Hotkey {
    key: string;
    description: string;
    action: string;
    scope?: 'global' | 'terminal' | 'chat';
}

// 终端能力
export interface TerminalCapability {
    name: string;
    supported: boolean;
    version?: string;
}

// 剪贴板内容
export interface ClipboardContent {
    text: string;
    type: 'plain' | 'rich' | 'image' | 'file';
    timestamp: Date;
}

// 自动补全候选
export interface AutoCompleteCandidate {
    value: string;
    description?: string;
    type: 'command' | 'file' | 'directory' | 'variable' | 'function';
    icon?: string;
}

// 终端警告/通知
export interface TerminalNotification {
    type: 'warning' | 'info' | 'error' | 'success';
    title: string;
    message: string;
    timestamp: Date;
    persistent?: boolean;
    actions?: {
        label: string;
        action: () => void;
    }[];
}
