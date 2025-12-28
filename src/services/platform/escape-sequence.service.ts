import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';
import { PlatformDetectionService, OSType, TerminalType } from './platform-detection.service';

/**
 * 转义序列类型
 */
export enum EscapeSequenceType {
    COLOR = 'color',
    CURSOR = 'cursor',
    CLEAR = 'clear',
    STYLE = 'style',
    SCROLL = 'scroll',
    TITLE = 'title',
    BELL = 'bell'
}

/**
 * 颜色代码
 */
export interface ColorCode {
    foreground?: string;
    background?: string;
    bright?: boolean;
}

/**
 * 光标控制
 */
export interface CursorControl {
    position?: { x: number; y: number };
    visible?: boolean;
    save?: boolean;
    restore?: boolean;
    up?: number;
    down?: number;
    forward?: number;
    backward?: number;
}

/**
 * 清屏选项
 */
export interface ClearOptions {
    screen?: boolean;
    line?: boolean;
    fromCursor?: boolean;
    toCursor?: boolean;
}

/**
 * 转义序列映射
 */
export interface EscapeSequenceMapping {
    linux: string;
    windows: string;
    macos: string;
}

/**
 * 转义序列服务
 * 处理跨平台的ANSI转义序列和终端控制代码
 */
@Injectable({
    providedIn: 'root'
})
export class EscapeSequenceService {
    private platformInfo: { os: OSType; terminal: TerminalType } | null = null;

    // 颜色代码映射
    private readonly COLOR_CODES: Record<string, EscapeSequenceMapping> = {
        // 基础颜色
        black: { linux: '\\033[30m', windows: '\\033[30m', macos: '\\033[30m' },
        red: { linux: '\\033[31m', windows: '\\033[31m', macos: '\\033[31m' },
        green: { linux: '\\033[32m', windows: '\\033[32m', macos: '\\033[32m' },
        yellow: { linux: '\\033[33m', windows: '\\033[33m', macos: '\\033[33m' },
        blue: { linux: '\\033[34m', windows: '\\033[34m', macos: '\\033[34m' },
        magenta: { linux: '\\033[35m', windows: '\\033[35m', macos: '\\033[35m' },
        cyan: { linux: '\\033[36m', windows: '\\033[36m', macos: '\\033[36m' },
        white: { linux: '\\033[37m', windows: '\\033[37m', macos: '\\033[37m' },
        // 明亮颜色
        brightBlack: { linux: '\\033[90m', windows: '\\033[90m', macos: '\\033[90m' },
        brightRed: { linux: '\\033[91m', windows: '\\033[91m', macos: '\\033[91m' },
        brightGreen: { linux: '\\033[92m', windows: '\\033[92m', macos: '\\033[92m' },
        brightYellow: { linux: '\\033[93m', windows: '\\033[93m', macos: '\\033[93m' },
        brightBlue: { linux: '\\033[94m', windows: '\\033[94m', macos: '\\033[94m' },
        brightMagenta: { linux: '\\033[95m', windows: '\\033[95m', macos: '\\033[95m' },
        brightCyan: { linux: '\\033[96m', windows: '\\033[96m', macos: '\\033[96m' },
        brightWhite: { linux: '\\033[97m', windows: '\\033[97m', macos: '\\033[97m' },
        // 重置
        reset: { linux: '\\033[0m', windows: '\\033[0m', macos: '\\033[0m' }
    };

    // 样式代码映射
    private readonly STYLE_CODES: Record<string, EscapeSequenceMapping> = {
        bold: { linux: '\\033[1m', windows: '\\033[1m', macos: '\\033[1m' },
        dim: { linux: '\\033[2m', windows: '\\033[2m', macos: '\\033[2m' },
        italic: { linux: '\\033[3m', windows: '\\033[3m', macos: '\\033[3m' },
        underline: { linux: '\\033[4m', windows: '\\033[4m', macos: '\\033[4m' },
        blink: { linux: '\\033[5m', windows: '\\033[5m', macos: '\\033[5m' },
        reverse: { linux: '\\033[7m', windows: '\\033[7m', macos: '\\033[7m' },
        hidden: { linux: '\\033[8m', windows: '\\033[8m', macos: '\\033[8m' }
    };

