import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CommandResponse, CommandRequest } from '../../types/ai.types';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { TerminalContextService } from '../../services/terminal/terminal-context.service';
import { LoggerService } from '../../services/core/logger.service';

@Component({
    selector: 'app-command-suggestion',
    templateUrl: './command-suggestion.component.html',
    styleUrls: ['./command-suggestion.component.scss']
})
export class CommandSuggestionComponent implements OnInit, OnDestroy {
    @Input() inputText = '';
    @Output() suggestionSelected = new EventEmitter<CommandResponse>();
    @Output() closed = new EventEmitter<void>();

    suggestions: CommandResponse[] = [];
    isLoading = false;
    private inputSubject = new Subject<string>();
    private destroy$ = new Subject<void>();

    constructor(
        private aiService: AiAssistantService,
        private terminalContext: TerminalContextService,
        private logger: LoggerService
    ) {}

    ngOnInit(): void {
        this.inputSubject.pipe(
            debounceTime(300),
            takeUntil(this.destroy$)
        ).subscribe(text => {
            this.generateSuggestions(text);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onInputChange(text: string): void {
        this.inputSubject.next(text);
    }

    private async generateSuggestions(text: string): Promise<void> {
        // 如果输入太短，不生成建议
        if (text.length < 2) {
            this.suggestions = [];
            return;
        }

        this.isLoading = true;

        try {
            // 1. 获取基于上下文的智能建议
            const suggestedCommands = await this.aiService.getSuggestedCommands(text);

            // 2. 如果有AI建议，转换为CommandResponse格式
            const aiSuggestions: CommandResponse[] = [];

            // 添加前5个最相关的建议
            for (const cmd of suggestedCommands.slice(0, 5)) {
                // 如果命令模板中包含占位符，用当前输入填充
                const filledCmd = cmd.replace('""', text).replace('${input}', text);

                aiSuggestions.push({
                    command: filledCmd,
                    explanation: this.getExplanationForCommand(filledCmd),
                    confidence: this.calculateConfidence(filledCmd, text)
                });
            }

            // 3. 如果输入看起来像自然语言，调用AI生成命令
            if (this.looksLikeNaturalLanguage(text)) {
                const aiCommand = await this.generateAICommand(text);
                if (aiCommand && !aiSuggestions.find(s => s.command === aiCommand.command)) {
                    aiSuggestions.unshift(aiCommand);
                }
            }

            this.suggestions = aiSuggestions.slice(0, 6);

        } catch (error) {
            this.logger.error('Failed to generate suggestions', error);
            this.suggestions = [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 检查输入是否像自然语言
     */
    private looksLikeNaturalLanguage(text: string): boolean {
        const naturalLanguagePatterns = [
            /^[a-zA-Z]+/,
            /^(帮我|请|我想|需要|要)/,
            /how to|what is|what's/
        ];

        return naturalLanguagePatterns.some(pattern => pattern.test(text.toLowerCase()));
    }

    /**
     * 调用AI生成命令
     */
    private async generateAICommand(naturalLanguage: string): Promise<CommandResponse | null> {
        try {
            const context = this.terminalContext.getCurrentContext();

            const request: CommandRequest = {
                naturalLanguage,
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform,
                    shell: context?.session.shell,
                    environment: context?.session.environment
                }
            };

            const response = await this.aiService.generateCommand(request);
            return response;

        } catch (error) {
            this.logger.warn('AI command generation failed', error);
            return null;
        }
    }

    /**
     * 为命令生成解释
     */
    private getExplanationForCommand(command: string): string {
        const explanations: { [key: string]: string } = {
            'git status': '查看当前Git仓库状态',
            'git pull': '拉取远程最新代码',
            'git add .': '添加所有文件到暂存区',
            'git commit -m ""': '提交暂存区文件',
            'git checkout -b ': '创建并切换到新分支',
            'git log --oneline': '查看简化的提交历史',
            'npm install': '安装项目依赖',
            'npm run dev': '启动开发服务器',
            'npm run build': '构建生产版本',
            'npm test': '运行测试',
            'docker build -t .': '构建Docker镜像',
            'docker-compose up': '启动Docker容器',
            'docker ps': '查看运行中的容器',
            'kubectl get pods': '查看Kubernetes Pods',
            'ls -la': '列出所有文件详细信息',
            'grep -r "" .': '递归搜索文件内容'
        };

        return explanations[command] || '执行命令';
    }

    /**
     * 计算命令匹配度
     */
    private calculateConfidence(command: string, input: string): number {
        const lowerInput = input.toLowerCase();
        const lowerCmd = command.toLowerCase();

        // 完全匹配开头
        if (lowerCmd.startsWith(lowerInput)) {
            return 0.95;
        }

        // 包含输入关键词
        if (lowerCmd.includes(lowerInput)) {
            return 0.8;
        }

        // 相同的命令前缀
        const inputParts = lowerInput.split(' ');
        const cmdParts = lowerCmd.split(' ');
        if (inputParts[0] === cmdParts[0]) {
            return 0.7;
        }

        return 0.5;
    }

    selectSuggestion(suggestion: CommandResponse): void {
        this.suggestionSelected.emit(suggestion);
        this.close();
    }

    close(): void {
        this.closed.emit();
        this.suggestions = [];
    }
}
