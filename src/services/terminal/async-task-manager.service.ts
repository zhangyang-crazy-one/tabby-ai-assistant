/**
 * 异步任务管理器服务
 * 
 * 职责：
 * 1. 管理长时间运行的终端命令（如 npm install, git clone 等）
 * 2. 使用 task-id 标记每个任务
 * 3. 监控任务执行状态和输出
 * 4. 提供任务查询和取消功能
 */

import { Injectable } from '@angular/core';
import { Subject, Observable, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
    AsyncTask, 
    AsyncTaskStatus, 
    AsyncTaskEvent, 
    AsyncTaskEventType,
    CreateAsyncTaskParams,
    AsyncTaskResult 
} from '../../types/async-task.types';
import { TerminalManagerService } from './terminal-manager.service';
import { LoggerService } from '../core/logger.service';

@Injectable({ providedIn: 'root' })
export class AsyncTaskManagerService {
    // ========== 状态管理 ==========
    
    /** 所有异步任务 */
    private tasks = new Map<string, AsyncTask>();
    
    /** 任务事件流 */
    private taskEventSubject = new Subject<AsyncTaskEvent>();
    
    /** 活跃的监控定时器 */
    private monitoringIntervals = new Map<string, any>();
    
    /** 默认超时时间：5分钟 */
    private readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
    
    /** 轮询间隔：500ms */
    private readonly POLL_INTERVAL_MS = 500;
    
    /** 最大输出长度 */
    private readonly MAX_OUTPUT_LENGTH = 100000;
    
    /** 任务 ID 前缀 */
    private readonly TASK_ID_PREFIX = 'task_';

    constructor(
        private terminalManager: TerminalManagerService,
        private logger: LoggerService
    ) {}

    // ========== 公共 API ==========

    /**
     * 获取任务事件流（供 UI 和 AI 使用）
     */
    get taskEvents$(): Observable<AsyncTaskEvent> {
        return this.taskEventSubject.asObservable();
    }

    /**
     * 创建并启动异步任务
     */
    createTask(params: CreateAsyncTaskParams): AsyncTask {
        const taskId = this.generateTaskId();
        const now = new Date();

        const task: AsyncTask = {
            taskId,
            command: params.command,
            status: 'pending',
            createdAt: now,
            output: '',
            terminalTabId: undefined
        };

        this.tasks.set(taskId, task);
        this.logger.info('Async task created', { taskId, command: params.command });

        // 发送任务创建事件
        this.emitEvent({
            type: 'task_created',
            taskId,
            timestamp: new Date()
        });

        // 异步启动任务
        setTimeout(() => this.startTask(taskId, params), 0);

        return task;
    }

    /**
     * 获取任务状态和结果
     */
    getTaskResult(taskId: string, fullOutput: boolean = false): AsyncTaskResult | null {
        const task = this.tasks.get(taskId);
        if (!task) {
            return null;
        }

        const now = new Date();
        const elapsedMs = task.startedAt 
            ? now.getTime() - task.startedAt.getTime()
            : 0;

        let output = task.output;
        if (!fullOutput && output.length > this.MAX_OUTPUT_LENGTH) {
            output = '...(输出过长，已截断)...\n' + output.slice(-this.MAX_OUTPUT_LENGTH / 2);
        }

        const isComplete = ['completed', 'failed', 'cancelled'].includes(task.status);

        return {
            taskId,
            status: task.status,
            elapsedMs,
            output,
            isComplete,
            exitCode: task.exitCode,
            errorMessage: task.errorMessage
        };
    }

    /**
     * 获取所有活跃任务
     */
    getActiveTasks(): AsyncTask[] {
        const activeStatuses: AsyncTaskStatus[] = ['pending', 'running'];
        return Array.from(this.tasks.values())
            .filter(task => activeStatuses.includes(task.status));
    }

    /**
     * 获取任务实例
     */
    getTask(taskId: string): AsyncTask | null {
        return this.tasks.get(taskId) || null;
    }

