import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoggerService {
    private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
    private logs: Array<{ level: string; message: string; timestamp: Date; data?: any }> = [];

    constructor() {
        this.loadLogLevel();
    }

    private loadLogLevel(): void {
        // 从配置中加载日志级别
        try {
            const config = localStorage.getItem('ai-assistant-config');
            if (config) {
                const parsed = JSON.parse(config);
                this.logLevel = parsed.logLevel || 'info';
            }
        } catch (e) {
            // 忽略错误，使用默认级别
        }
    }

    debug(message: string, data?: any): void {
        if (this.shouldLog('debug')) {
            this.log('DEBUG', message, data);
        }
    }

    info(message: string, data?: any): void {
        if (this.shouldLog('info')) {
            this.log('INFO', message, data);
        }
    }

    warn(message: string, data?: any): void {
        if (this.shouldLog('warn')) {
            this.log('WARN', message, data);
        }
    }

    error(message: string, error?: any): void {
        if (this.shouldLog('error')) {
            this.log('ERROR', message, error);
        }
    }

    private shouldLog(level: string): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.logLevel);
        const messageIndex = levels.indexOf(level);
        return messageIndex >= currentIndex;
    }

    private log(level: string, message: string, data?: any): void {
        const entry = {
            level,
            message,
            timestamp: new Date(),
            data
        };

        this.logs.push(entry);

        // 限制日志数量，避免内存溢出
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-500);
        }

        // 输出到控制台
        switch (level) {
            case 'DEBUG':
                console.debug(`[AI Assistant] ${message}`, data);
                break;
            case 'INFO':
                console.info(`[AI Assistant] ${message}`, data);
                break;
            case 'WARN':
                console.warn(`[AI Assistant] ${message}`, data);
                break;
            case 'ERROR':
                console.error(`[AI Assistant] ${message}`, data);
                break;
        }
    }

    getLogs(): Array<{ level: string; message: string; timestamp: Date; data?: any }> {
        return [...this.logs];
    }

    clearLogs(): void {
        this.logs = [];
    }

    setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
        this.logLevel = level;
        localStorage.setItem('ai-assistant-log-level', level);
    }

    getLogLevel(): string {
        return this.logLevel;
    }
}
