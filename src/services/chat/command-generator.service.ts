import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CommandRequest, CommandResponse, ChatRequest, ChatMessage, MessageRole } from '../../types/ai.types';
import { TerminalContext, TerminalError } from '../../types/terminal.types';
import { AiAssistantService } from '../core/ai-assistant.service';
import { TerminalContextService } from '../terminal/terminal-context.service';
import { SecurityValidatorService } from '../security/security-validator.service';
import { LoggerService } from '../core/logger.service';

@Injectable({ providedIn: 'root' })
export class CommandGeneratorService {
    constructor(
        private aiService: AiAssistantService,
        private terminalContext: TerminalContextService,
        private securityValidator: SecurityValidatorService,
        private logger: LoggerService
    ) {}

    /**
     * 生成命令（基于终端上下文）
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        this.logger.info('Generating command', { request });

        try {
            // 获取终端上下文
            const context = this.terminalContext.getCurrentContext();
            const error = this.terminalContext.getLastError();

            // 构建增强的提示词
            const enhancedPrompt = this.buildEnhancedPrompt(request, context, error);

            // 构建聊天请求
            const chatRequest: ChatRequest = {
                messages: [
                    {
                        id: this.generateId(),
                        role: MessageRole.SYSTEM,
                        content: this.getSystemPrompt(),
                        timestamp: new Date()
                    },
                    {
                        id: this.generateId(),
                        role: MessageRole.USER,
                        content: enhancedPrompt,
                        timestamp: new Date()
                    }
                ],
                maxTokens: 500,
                temperature: 0.3 // 使用较低温度确保命令的准确性
            };

            // 调用AI提供商
            const response = await this.aiService.chat(chatRequest);

            // 解析AI响应
            const commandResponse = this.parseAiResponse(response.message.content);

            // 安全验证
            const validation = await this.securityValidator.validateAndConfirm(
                commandResponse.command,
                commandResponse.explanation,
                context
            );

            if (!validation.approved) {
                throw new Error(`Command blocked by security validator: ${validation.reason}`);
            }

            this.logger.info('Command generated successfully', { commandResponse });
            return commandResponse;

        } catch (error) {
            this.logger.error('Failed to generate command', error);
            throw error;
        }
    }

    /**
     * 从选择文本生成命令
     */
    async generateFromSelection(selection: string): Promise<CommandResponse> {
        const request: CommandRequest = {
            naturalLanguage: selection,
            context: this.buildTerminalContext()
        };

        return this.generateCommand(request);
    }

    /**
     * 从错误生成修复命令
     */
    async generateFixForError(error: TerminalError): Promise<CommandResponse> {
        const context = this.terminalContext.getCurrentContext();

        const request: CommandRequest = {
            naturalLanguage: `修复错误：${error.message}`,
            context: {
                currentDirectory: context?.session.cwd,
                operatingSystem: context?.systemInfo.platform,
                shell: context?.session.shell,
                environment: context?.session.environment
            },
            constraints: {
                forbiddenCommands: ['rm -rf /', 'sudo rm -rf /', 'format']
            }
        };

        return this.generateCommand(request);
    }

    /**
     * 生成智能建议
     */
    async generateSuggestions(input: string): Promise<string[]> {
        const context = this.terminalContext.getCurrentContext();

        const prompt = `
基于当前终端状态，为输入"${input}"生成3-5个可能的命令建议。

当前上下文：
- 目录：${context?.session.cwd}
- Shell：${context?.session.shell}
- 系统：${context?.systemInfo.platform}
- 最近命令：${context?.recentCommands.slice(0, 5).join(', ')}

请直接返回命令列表，每行一个，不要解释。
        `;

        try {
            const response = await this.aiService.chat({
                messages: [
                    {
                        id: this.generateId(),
                        role: MessageRole.USER,
                        content: prompt,
                        timestamp: new Date()
                    }
                ],
                maxTokens: 200,
                temperature: 0.5
            });

            const suggestions = response.message.content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .slice(0, 5);

            return suggestions;

        } catch (error) {
            this.logger.error('Failed to generate suggestions', error);
            return [];
        }
    }