    // 光标控制映射
    private readonly CURSOR_CODES: Record<string, EscapeSequenceMapping> = {
        up: { linux: '\\033[A', windows: '\\033[A', macos: '\\033[A' },
        down: { linux: '\\033[B', windows: '\\033[B', macos: '\\033[B' },
        forward: { linux: '\\033[C', windows: '\\033[C', macos: '\\033[C' },
        backward: { linux: '\\033[D', windows: '\\033[D', macos: '\\033[D' },
        nextLine: { linux: '\\033[E', windows: '\\033[E', macos: '\\033[E' },
        previousLine: { linux: '\\033[F', windows: '\\033[F', macos: '\\033[F' },
        horizontalTab: { linux: '\\033[G', windows: '\\033[G', macos: '\\033[G' },
        save: { linux: '\\033[s', windows: '\\033[s', macos: '\\033[s' },
        restore: { linux: '\\033[u', windows: '\\033[u', macos: '\\033[u' },
        hide: { linux: '\\033[?25l', windows: '\\033[?25l', macos: '\\033[?25l' },
        show: { linux: '\\033[?25h', windows: '\\033[?25h', macos: '\\033[?25h' },
        clear: { linux: '\\033[2J', windows: '\\033[2J', macos: '\\033[2J' },
        clearLine: { linux: '\\033[2K', windows: '\\033[2K', macos: '\\033[2K' }
    };

    // 清屏序列映射
    private readonly CLEAR_CODES: Record<string, EscapeSequenceMapping> = {
        screen: { linux: '\\033[2J\\033[H', windows: '\\033[2J\\033[H', macos: '\\033[2J\\033[H' },
        line: { linux: '\\033[2K', windows: '\\033[2K', macos: '\\033[2K' },
        fromCursor: { linux: '\\033[1J', windows: '\\033[1J', macos: '\\033[1J' },
        toCursor: { linux: '\\033[0J', windows: '\\033[0J', macos: '\\033[0J' }
    };

    constructor(
        private logger: LoggerService,
        private platformDetection: PlatformDetectionService
    ) {
        this.platformInfo = {
            os: this.platformDetection.detectOS(),
            terminal: this.platformDetection.detectTerminal()
        };
        this.logger.info('EscapeSequenceService initialized', { platformInfo: this.platformInfo });
    }

    /**
     * 映射颜色代码
     */
    mapColorCode(color: string): string {
        const platformKey = this.getPlatformKey();
        const colorCode = this.COLOR_CODES[color.toLowerCase()];

        if (!colorCode) {
            this.logger.warn('Unknown color code', { color });
            return '';
        }

        return colorCode[platformKey] || colorCode.linux;
    }

    /**
     * 映射光标控制
     */
    mapCursorControl(control: string, value?: number): string {
        const platformKey = this.getPlatformKey();
        let code = '';

        switch (control) {
            case 'up':
            case 'down':
            case 'forward':
            case 'backward':
            case 'nextLine':
            case 'previousLine':
            case 'horizontalTab':
                if (value) {
                    code = `\\033[${value}${control.charAt(0).toUpperCase()}`;
                } else {
                    code = this.CURSOR_CODES[control][platformKey];
                }
                break;

            case 'position':
                if (value) {
                    // value 编码了 x,y 位置
                    const x = value % 256;
                    const y = Math.floor(value / 256);
                    code = `\\033[${y};${x}H`;
                }
                break;

            case 'save':
            case 'restore':
            case 'hide':
            case 'show':
            case 'clear':
            case 'clearLine':
                code = this.CURSOR_CODES[control][platformKey];
                break;

            default:
                this.logger.warn('Unknown cursor control', { control });
        }

        return code;
    }

