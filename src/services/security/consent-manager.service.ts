import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { RiskLevel, StoredConsent } from '../../types/security.types';
import { LoggerService } from '../core/logger.service';
import { FileStorageService } from '../core/file-storage.service';

@Injectable({ providedIn: 'root' })
export class ConsentManagerService {
    private readonly CONSENT_KEY_PREFIX = 'ai-assistant-consent-';
    private readonly DEFAULT_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30天
    private readonly STORAGE_FILENAME = 'consents';

    constructor(
        private logger: LoggerService,
        private fileStorage: FileStorageService
    ) {}

    /**
     * 存储用户同意
     */
    async storeConsent(command: string, riskLevel: RiskLevel): Promise<void> {
        const consent: StoredConsent = {
            commandHash: this.hashCommand(command),
            riskLevel,
            timestamp: Date.now(),
            expiry: Date.now() + this.DEFAULT_EXPIRY
        };

        this.saveConsentToStorage(consent);
        this.logger.debug('User consent stored', { commandHash: consent.commandHash, riskLevel });
    }

    /**
     * 检查是否有用户同意
     */
    async hasConsent(command: string, riskLevel: RiskLevel): Promise<boolean> {
        const hash = this.hashCommand(command);
        const consent = this.getConsentFromStorage(hash);

        if (!consent) {
            return false;
        }

        try {
            // 检查是否过期
            if (Date.now() > consent.expiry) {
                this.removeConsentFromStorage(hash);
                this.logger.debug('Expired consent removed', { commandHash: hash });
                return false;
            }

            // 检查风险级别是否匹配
            const levelMatch = consent.riskLevel === riskLevel;
            if (!levelMatch) {
                this.logger.debug('Risk level mismatch', {
                    stored: consent.riskLevel,
                    current: riskLevel
                });
                return false;
            }

            this.logger.debug('Valid consent found', { commandHash: hash });
            return true;

        } catch (error) {
            this.logger.error('Failed to parse consent', error);
            return false;
        }
    }

    /**
     * 请求用户同意
     */
    async requestConsent(
        command: string,
        explanation: string,
        riskLevel: RiskLevel
    ): Promise<boolean> {
        // 显示确认对话框
        const riskText = this.getRiskLevelText(riskLevel);
        const message = `此命令为${riskText}风险：

命令: ${command}

解释: ${explanation}

确定要执行此命令吗？`;

        const confirmed = confirm(message);

        if (confirmed) {
            this.logger.info('User granted consent', { command, riskLevel });
        } else {
            this.logger.info('User denied consent', { command, riskLevel });
        }

        return confirmed;
    }

    /**
     * 清除所有同意
     */
    async clearAllConsents(): Promise<void> {
        const keys = Object.keys(localStorage);
        const consentKeys = keys.filter(key => key.startsWith(this.CONSENT_KEY_PREFIX));

        consentKeys.forEach(key => {
            localStorage.removeItem(key);
        });

        this.logger.info('All consents cleared', { count: consentKeys.length });
    }

    /**
     * 获取所有同意数量
     */
    async getActiveConsentsCount(): Promise<number> {
        const keys = Object.keys(localStorage);
        const consentKeys = keys.filter(key => key.startsWith(this.CONSENT_KEY_PREFIX));

        let activeCount = 0;
        const now = Date.now();

        consentKeys.forEach(key => {
            try {
                const consentStr = localStorage.getItem(key);
                if (consentStr) {
                    const consent: StoredConsent = JSON.parse(consentStr);
                    if (now <= consent.expiry) {
                        activeCount++;
                    } else {
                        // 删除过期的
                        localStorage.removeItem(key);
                    }
                }
            } catch (error) {
                // 删除损坏的
                localStorage.removeItem(key);
            }
        });

        return activeCount;
    }

    /**
     * 获取总验证次数
     */
    async getTotalValidations(): Promise<number> {
        const keys = Object.keys(localStorage);
        const consentKeys = keys.filter(key => key.startsWith(this.CONSENT_KEY_PREFIX));
        return consentKeys.length;
    }

    /**
     * 获取同意统计
     */
    async getConsentStats(): Promise<{
        total: number;
        byLevel: { [key in RiskLevel]: number };
        expired: number;
    }> {
        const stats = {
            total: 0,
            byLevel: {
                [RiskLevel.LOW]: 0,
                [RiskLevel.MEDIUM]: 0,
                [RiskLevel.HIGH]: 0,
                [RiskLevel.CRITICAL]: 0
            },
            expired: 0
        };

        const keys = Object.keys(localStorage);
        const consentKeys = keys.filter(key => key.startsWith(this.CONSENT_KEY_PREFIX));
        const now = Date.now();

        consentKeys.forEach(key => {
            try {
                const consentStr = localStorage.getItem(key);
                if (consentStr) {
                    const consent: StoredConsent = JSON.parse(consentStr);
                    stats.total++;

                    if (now <= consent.expiry) {
                        stats.byLevel[consent.riskLevel]++;
                    } else {
                        stats.expired++;
                        // 删除过期的
                        localStorage.removeItem(key);
                    }
                }
            } catch (error) {
                // 删除损坏的
                localStorage.removeItem(key);
            }
        });

        return stats;
    }