    /**
     * 构建增强提示词
     */
    private buildEnhancedPrompt(
        request: CommandRequest,
        context: TerminalContext | null,
        error: TerminalError | null
    ): string {
        let prompt = `请将以下自然语言描述转换为准确的命令：\n\n"${request.naturalLanguage}"\n\n`;

        // 添加终端上下文
        if (context) {
            prompt += `\n当前终端状态：\n`;
            prompt += `- 当前目录：${context.session.cwd}\n`;
            prompt += `- Shell类型：${context.session.shell}\n`;
            prompt += `- 操作系统：${context.systemInfo.platform}\n`;
            prompt += `- 用户：${context.session.user}\n`;

            if (context.recentCommands.length > 0) {
                prompt += `- 最近执行的命令：${context.recentCommands.slice(0, 3).join(', ')}\n`;
            }

            if (context.projectInfo) {
                prompt += `- 检测到项目类型：${context.projectInfo.type}\n`;
                prompt += `- 项目根目录：${context.projectInfo.root}\n`;
            }
        }

        // 添加错误信息（如果有）
        if (error) {
            prompt += `\n当前错误信息：\n`;
            prompt += `- 错误类型：${error.type}\n`;
            prompt += `- 错误消息：${error.message}\n`;
            prompt += `- 失败命令：${error.command}\n`;
            prompt += `- 退出码：${error.exitCode}\n`;
        }

        // 添加环境变量
        if (context?.session.environment) {
            const importantEnvVars = ['PATH', 'HOME', 'USER', 'PWD', 'SHELL'];
            const envInfo = importantEnvVars
                .filter(key => context.session.environment[key])
                .map(key => `${key}=${context.session.environment[key]}`)
                .join(', ');

            if (envInfo) {
                prompt += `\n重要环境变量：${envInfo}\n`;
            }
        }

        // 添加约束
        if (request.constraints) {
            prompt += `\n约束条件：\n`;
            if (request.constraints.maxLength) {
                prompt += `- 命令最大长度：${request.constraints.maxLength}字符\n`;
            }
            if (request.constraints.allowedCommands?.length) {
                prompt += `- 允许使用的命令：${request.constraints.allowedCommands.join(', ')}\n`;
            }
            if (request.constraints.forbiddenCommands?.length) {
                prompt += `- 禁止使用的命令：${request.constraints.forbiddenCommands.join(', ')}\n`;
            }
        }

        prompt += `\n请按照以下JSON格式返回：\n`;
        prompt += `{\n`;
        prompt += `  "command": "具体的命令",\n`;
        prompt += `  "explanation": "命令的解释说明",\n`;
        prompt += `  "confidence": 0.95\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 获取系统提示词
     */
    private getSystemPrompt(): string {
        return `你是一个专业的终端命令生成助手。你的任务是：

1. 将自然语言描述转换为准确、高效的终端命令
2. 考虑当前操作系统和Shell环境
3. 优先使用安全、最佳实践的命令
4. 提供清晰的命令解释
5. 考虑当前工作目录和上下文环境

请始终返回有效的命令，避免危险操作（如删除系统文件、格式化磁盘等）。
如果无法确定准确的命令，请明确说明并提供替代方案。`;
    }

    /**
     * 解析AI响应
     */
    private parseAiResponse(content: string): CommandResponse {
        try {
            // 尝试解析JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    command: parsed.command || '',
                    explanation: parsed.explanation || '',
                    confidence: parsed.confidence || 0.5,
                    alternatives: parsed.alternatives || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse JSON response, fallback to text parsing', error);
        }

        // 备用解析：提取命令和解释
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        const command = lines[0] || '';
        const explanation = lines.slice(1).join(' ') || 'AI生成的命令建议';

        return {
            command,
            explanation,
            confidence: 0.5
        };
    }

    /**
     * 构建终端上下文
     */
    private buildTerminalContext(): CommandRequest['context'] {
        const context = this.terminalContext.getCurrentContext();
        return {
            currentDirectory: context?.session.cwd,
            operatingSystem: context?.systemInfo.platform,
            shell: context?.session.shell,
            environment: context?.session.environment
        };
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
