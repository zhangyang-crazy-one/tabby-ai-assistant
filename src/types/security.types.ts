/**
 * 安全相关类型定义
 */

// 风险级别
export enum RiskLevel {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

// 风险评估结果
export interface RiskAssessment {
    level: RiskLevel;
    score: number; // 0-100
    reasons: string[];
    patterns: {
        pattern: string;
        match: string;
        severity: RiskLevel;
    }[];
    suggestions?: string[];
}

// 验证结果
export interface ValidationResult {
    approved: boolean;
    riskLevel: RiskLevel;
    skipConfirmation?: boolean;
    reason?: string;
    timestamp?: Date;
}

// 存储的同意
export interface StoredConsent {
    commandHash: string;
    riskLevel: RiskLevel;
    timestamp: number;
    expiry: number;
    userId?: string;
}

// 密码验证结果
export interface PasswordValidationResult {
    valid: boolean;
    attempts: number;
    locked: boolean;
    lockExpiry?: number;
}

// 安全配置
export interface SecurityConfig {
    enablePasswordProtection: boolean;
    passwordHash?: string;
    consentExpiryDays: number;
    maxConsentAge: number;
    enableRiskAssessment: boolean;
    autoApproveLowRisk: boolean;
    promptForMediumRisk: boolean;
    requirePasswordForHighRisk: boolean;
    dangerousPatterns: string[];
    allowedCommands: string[];
    forbiddenCommands: string[];
}

// 安全事件
export interface SecurityEvent {
    type: 'risk_assessed' | 'consent_given' | 'consent_rejected' | 'password_verified' | 'password_failed' | 'command_blocked' | 'command_allowed';
    timestamp: Date;
    command?: string;
    riskLevel?: RiskLevel;
    details?: Record<string, any>;
}

// 安全统计
export interface SecurityStats {
    totalCommandsEvaluated: number;
    totalCommandsBlocked: number;
    totalConsentsGiven: number;
    totalConsentsRejected: number;
    totalPasswordAttempts: number;
    failedPasswordAttempts: number;
    averageRiskScore: number;
    riskLevelDistribution: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
}

// 密码策略
export interface PasswordPolicy {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    prohibitCommonPasswords: boolean;
    prohibitReuse: number; // number of previous passwords to check
}