    /**
     * 映射清屏序列
     */
    mapClearSequence(options: ClearOptions): string {
        const platformKey = this.getPlatformKey();
        const sequences: string[] = [];

        if (options.screen) {
            sequences.push(this.CLEAR_CODES.screen[platformKey]);
        } else if (options.line) {
            sequences.push(this.CLEAR_CODES.line[platformKey]);
        } else if (options.fromCursor) {
            sequences.push(this.CLEAR_CODES.fromCursor[platformKey]);
        } else if (options.toCursor) {
            sequences.push(this.CLEAR_CODES.toCursor[platformKey]);
        }

        return sequences.join('');
    }

    /**
     * 映射样式代码
     */
    mapStyleCode(style: string): string {
        const platformKey = this.getPlatformKey();
        const styleCode = this.STYLE_CODES[style.toLowerCase()];

        if (!styleCode) {
            this.logger.warn('Unknown style code', { style });
            return '';
        }

        return styleCode[platformKey] || styleCode.linux;
    }

    /**
     * 生成颜色文本
     */
    colorize(text: string, color: ColorCode): string {
        const platformKey = this.getPlatformKey();
        let result = '';

        // 设置前景色
        if (color.foreground) {
            const colorCode = this.COLOR_CODES[color.foreground.toLowerCase()];
            if (colorCode) {
                result += colorCode[platformKey];
            }
        }

        // 设置背景色
        if (color.background) {
            const bgColor = 'bg' + color.background.charAt(0).toUpperCase() + color.background.slice(1);
            const bgCode = this.COLOR_CODES[bgColor.toLowerCase()];
            if (bgCode) {
                result += bgCode[platformKey];
            }
        }

        // 添加文本
        result += text;

        // 重置
        result += this.COLOR_CODES.reset[platformKey];

        return result;
    }

    /**
     * 生成样式文本
     */
    stylize(text: string, styles: string[]): string {
        const platformKey = this.getPlatformKey();
        let result = '';

        // 应用样式
        styles.forEach(style => {
            const styleCode = this.STYLE_CODES[style.toLowerCase()];
            if (styleCode) {
                result += styleCode[platformKey];
            }
        });

        // 添加文本
        result += text;

        // 重置
        result += this.COLOR_CODES.reset[platformKey];

        return result;
    }

    /**
     * 移动光标
     */
    moveCursor(control: CursorControl): string {
        const platformKey = this.getPlatformKey();
        let sequence = '';

        if (control.save) {
            sequence += this.CURSOR_CODES.save[platformKey];
        }

        if (control.position) {
            sequence += `\\033[${control.position.y};${control.position.x}H`;
        }

        if (control.up) {
            sequence += `\\033[${control.up}A`;
        }

        if (control.down) {
            sequence += `\\033[${control.down}B`;
        }

        if (control.forward) {
            sequence += `\\033[${control.forward}C`;
        }

        if (control.backward) {
            sequence += `\\033[${control.backward}D`;
        }

        if (control.restore) {
            sequence += this.CURSOR_CODES.restore[platformKey];
        }

        if (control.visible === false) {
            sequence += this.CURSOR_CODES.hide[platformKey];
        } else if (control.visible === true) {
            sequence += this.CURSOR_CODES.show[platformKey];
        }

        return sequence;
    }

    /**
     * 清屏
     */
    clear(options: ClearOptions = { screen: true }): string {
        return this.mapClearSequence(options);
    }

