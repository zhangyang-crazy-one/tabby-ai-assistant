import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';

/**
 * 操作系统类型
 */
export enum OSType {
    LINUX = 'linux',
    WINDOWS = 'windows',
    MACOS = 'macos',
    UNKNOWN = 'unknown'
}

/**
 * 终端类型
 */
export enum TerminalType {
    XTERM = 'xterm',
    XTERM_256_COLOR = 'xterm-256color',
    LINUX_CONSOLE = 'linux',
    WINDOWS_CMD = 'windows-cmd',
    WINDOWS_POWERSHELL = 'windows-powershell',
    WINDOWS_WSL = 'windows-wsl',
    MACOS_TERMINAL = 'macos-terminal',
    ITerm2 = 'iterm2',
    UNKNOWN = 'unknown'
}

/**
 * 终端能力
 */
export interface TerminalCapabilities {
    colors: number; // 颜色数（8, 16, 256, 16777216）
    trueColor: boolean; // 是否支持TrueColor
    unicode: boolean; // 是否支持Unicode
    mouse: boolean; // 是否支持鼠标
    bracketedPaste: boolean; // 是否支持括号粘贴
    imageSupport: boolean; // 是否支持图片
    titleSupport: boolean; // 是否支持标题设置
}

/**
 * 平台信息
 */
export interface PlatformInfo {
    os: OSType;
    osVersion: string;
    terminal: TerminalType;
    terminalVersion?: string;
    shell: string;
    shellVersion?: string;
    capabilities: TerminalCapabilities;
    environment: Record<string, string>;
    arch: string; // 架构（x64, x86, arm64等）
    isVirtualTerminal: boolean; // 是否为虚拟终端（如WSL、SSH等）
}

/**
 * 环境分析结果
 */
export interface EnvironmentAnalysis {
    platformInfo: PlatformInfo;
    features: {
        supportsAnsiColors: boolean;
        supportsUnicode: boolean;
        supportsTrueColor: boolean;
        supportsMouseEvents: boolean;
        supportsImages: boolean;
    };
    recommendations: string[];
    compatibility: {
        score: number; // 0-100的兼容性分数
        issues: string[];
        workarounds: string[];
    };
}

/**
 * 平台检测服务
 * 提供跨平台终端环境检测、兼容性分析和能力检测功能
 */
@Injectable({
    providedIn: 'root'
})
export class PlatformDetectionService {
    private platformInfo: PlatformInfo | null = null;
    private analysisCache: EnvironmentAnalysis | null = null;

    constructor(private logger: LoggerService) {
        this.logger.info('PlatformDetectionService initialized');
        this.detectPlatform();
    }

    /**
     * 检测操作系统
     */
    detectOS(): OSType {
        const platform = process.platform;

        switch (platform) {
            case 'linux':
                return OSType.LINUX;
            case 'win32':
                return OSType.WINDOWS;
            case 'darwin':
                return OSType.MACOS;
            default:
                return OSType.UNKNOWN;
        }
    }

    /**
     * 检测终端类型
     */
    detectTerminal(): TerminalType {
        const term = process.env.TERM || '';
        const termProgram = process.env.TERM_PROGRAM || '';
        const sessionName = process.env.SESSION_NAME || '';

        // Windows终端检测
        if (termProgram === 'Windows Terminal' || sessionName === 'Windows Terminal') {
            return TerminalType.WINDOWS_WSL;
        }

        if (process.env.PROMPT || process.env.COMSPEC) {
            return TerminalType.WINDOWS_CMD;
        }

        if (termProgram === 'PowerShell' || process.env.POWERSHELL_VERSION) {
            return TerminalType.WINDOWS_POWERSHELL;
        }

        // macOS终端检测
        if (termProgram === 'iTerm.app') {
            return TerminalType.ITerm2;
        }

        if (termProgram === 'Apple_Terminal') {
            return TerminalType.MACOS_TERMINAL;
        }

        // Linux终端检测
        if (term === 'linux') {
            return TerminalType.LINUX_CONSOLE;
        }

        if (term === 'xterm-256color') {
            return TerminalType.XTERM_256_COLOR;
        }

        if (term === 'xterm') {
            return TerminalType.XTERM;
        }

        return TerminalType.UNKNOWN;
    }

