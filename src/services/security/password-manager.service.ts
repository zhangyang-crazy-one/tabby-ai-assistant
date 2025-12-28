import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { PasswordValidationResult } from '../../types/security.types';
import { LoggerService } from '../core/logger.service';

@Injectable({ providedIn: 'root' })
export class PasswordManagerService {
    private readonly STORAGE_KEY = 'ai-assistant-password-hash';
    private readonly MAX_ATTEMPTS = 5;
    private readonly LOCKOUT_TIME = 15 * 60 * 1000; // 15分钟

    private attempts = 0;
    private lockoutUntil: number | null = null;

    constructor(private logger: LoggerService) {
        this.loadState();
    }

    /**
     * 设置密码
     */
    setPassword(password: string): void {
        const hash = this.hashPassword(password);
        localStorage.setItem(this.STORAGE_KEY, hash);
        this.logger.info('Password set successfully');
    }

    /**
     * 验证密码
     */
    async requestPassword(): Promise<boolean> {
        // 检查是否被锁定
        if (this.isLocked()) {
            const remainingTime = this.getRemainingLockoutTime();
            this.logger.warn('Password attempts locked', { remainingTime });
            alert(`账户已锁定，请等待 ${Math.ceil(remainingTime / 60000)} 分钟后再试`);
            return false;
        }

        // 显示密码输入框
        const password = prompt('请输入密码以执行此操作:');
        if (password === null) {
            // 用户取消
            return false;
        }

        // 验证密码
        const isValid = await this.verifyPassword(password);

        if (isValid) {
            this.resetAttempts();
            this.logger.info('Password verified successfully');
            return true;
        } else {
            this.attempts++;
            this.logger.warn('Password verification failed', { attempts: this.attempts });

            if (this.attempts >= this.MAX_ATTEMPTS) {
                this.lockoutUntil = Date.now() + this.LOCKOUT_TIME;
                this.saveState();
                this.logger.error('Password attempts exceeded, account locked');
                alert(`密码错误次数过多，账户已锁定 ${this.LOCKOUT_TIME / 60000} 分钟`);
            }

            return false;
        }
    }

    /**
     * 检查是否有密码保护
     */
    hasPassword(): boolean {
        return !!localStorage.getItem(this.STORAGE_KEY);
    }

    /**
     * 清除密码
     */
    clearPassword(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        this.resetAttempts();
        this.logger.info('Password cleared');
    }

    /**
     * 验证密码是否正确
     */
    private async verifyPassword(password: string): Promise<boolean> {
        const storedHash = localStorage.getItem(this.STORAGE_KEY);
        if (!storedHash) {
            // 没有设置密码，允许通过
            return true;
        }

        const inputHash = this.hashPassword(password);
        return inputHash === storedHash;
    }

    /**
     * 哈希密码
     */
    private hashPassword(password: string): string {
        // 使用SHA-256哈希密码
        return CryptoJS.SHA256(password).toString();
    }

    /**
     * 检查是否被锁定
     */
    private isLocked(): boolean {
        return this.lockoutUntil !== null && Date.now() < this.lockoutUntil;
    }

    /**
     * 获取剩余锁定时间
     */
    private getRemainingLockoutTime(): number {
        if (this.lockoutUntil === null) return 0;
        return Math.max(0, this.lockoutUntil - Date.now());
    }

    /**
     * 重置尝试次数
     */
    private resetAttempts(): void {
        this.attempts = 0;
        this.lockoutUntil = null;
        this.saveState();
    }

    /**
     * 保存状态
     */
    private saveState(): void {
        const state = {
            attempts: this.attempts,
            lockoutUntil: this.lockoutUntil
        };
        localStorage.setItem('ai-assistant-password-state', JSON.stringify(state));
    }

    /**
     * 加载状态
     */
    private loadState(): void {
        try {
            const stateStr = localStorage.getItem('ai-assistant-password-state');
            if (stateStr) {
                const state = JSON.parse(stateStr);
                this.attempts = state.attempts || 0;
                this.lockoutUntil = state.lockoutUntil;

                // 检查锁定是否过期
                if (this.lockoutUntil && Date.now() >= this.lockoutUntil) {
                    this.resetAttempts();
                }
            }
        } catch (error) {
            this.logger.error('Failed to load password state', error);
        }
    }

    /**
     * 获取验证结果
     */
    getValidationResult(): PasswordValidationResult {
        return {
            valid: this.attempts === 0 && !this.isLocked(),
            attempts: this.attempts,
            locked: this.isLocked(),
            lockExpiry: this.lockoutUntil || undefined
        };
    }

    /**
     * 获取总尝试次数
     */
    getTotalAttempts(): number {
        return this.attempts;
    }

    /**
     * 获取失败次数
     */
    getFailedAttempts(): number {
        return Math.max(0, this.attempts - 1);
    }
}
