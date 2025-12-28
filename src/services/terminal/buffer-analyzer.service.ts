import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';

/**
 * 缓冲区分析结果
 */
export interface BufferAnalysis {
    totalLines: number;
    totalCharacters: number;
    commandCount: number;
    errorCount: number;
    warningCount: number;
    filePaths: string[];
    urls: string[];
    commands: string[];
    errors: string[];
    warnings: string[];
    outputType: 'command' | 'error' | 'success' | 'mixed';
    complexity: 'low' | 'medium' | 'high';
    language?: string;
}

/**
 * 命令提取结果
 */
export interface CommandExtraction {
    commands: Array<{
        command: string;
        fullCommand: string;
        arguments: string[];
        lineNumber: number;
        timestamp?: number;
        success?: boolean;
        output?: string;
    }>;
    lastCommand?: string;
    commandHistory: string[];
}

/**
 * 输出解析结果
 */
export interface OutputParsing {
    structuredData: any[];
    keyValuePairs: Record<string, string>;
    tables: Array<{
        headers: string[];
        rows: string[][];
    }>;
    lists: string[];
    codeBlocks: Array<{
        language?: string;
        code: string;
    }>;
}

/**
 * 错误检测结果
 */
export interface ErrorDetection {
    errors: Array<{
        type: 'syntax' | 'runtime' | 'permission' | 'network' | 'unknown';
        message: string;
        lineNumber?: number;
        severity: 'low' | 'medium' | 'high' | 'critical';
        suggestion?: string;
        stackTrace?: string[];
    }>;
    warnings: Array<{
        message: string;
        lineNumber?: number;
        severity: 'low' | 'medium' | 'high';
        suggestion?: string;
    }>;
    overallStatus: 'success' | 'warning' | 'error' | 'unknown';
    errorCount: number;
    warningCount: number;
}

/**
 * 缓冲区分析器
 * 分析终端缓冲区内容，提取命令、错误、文件路径等信息
 */