    /**
     * 检查终端能力
     */
    checkCapabilities(): TerminalCapabilities {
        const term = process.env.TERM || '';
        const colorTerm = process.env.COLORTERM || '';

        const capabilities: TerminalCapabilities = {
            colors: this.getColorCount(term, colorTerm),
            trueColor: this.supportsTrueColor(term, colorTerm),
            unicode: this.supportsUnicode(),
            mouse: this.supportsMouse(term),
            bracketedPaste: this.supportsBracketedPaste(term),
            imageSupport: this.supportsImages(term),
            titleSupport: this.supportsTitle(term)
        };

        return capabilities;
    }

    /**
     * 分析环境
     */
    analyzeEnvironment(): EnvironmentAnalysis {
        if (this.analysisCache) {
            return this.analysisCache;
        }

        const platformInfo = this.getPlatformInfo();
        const features = this.analyzeFeatures(platformInfo);
        const recommendations = this.generateRecommendations(platformInfo);
        const compatibility = this.analyzeCompatibility(platformInfo);

        const analysis: EnvironmentAnalysis = {
            platformInfo,
            features,
            recommendations,
            compatibility
        };

        this.analysisCache = analysis;
        return analysis;
    }

    /**
     * 获取版本信息
     */
    getVersionInfo(): {
        osVersion: string;
        terminalVersion?: string;
        shellVersion?: string;
        nodeVersion: string;
    } {
        return {
            osVersion: this.getOSVersion(),
            terminalVersion: this.getTerminalVersion(),
            shellVersion: this.getShellVersion(),
            nodeVersion: process.version
        };
    }

    /**
     * 获取完整的平台信息
     */
    getPlatformInfo(): PlatformInfo {
        if (this.platformInfo) {
            return this.platformInfo;
        }

        const os = this.detectOS();
        const terminal = this.detectTerminal();
        const capabilities = this.checkCapabilities();
        const shell = this.getActiveShell();
        const arch = process.arch;

        this.platformInfo = {
            os,
            osVersion: this.getOSVersion(),
            terminal,
            terminalVersion: this.getTerminalVersion(),
            shell,
            shellVersion: this.getShellVersion(),
            capabilities,
            environment: this.filterEnvVariables(process.env),
            arch,
            isVirtualTerminal: this.isVirtualTerminal()
        };

        return this.platformInfo;
    }

    /**
     * 检查是否支持特定功能
     */
    supportsFeature(feature: 'ansiColors' | 'unicode' | 'trueColor' | 'mouse' | 'images'): boolean {
        const capabilities = this.checkCapabilities();

        switch (feature) {
            case 'ansiColors':
                return capabilities.colors >= 8;
            case 'unicode':
                return capabilities.unicode;
            case 'trueColor':
                return capabilities.trueColor;
            case 'mouse':
                return capabilities.mouse;
            case 'images':
                return capabilities.imageSupport;
            default:
                return false;
        }
    }

    /**
     * 获取终端颜色数（公共方法）
     */
    getTerminalColorCount(): number {
        return this.checkCapabilities().colors;
    }

