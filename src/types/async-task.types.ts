/**
 * 异步任务类型定义
 * 用于长时间运行的终端命令（如 npm install, git clone 等）
 */

/** 异步任务状态 */
export type AsyncTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 异步任务信息 */
export interface AsyncTask {
    /** 唯一任务ID */
    taskId: string;
    
    /** 执行的命令 */
    command: string;
    
    /** 任务状态 */
    status: AsyncTaskStatus;
    
    /** 创建时间 */
    createdAt: Date;
    
    /** 开始执行时间 */
    startedAt?: Date;
    
    /** 完成时间 */
    completedAt?: Date;
    
    /** 命令输出（实时累积） */
    output: string;
    
    /** 退出码（完成后） */
    exitCode?: number;
    
    /** 错误消息 */
    errorMessage?: string;
    
    /** 关联的终端 Tab ID */
    terminalTabId?: string;
}

/** 异步任务创建参数 */
export interface CreateAsyncTaskParams {
    /** 要执行的命令 */
    command: string;
    
    /** 可选：工作目录 */
    cwd?: string;
    
    /** 可选：超时时间（毫秒），默认 5 分钟 */
    timeout?: number;
}

/** 异步任务结果（查询时返回） */
export interface AsyncTaskResult {
    /** 任务ID */
    taskId: string;
    
    /** 当前状态 */
    status: AsyncTaskStatus;
    
    /** 已运行时间（毫秒） */
    elapsedMs: number;
    
    /** 命令输出（最新部分或全部） */
    output: string;
    
    /** 是否已完成 */
    isComplete: boolean;
    
    /** 退出码（仅完成时） */
    exitCode?: number;
    
    /** 错误消息（仅失败时） */
    errorMessage?: string;
}

/** 异步任务事件类型 */
export type AsyncTaskEventType = 
    | 'task_created'      // 任务已创建
    | 'task_started'      // 任务开始执行
    | 'task_output'       // 新增输出
    | 'task_completed'    // 任务完成
    | 'task_failed'       // 任务失败
    | 'task_cancelled';   // 任务被取消

/** 异步任务事件 */
export interface AsyncTaskEvent {
    type: AsyncTaskEventType;
    taskId: string;
    timestamp: Date;
    data?: {
        output?: string;
        exitCode?: number;
        errorMessage?: string;
    };
}

/** 异步工具调用参数 - async_terminal_command */
export interface AsyncTerminalCommandParams {
    /** 要执行的命令 */
    command: string;
    
    /** 可选：工作目录 */
    cwd?: string;
}

/** 异步工具调用参数 - check_task_status */
export interface CheckTaskStatusParams {
    /** 任务ID */
    taskId: string;
    
    /** 可选：是否获取完整输出，默认只获取最新部分 */
    fullOutput?: boolean;
}

/** 异步工具调用参数 - cancel_task */
export interface CancelTaskParams {
    /** 任务ID */
    taskId: string;
}