@Injectable({
    providedIn: 'root'
})
export class BufferAnalyzerService {
    private readonly COMMON_FILE_EXTENSIONS = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
        '.html', '.css', '.scss', '.less', '.vue', '.svelte',
        '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg',
        '.md', '.txt', '.log', '.sql', '.sh', '.bat', '.ps1',
        '.jpg', '.jpeg', '.png', '.gif', '.svg', '.pdf', '.zip', '.tar', '.gz'
    ];

    private readonly COMMON_COMMANDS = [
        'ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find',
        'git', 'npm', 'yarn', 'node', 'python', 'pip', 'docker', 'kubectl',
        'ssh', 'curl', 'wget', 'tar', 'zip', 'unzip', 'chmod', 'chown',
        'ps', 'top', 'kill', 'sudo', 'apt', 'yum', 'brew', 'systemctl'
    ];

    private readonly ERROR_PATTERNS = [
        /error[:\s]/i,
        /failed[:\s]/i,
        /exception[:\s]/i,
        /traceback/i,
        /undefined/i,
        /cannot\s+/i,
        /unable\s+to/i,
        /permission denied/i,
        /no such file/i,
        /command not found/i,
        /syntax error/i,
        /type error/i,
        /reference error/i
    ];

    private readonly WARNING_PATTERNS = [
        /warning[:\s]/i,
        /deprecated/i,
        /obsolete/i,
        /consider/i,
        /suggest/i,
        /note[:\s]/i
    ];

    constructor(private logger: LoggerService) {
        this.logger.info('BufferAnalyzerService initialized');
    }

    /**
     * 分析缓冲区内容
     */
    analyzeBuffer(buffer: string): BufferAnalysis {
        const lines = buffer.split(/\r?\n/).filter(line => line.trim().length > 0);
        const totalLines = lines.length;
        const totalCharacters = buffer.length;

        // 提取各种信息
        const filePaths = this.extractFilePaths(buffer);
        const urls = this.extractUrls(buffer);
        const commands = this.extractCommands(lines);
        const errors = this.detectErrors(lines).errors.map(e => e.message);
        const warnings = this.detectErrors(lines).warnings.map(w => w.message);

        // 确定输出类型
        let outputType: BufferAnalysis['outputType'] = 'mixed';
        if (errors.length > 0 && commands.length === 0) {
            outputType = 'error';
        } else if (commands.length > 0 && errors.length === 0) {
            outputType = 'success';
        } else if (commands.length > 0) {
            outputType = 'command';
        }

        // 计算复杂度
        const complexity = this.calculateComplexity(buffer, lines);

        // 检测语言
        const language = this.detectLanguage(buffer);

        const analysis: BufferAnalysis = {
            totalLines,
            totalCharacters,
            commandCount: commands.length,
            errorCount: errors.length,
            warningCount: warnings.length,
            filePaths,
            urls,
            commands,
            errors,
            warnings,
            outputType,
            complexity,
            language
        };

        this.logger.debug('Buffer analyzed', {
            totalLines,
            commandCount: commands.length,
            errorCount: errors.length
        });

        return analysis;
    }

    /**
     * 提取命令
     */
    extractCommand(buffer: string): CommandExtraction {
        const lines = buffer.split(/\r?\n/);
        const commands: CommandExtraction['commands'] = [];
        const commandHistory: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 跳过空行
            if (!line) continue;

            // 检测命令提示符（$ # > 等）
            const promptMatch = line.match(/^[\$#>\$]\s+(.+)/);
            if (promptMatch) {
                const fullCommand = promptMatch[1].trim();
                const commandParts = this.parseCommand(fullCommand);

                commands.push({
                    command: commandParts.command,
                    fullCommand,
                    arguments: commandParts.arguments,
                    lineNumber: i + 1,
                    timestamp: Date.now() // 简化实现
                });

                commandHistory.push(fullCommand);
            }
            // 检测常见的命令开头
            else if (this.COMMON_COMMANDS.some(cmd => line.startsWith(cmd + ' '))) {
                const commandParts = this.parseCommand(line);
                commands.push({
                    command: commandParts.command,
                    fullCommand: line,
                    arguments: commandParts.arguments,
                    lineNumber: i + 1
                });

                commandHistory.push(line);
            }
        }

        return {
            commands,
            lastCommand: commandHistory[commandHistory.length - 1],
            commandHistory
        };
    }

    /**
     * 解析输出
     */
    parseOutput(buffer: string): OutputParsing {
        const structuredData: any[] = [];
        const keyValuePairs: Record<string, string> = {};
        const tables: OutputParsing['tables'] = [];
        const lists: string[] = [];
        const codeBlocks: OutputParsing['codeBlocks'] = [];

        const lines = buffer.split(/\r?\n/);

        // 检测键值对
        const kvPattern = /^(\w+)\s*[:=]\s*(.+)$/;
        lines.forEach(line => {
            const match = line.match(kvPattern);
            if (match) {
                keyValuePairs[match[1]] = match[2].trim();
            }
        });

        // 检测表格（简单的空格分隔表格）
        const tablePattern = /^\s*\S+\s+\S+(?:\s+\S+)*\s*$/;
        const potentialTableLines = lines.filter(line => tablePattern.test(line));
        if (potentialTableLines.length > 1) {
            const tableData = potentialTableLines.map(line => line.trim().split(/\s+/));
            const headers = tableData[0];
            const rows = tableData.slice(1);
            tables.push({ headers, rows });
        }

        // 检测列表
        const listPattern = /^\s*[-*+]\s+(.+)$/;
        lines.forEach(line => {
            const match = line.match(listPattern);
            if (match) {
                lists.push(match[1]);
            }
        });

        // 检测代码块（简单实现）
        const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/;
        const codeMatches = buffer.matchAll(codeBlockPattern);
        for (const match of codeMatches) {
            codeBlocks.push({
                language: match[1],
                code: match[2].trim()
            });
        }

        return {
            structuredData,
            keyValuePairs,
            tables,
            lists,
            codeBlocks
        };
    }

    /**
     * 检测错误
     */
    detectErrors(buffer: string | string[]): ErrorDetection {
        const lines = Array.isArray(buffer) ? buffer : buffer.split(/\r?\n/);
        const errors: ErrorDetection['errors'] = [];
        const warnings: ErrorDetection['warnings'] = [];

        lines.forEach((line, index) => {
            const lineNumber = index + 1;

            // 检测错误
            this.ERROR_PATTERNS.forEach(pattern => {
                if (pattern.test(line)) {
                    const errorType = this.classifyError(line);
                    errors.push({
                        type: errorType,
                        message: line.trim(),
                        lineNumber,
                        severity: this.determineSeverity(line, 'error'),
                        suggestion: this.generateErrorSuggestion(line, errorType)
                    });
                }
            });

            // 检测警告
            this.WARNING_PATTERNS.forEach(pattern => {
                if (pattern.test(line)) {
                    const severity = this.determineSeverity(line, 'warning');
                    warnings.push({
                        message: line.trim(),
                        lineNumber,
                        severity: severity === 'critical' ? 'high' : severity as 'low' | 'medium' | 'high',
                        suggestion: this.generateWarningSuggestion(line)
                    });
                }
            });
        });

        let overallStatus: ErrorDetection['overallStatus'] = 'success';
        if (errors.length > 0) {
            overallStatus = errors.some(e => e.severity === 'critical') ? 'error' : 'warning';
        } else if (warnings.length > 0) {
            overallStatus = 'warning';
        }

        return {
            errors,
            warnings,
            overallStatus,
            errorCount: errors.length,
            warningCount: warnings.length
        };
    }

    /**
     * 提取文件路径
     */
    extractFilePaths(buffer: string): string[] {
        const filePaths = new Set<string>();

        // 匹配绝对路径
        const absolutePathPattern = /(\/[^\s:]+(?:\/[^\s:]+)*)/g;
        let match;
        while ((match = absolutePathPattern.exec(buffer)) !== null) {
            const path = match[1];
            if (this.isValidFilePath(path)) {
                filePaths.add(path);
            }
        }

        // 匹配相对路径
        const relativePathPattern = /([.\/][^\s:]+(?:\/[^\s:]+)*)/g;
        while ((match = relativePathPattern.exec(buffer)) !== null) {
            const path = match[1];
            if (this.isValidFilePath(path) && !path.startsWith('./')) {
                filePaths.add(path);
            }
        }

        return Array.from(filePaths);
    }

    /**
     * 提取URL
     */
    extractUrls(buffer: string): string[] {
        const urlPattern = /https?:\/\/[^\s]+/g;
        const urls = buffer.match(urlPattern) || [];
        return [...new Set(urls)];
    }

    /**
     * 分析命令执行结果
     */
    analyzeCommandResult(command: string, output: string): {
        success: boolean;
        error?: string;
        result?: any;
        suggestions?: string[];
    } {
        const hasError = this.ERROR_PATTERNS.some(pattern => pattern.test(output));
        const hasWarning = this.WARNING_PATTERNS.some(pattern => pattern.test(output));

        const result: any = {
            success: !hasError
        };

        if (hasError) {
            const errors = this.detectErrors(output).errors;
            result.error = errors[0]?.message || 'Command failed';
            result.suggestions = this.generateCommandSuggestions(command, output);
        } else {
            // 尝试解析输出为结构化数据
            const parsed = this.parseOutput(output);
            if (Object.keys(parsed.keyValuePairs).length > 0) {
                result.result = parsed.keyValuePairs;
            } else if (parsed.tables.length > 0) {
                result.result = parsed.tables;
            } else {
                result.result = output;
            }
        }

        if (hasWarning && !hasError) {
            result.suggestions = result.suggestions || [];
            result.suggestions.push('命令执行成功，但有警告信息');
        }

        return result;
    }

    // ==================== 私有方法 ====================

    private parseCommand(command: string): { command: string; arguments: string[] } {
        // 简单的命令解析（不处理复杂的引号转义）
        const parts = command.trim().split(/\s+/);
        return {
            command: parts[0],
            arguments: parts.slice(1)
        };
    }

    private extractCommands(lines: string[]): string[] {
        const commands: string[] = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (this.COMMON_COMMANDS.some(cmd => trimmed.startsWith(cmd + ' '))) {
                commands.push(trimmed);
            }
        });

        return [...new Set(commands)];
    }

    private calculateComplexity(buffer: string, lines: string[]): 'low' | 'medium' | 'high' {
        let score = 0;

        // 基于行数
        score += lines.length * 0.1;

        // 基于字符数
        score += buffer.length * 0.001;

        // 基于文件路径数量
        score += this.extractFilePaths(buffer).length * 0.5;

        // 基于命令数量
        score += this.extractCommands(lines).length * 0.3;

        // 基于错误和警告
        score += this.detectErrors(lines).errorCount * 0.5;
        score += this.detectErrors(lines).warningCount * 0.2;

        if (score > 50) {
            return 'high';
        } else if (score > 20) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    private detectLanguage(buffer: string): string | undefined {
        // 简单的语言检测
        const patterns: Record<string, RegExp[]> = {
            javascript: [/\b(function|const|let|var|=>|import|from)\b/],
            typescript: [/\b(interface|type|:)\b/],
            python: [/\b(def|import|class|if __name__)\b/],
            java: [/\b(public|private|class|interface|import)\b/],
            cpp: [/\b(#include|using namespace|std::)\b/],
            html: [/<!DOCTYPE|<html|<head|<body/],
            css: [/\{\s*[\w-]+:\s*[^;]+;/],
            json: [/^\s*\{[\s\S]*\}\s*$/],
            yaml: [/^\s*[\w-]+\s*:\s*.+/m],
            markdown: [/^#+\s+|```|\*\*[^*]+\*\*/]
        };

        for (const [language, langPatterns] of Object.entries(patterns)) {
            if (langPatterns.some(pattern => pattern.test(buffer))) {
                return language;
            }
        }

        return undefined;
    }

    private classifyError(line: string): ErrorDetection['errors'][0]['type'] {
        const lowerLine = line.toLowerCase();

        if (lowerLine.includes('syntax')) return 'syntax';
        if (lowerLine.includes('permission')) return 'permission';
        if (lowerLine.includes('network') || lowerLine.includes('connection')) return 'network';
        if (lowerLine.includes('exception') || lowerLine.includes('traceback')) return 'runtime';

        return 'unknown';
    }

    private determineSeverity(line: string, type: 'error' | 'warning'): 'low' | 'medium' | 'high' | 'critical' {
        const lowerLine = line.toLowerCase();

        if (type === 'error') {
            if (lowerLine.includes('critical') || lowerLine.includes('fatal')) {
                return 'critical';
            }
            if (lowerLine.includes('severe') || lowerLine.includes('failed')) {
                return 'high';
            }
            return 'medium';
        } else {
            if (lowerLine.includes('deprecated')) {
                return 'high';
            }
            if (lowerLine.includes('warning')) {
                return 'medium';
            }
            return 'low';
        }
    }

    private generateErrorSuggestion(line: string, type: ErrorDetection['errors'][0]['type']): string | undefined {
        switch (type) {
            case 'syntax':
                return '检查语法错误，确保所有括号、引号和分号正确匹配';
            case 'permission':
                return '使用 sudo 或检查文件/目录权限';
            case 'network':
                return '检查网络连接和URL是否正确';
            case 'runtime':
                return '检查变量定义和函数调用';
            default:
                return '查看完整错误信息以获取更多详情';
        }
    }

    private generateWarningSuggestion(line: string): string | undefined {
        if (line.toLowerCase().includes('deprecated')) {
            return '建议更新到最新的API或方法';
        }
        return '查看警告信息以了解潜在问题';
    }

    private generateCommandSuggestions(command: string, output: string): string[] {
        const suggestions: string[] = [];

        // 基于错误类型生成建议
        if (output.includes('command not found')) {
            suggestions.push('检查命令拼写是否正确');
            suggestions.push('确认命令已安装并位于PATH中');
        }

        if (output.includes('permission denied')) {
            suggestions.push('使用 sudo 提升权限');
            suggestions.push('检查文件或目录的所有权和权限');
        }

        if (output.includes('no such file')) {
            suggestions.push('检查文件或目录路径是否正确');
            suggestions.push('确认文件或目录是否存在');
        }

        return suggestions;
    }

    private isValidFilePath(path: string): boolean {
        // 检查是否包含文件扩展名
        const hasExtension = this.COMMON_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
        if (hasExtension) return true;

        // 检查是否包含路径分隔符
        if (path.includes('/') || path.includes('\\')) return true;

        return false;
    }
}