    /**
     * 检查是否为Windows WSL环境
     */
    isWSL(): boolean {
        return process.platform === 'linux' &&
            !!(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
    }

    /**
     * 检查是否通过SSH连接
     */
    isSSH(): boolean {
        return !!process.env.SSH_CLIENT || !!process.env.SSH_TTY || !!process.env.SSH_CONNECTION;
    }

    /**
     * 清理缓存并重新检测
     */
    refresh(): void {
        this.platformInfo = null;
        this.analysisCache = null;
        this.detectPlatform();
        this.logger.info('Platform detection refreshed');
    }

    // ==================== 私有方法 ====================

    private detectPlatform(): void {
        try {
            const platformInfo = this.getPlatformInfo();
            this.logger.info('Platform detected', {
                os: platformInfo.os,
                terminal: platformInfo.terminal,
                shell: platformInfo.shell,
                arch: platformInfo.arch
            });
        } catch (error) {
            this.logger.error('Failed to detect platform', error);
        }
    }

    private getColorCount(term: string, colorTerm: string): number {
        if (colorTerm === 'truecolor' || colorTerm === '24bit') {
            return 16777216;
        }

        if (term.includes('256color')) {
            return 256;
        }

        if (term.includes('color')) {
            return 16;
        }

        return 8;
    }

    private supportsTrueColor(term: string, colorTerm: string): boolean {
        return colorTerm === 'truecolor' ||
            colorTerm === '24bit' ||
            term.includes('truecolor') ||
            term.includes('24bit');
    }

    private supportsUnicode(): boolean {
        return !!process.env.LC_ALL || !!process.env.LC_CTYPE || !!process.env.LANG;
    }

    private supportsMouse(term: string): boolean {
        return term.includes('mouse') || term.includes('xterm');
    }

    private supportsBracketedPaste(term: string): boolean {
        return term.includes('xterm') || term.includes('screen');
    }

    private supportsImages(term: string): boolean {
        return term.includes('kitty') || term.includes('iterm');
    }

    private supportsTitle(term: string): boolean {
        return term.includes('xterm') || term.includes('screen') || term.includes('tmux');
    }

    private analyzeFeatures(platformInfo: PlatformInfo) {
        return {
            supportsAnsiColors: platformInfo.capabilities.colors >= 8,
            supportsUnicode: platformInfo.capabilities.unicode,
            supportsTrueColor: platformInfo.capabilities.trueColor,
            supportsMouseEvents: platformInfo.capabilities.mouse,
            supportsImages: platformInfo.capabilities.imageSupport
        };
    }

    private generateRecommendations(platformInfo: PlatformInfo): string[] {
        const recommendations: string[] = [];

        // 基于OS的推荐
        if (platformInfo.os === OSType.WINDOWS) {
            recommendations.push('建议使用Windows Terminal或WSL以获得更好的终端体验');
            if (platformInfo.terminal === TerminalType.WINDOWS_CMD) {
                recommendations.push('CMD终端功能有限，建议升级到PowerShell或Windows Terminal');
            }
        }

        if (platformInfo.os === OSType.MACOS) {
            if (platformInfo.terminal === TerminalType.MACOS_TERMINAL) {
                recommendations.push('建议使用iTerm2以获得更多功能和更好的性能');
            }
        }

        // 基于终端能力的推荐
        if (!platformInfo.capabilities.trueColor) {
            recommendations.push('当前终端不支持TrueColor，颜色显示可能受限');
        }

        if (!platformInfo.capabilities.unicode) {
            recommendations.push('当前终端不支持Unicode，非ASCII字符可能显示异常');
        }

        if (!platformInfo.capabilities.mouse) {
            recommendations.push('当前终端不支持鼠标事件，交互功能可能受限');
        }

        return recommendations;
    }

    private analyzeCompatibility(platformInfo: PlatformInfo): {
        score: number;
        issues: string[];
        workarounds: string[];
    } {
        let score = 100;
        const issues: string[] = [];
        const workarounds: string[] = [];

        // 操作系统兼容性
        if (platformInfo.os === OSType.UNKNOWN) {
            score -= 20;
            issues.push('未识别的操作系统');
            workarounds.push('使用默认兼容性设置');
        }

        // 终端兼容性
        if (platformInfo.terminal === TerminalType.UNKNOWN) {
            score -= 15;
            issues.push('未识别的终端类型');
            workarounds.push('使用基础终端功能');
        }

        // 颜色支持
        if (platformInfo.capabilities.colors < 16) {
            score -= 10;
            issues.push('终端颜色支持有限（少于16色）');
            workarounds.push('使用ANSI基本颜色');
        }

        // TrueColor支持
        if (!platformInfo.capabilities.trueColor) {
            score -= 5;
            issues.push('不支持TrueColor');
            workarounds.push('使用256色或基本颜色替代');
        }

        // Unicode支持
        if (!platformInfo.capabilities.unicode) {
            score -= 10;
            issues.push('不支持Unicode字符');
            workarounds.push('使用ASCII字符集');
        }

        return {
            score: Math.max(0, score),
            issues,
            workarounds
        };
    }

    private getOSVersion(): string {
        if (typeof process.release !== 'undefined') {
            return process.release.name + ' ' + (process.version || '');
        }
        return process.platform;
    }

    private getTerminalVersion(): string | undefined {
        return process.env.TERM_VERSION;
    }

    private getActiveShell(): string {
        return process.env.SHELL || process.env.COMSPEC || 'unknown';
    }

    private getShellVersion(): string | undefined {
        // 简化实现：实际应通过执行命令获取
        if (process.env.SHELL) {
            const shellName = process.env.SHELL.split('/').pop();
            return shellName;
        }
        return undefined;
    }

    private isVirtualTerminal(): boolean {
        return this.isWSL() || this.isSSH();
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