    /**
     * 清理过期的同意
     */
    async cleanupExpiredConsents(): Promise<number> {
        const keys = Object.keys(localStorage);
        const consentKeys = keys.filter(key => key.startsWith(this.CONSENT_KEY_PREFIX));
        let removedCount = 0;
        const now = Date.now();

        consentKeys.forEach(key => {
            try {
                const consentStr = localStorage.getItem(key);
                if (consentStr) {
                    const consent: StoredConsent = JSON.parse(consentStr);
                    if (now > consent.expiry) {
                        localStorage.removeItem(key);
                        removedCount++;
                    }
                }
            } catch (error) {
                // 删除损坏的
                localStorage.removeItem(key);
                removedCount++;
            }
        });

        if (removedCount > 0) {
            this.logger.info('Expired consents cleaned up', { removedCount });
        }

        return removedCount;
    }

    /**
     * 获取风险级别文本
     */
    private getRiskLevelText(riskLevel: RiskLevel): string {
        switch (riskLevel) {
            case RiskLevel.LOW:
                return '低';
            case RiskLevel.MEDIUM:
                return '中';
            case RiskLevel.HIGH:
                return '高';
            case RiskLevel.CRITICAL:
                return '极';
            default:
                return '未知';
        }
    }

    /**
     * 对命令进行哈希
     */
    private hashCommand(command: string): string {
        // 规范化命令（去除多余空格，转换为小写）
        const normalized = command.trim().toLowerCase();
        return CryptoJS.SHA256(normalized).toString();
    }

    // ==================== 文件存储辅助方法 ====================

    /**
     * 获取存储的文件路径
     */
    private getStorageKey(consent: StoredConsent): string {
        return `${this.CONSENT_KEY_PREFIX}${consent.commandHash}`;
    }

    /**
     * 保存同意到文件存储
     */
    private saveConsentToStorage(consent: StoredConsent): void {
        const consents = this.loadAllConsentsFromStorage();
        consents.set(consent.commandHash, consent);
        this.fileStorage.save(this.STORAGE_FILENAME, Array.from(consents.values()));
    }

    /**
     * 从文件存储获取同意
     */
    private getConsentFromStorage(commandHash: string): StoredConsent | null {
        const consents = this.loadAllConsentsFromStorage();
        return consents.get(commandHash) || null;
    }

    /**
     * 从文件存储删除同意
     */
    private removeConsentFromStorage(commandHash: string): void {
        const consents = this.loadAllConsentsFromStorage();
        consents.delete(commandHash);
        this.fileStorage.save(this.STORAGE_FILENAME, Array.from(consents.values()));
    }

    /**
     * 从文件存储加载所有同意
     */
    private loadAllConsentsFromStorage(): Map<string, StoredConsent> {
        const data = this.fileStorage.load<StoredConsent[]>(this.STORAGE_FILENAME, []);
        return new Map(data.map(c => [c.commandHash, c]));
    }

    /**
     * 导出同意数据
     */
    exportConsents(): string {
        const consents = this.loadAllConsentsFromStorage();

        return JSON.stringify({
            exportTime: new Date().toISOString(),
            consents: Array.from(consents.values())
        }, null, 2);
    }

    /**
     * 导入同意数据
     */
    importConsents(data: string): Promise<{ imported: number; skipped: number }> {
        return new Promise((resolve, reject) => {
            try {
                const parsed = JSON.parse(data);
                if (!parsed.consents || !Array.isArray(parsed.consents)) {
                    throw new Error('Invalid data format');
                }

                let imported = 0;
                let skipped = 0;
                const now = Date.now();

                parsed.consents.forEach((consent: StoredConsent) => {
                    try {
                        // 检查是否已存在且未过期
                        const existing = this.getConsentFromStorage(consent.commandHash);
                        if (existing && now <= existing.expiry) {
                            skipped++;
                            return;
                        }

                        // 导入同意
                        this.saveConsentToStorage(consent);
                        imported++;
                    } catch (error) {
                        skipped++;
                    }
                });

                this.logger.info('Consents imported', { imported, skipped });
                resolve({ imported, skipped });

            } catch (error) {
                reject(error);
            }
        });
    }
}