    /**
     * 移除ANSI转义序列
     */
    stripAnsi(text: string): string {
        // 匹配ANSI转义序列的正则表达式
        const ansiEscapeSequence = /\\x1b\[[0-9;]*[mGKHF]?/g;
        return text.replace(ansiEscapeSequence, '');
    }

    /**
     * 检测终端能力
     */
    checkTerminalCapabilities(): {
        supportsColors: boolean;
        supportsTrueColor: boolean;
        supportsMouse: boolean;
        supportsUnicode: boolean;
        colorLevel: number;
    } {
        const capabilities = this.platformDetection.checkCapabilities();

        return {
            supportsColors: capabilities.colors >= 8,
            supportsTrueColor: capabilities.trueColor,
            supportsMouse: capabilities.mouse,
            supportsUnicode: capabilities.unicode,
            colorLevel: capabilities.colors
        };
    }

    /**
     * 适配输出
     */
    adaptOutput(output: string, targetPlatform?: OSType): string {
        const platform = targetPlatform || this.platformInfo?.os || OSType.LINUX;

        // 如果是Windows CMD，可能不支持某些转义序列
        if (platform === OSType.WINDOWS) {
            // 移除不支持的序列或替换为兼容序列
            output = this.adaptForWindows(output);
        }

        return output;
    }

    /**
     * 创建进度条
     */
    createProgressBar(
        current: number,
        total: number,
        width: number = 50,
        color: string = 'green'
    ): string {
        const percentage = Math.floor((current / total) * 100);
        const filledWidth = Math.floor((current / total) * width);
        const emptyWidth = width - filledWidth;

        const fillChar = '█';
        const emptyChar = '░';

        const progressBar = `${this.colorize(fillChar.repeat(filledWidth), { foreground: color })}${emptyChar.repeat(emptyWidth)}`;
        const text = `${current}/${total} (${percentage}%)`;

        return `${progressBar} ${text}`;
    }

    /**
     * 创建表格
     */
    createTable(headers: string[], rows: string[][], options?: {
        colorizeHeaders?: boolean;
        borderColor?: string;
    }): string {
        const borderColor = options?.borderColor || 'blue';
        const headerColor = options?.colorizeHeaders ? { foreground: borderColor } : undefined;

        // 计算列宽
        const columnWidths = headers.map((header, index) => {
            const maxContentWidth = Math.max(
                header.length,
                ...rows.map(row => (row[index] || '').length)
            );
            return Math.min(maxContentWidth, 50); // 最大宽度限制
        });

        // 创建边框
        const border = '+' + columnWidths.map(width => '-'.repeat(width + 2)).join('+') + '+';

        // 创建表格
        let table = border + '\n';

        // 表头
        const headerRow = '|' + headers.map((header, index) => {
            const padded = header.padEnd(columnWidths[index]);
            return ' ' + (headerColor ? this.colorize(padded, headerColor) : padded) + ' ';
        }).join('|') + '|';
        table += headerRow + '\n';
        table += border + '\n';

        // 数据行
        rows.forEach(row => {
            const dataRow = '|' + row.map((cell, index) => {
                const padded = (cell || '').padEnd(columnWidths[index]);
                return ' ' + padded + ' ';
            }).join('|') + '|';
            table += dataRow + '\n';
        });

        table += border;

        return table;
    }

    // ==================== 私有方法 ====================

    private getPlatformKey(): 'linux' | 'windows' | 'macos' {
        if (!this.platformInfo) {
            this.platformInfo = {
                os: this.platformDetection.detectOS(),
                terminal: this.platformDetection.detectTerminal()
            };
        }

        switch (this.platformInfo.os) {
            case OSType.WINDOWS:
                return 'windows';
            case OSType.MACOS:
                return 'macos';
            case OSType.LINUX:
            default:
                return 'linux';
        }
    }

    private adaptForWindows(output: string): string {
        // Windows CMD 对ANSI支持有限
        // 移除或替换不支持的序列

        // 移除TrueColor序列（如果不支持）
        if (!this.checkTerminalCapabilities().supportsTrueColor) {
            output = output.replace(/\\033\[38;2;\d+;\d+;\d+m/g, '');
            output = output.replace(/\\033\[48;2;\d+;\d+;\d+m/g, '');
        }

        // 移除256色序列（如果不支持）
        if (this.checkTerminalCapabilities().colorLevel < 256) {
            output = output.replace(/\\033\[38;5;\d+m/g, '');
            output = output.replace(/\\033\[48;5;\d+m/g, '');
        }

        return output;
    }
}