    /**
     * 取消任务
     */
    cancelTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== 'running') {
            return false;
        }

        // 停止监控
        this.stopMonitoring(taskId);

        // 更新状态
        task.status = 'cancelled';
        task.completedAt = new Date();

        this.logger.info('Async task cancelled', { taskId });

        // 发送事件
        this.emitEvent({
            type: 'task_cancelled',
            taskId,
            timestamp: new Date()
        });

        return true;
    }

    /**
     * 获取任务输出（指定行数）
     */
    getTaskOutput(taskId: string, lines: number = 50): string {
        const task = this.tasks.get(taskId);
        if (!task) {
            return `(任务 ${taskId} 不存在)`;
        }

        const allLines = task.output.split('\n');
        const startLine = Math.max(0, allLines.length - lines);
        return allLines.slice(startLine).join('\n');
    }

    /**
     * 清理已完成的任务（释放内存）
     */
    cleanupCompletedTasks(maxAgeMs: number = 60 * 60 * 1000): void {
        const now = Date.now();
        const tasksToDelete: string[] = [];

        this.tasks.forEach((task, taskId) => {
            if (['completed', 'failed', 'cancelled'].includes(task.status)) {
                const age = now - task.createdAt.getTime();
                if (age > maxAgeMs) {
                    tasksToDelete.push(taskId);
                }
            }
        });

        tasksToDelete.forEach(taskId => {
            this.tasks.delete(taskId);
            this.logger.debug('Cleaned up completed task', { taskId });
        });
    }

    // ========== 私有方法 ==========

    /**
     * 生成唯一任务 ID
     */
    private generateTaskId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${this.TASK_ID_PREFIX}${timestamp}_${random}`;
    }

    /**
     * 启动任务执行
     */
    private startTask(taskId: string, params: CreateAsyncTaskParams): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.logger.error('Task not found', { taskId });
            return;
        }

        try {
            // 发送命令到终端
            const success = this.terminalManager.sendCommand(params.command, true);

            if (!success) {
                this.failTask(taskId, '无法执行命令，终端不可用');
                return;
            }

            // 更新任务状态
            task.status = 'running';
            task.startedAt = new Date();

            this.logger.info('Async task started', { taskId, command: params.command });

            // 发送任务开始事件
            this.emitEvent({
                type: 'task_started',
                taskId,
                timestamp: new Date()
            });

            // 开始监控任务
            this.startMonitoring(taskId, params.timeout || this.DEFAULT_TIMEOUT_MS);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to start task', { taskId, error: errorMessage });
            this.failTask(taskId, errorMessage);
        }
    }

    /**
     * 开始监控任务执行
     */
    private startMonitoring(taskId: string, timeoutMs: number): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // 使用 RxJS interval 进行轮询
        const poll$ = interval(this.POLL_INTERVAL_MS);
        
        const subscription = poll$.pipe(
            takeUntil(new Subject())
        ).subscribe({
            next: () => {
                const currentTask = this.tasks.get(taskId);
                if (!currentTask || currentTask.status !== 'running') {
                    subscription.unsubscribe();
                    return;
                }

                // 检查超时
                if (currentTask.startedAt) {
                    const elapsed = Date.now() - currentTask.startedAt.getTime();
                    if (elapsed > timeoutMs) {
                        this.logger.warn('Async task timeout', { taskId, elapsed, timeoutMs });
                        this.completeTask(taskId, false, 'timeout');
                        subscription.unsubscribe();
                        return;
                    }
                }

                // 读取终端输出
                this.updateTaskOutput(taskId);

                // 检测命令是否完成
                if (this.isTaskComplete(currentTask)) {
                    this.completeTask(taskId, true);
                    subscription.unsubscribe();
                }
            }
        });

        this.monitoringIntervals.set(taskId, { subscription });
    }

    /**
     * 停止监控
     */
    private stopMonitoring(taskId: string): void {
        const monitoring = this.monitoringIntervals.get(taskId);
        if (monitoring) {
            monitoring.subscription.unsubscribe();
            this.monitoringIntervals.delete(taskId);
        }
    }

    /**
     * 更新任务输出
     */
    private updateTaskOutput(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== 'running') return;

        try {
            // 从终端读取输出（使用 TerminalManagerService 的方法）
            const terminalOutput = this.terminalManager.readTerminalOutput(100);
            
            if (terminalOutput && terminalOutput.trim() && 
                terminalOutput !== '(终端输出为空)' && 
                terminalOutput !== '(终端 buffer 为空)') {
                // 追加新输出（只保留最近的）
                task.output = terminalOutput;

                // 发送输出事件
                this.emitEvent({
                    type: 'task_output',
                    taskId,
                    timestamp: new Date(),
                    data: { output: task.output }
                });
            }
        } catch (error) {
            this.logger.warn('Failed to update task output', { taskId, error });
        }
    }

    /**
     * 检测任务是否完成
     */
    private isTaskComplete(task: AsyncTask): boolean {
        const output = task.output;

        // 检测常见命令完成标志
        const completionPatterns = [
            // npm 相关的完成标志
            /\badded\s+\d+\s+packages?\b/i,
            /\bnpm\s+WARN\b/i,  // npm 警告也是完成信号
            /\bfound\s+\d+\s+errors?\b/i,
            
            // 构建完成
            /\b(build|compiled|finished|success|done)\b.*?(in|after)\s+\d+(\.\d+)?s/i,
            /\bDone in\s+\d+(\.\d+)?s\b/i,
            /\bFinished\b.*?\d+ms/i,
            
            // Git 相关的完成标志
            /\b(Everything up-to-date|Already up to date|up to \d+ commits?)\b/i,
            /\bbranch\s+'[^']+'\s+set up to track\b/i,
            
            // 一般完成标志
            /\btask_complete\b/i,  // 如果有任务完成标记
            /✅/g,  // 成功表情
            /\n\$?\s*$/m,  // shell 提示符
        ];

        return completionPatterns.some(pattern => pattern.test(output));
    }

    /**
     * 完成任务
     */
    private completeTask(taskId: string, success: boolean, errorMessage?: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        // 停止监控
        this.stopMonitoring(taskId);

        // 更新状态
        task.status = success ? 'completed' : 'failed';
        task.completedAt = new Date();
        task.errorMessage = errorMessage;

        // 尝试获取退出码
        task.exitCode = success ? 0 : 1;

        this.logger.info('Async task completed', { 
            taskId, 
            success, 
            status: task.status,
            duration: task.completedAt!.getTime() - task.startedAt!.getTime()
        });

        // 发送完成事件
        this.emitEvent({
            type: success ? 'task_completed' : 'task_failed',
            taskId,
            timestamp: new Date(),
            data: {
                output: task.output,
                exitCode: task.exitCode,
                errorMessage
            }
        });
    }

    /**
     * 标记任务失败
     */
    private failTask(taskId: string, error: string): void {
        this.completeTask(taskId, false, error);
    }

    /**
     * 发送任务事件
     */
    private emitEvent(event: AsyncTaskEvent): void {
        this.taskEventSubject.next(event);
    }
}
