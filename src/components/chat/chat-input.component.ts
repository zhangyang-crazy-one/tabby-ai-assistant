import { Component, Output, EventEmitter, Input, ViewChild, ElementRef, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';

@Component({
    selector: 'app-chat-input',
    templateUrl: './chat-input.component.html',
    styleUrls: ['./chat-input.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatInputComponent implements OnInit, OnDestroy {
    @Input() disabled = false;
    @Input() placeholder = '输入您的问题或描述要执行的命令...';
    @Output() send = new EventEmitter<string>();

    @ViewChild('textInput', { static: false }) textInput!: ElementRef<HTMLTextAreaElement>;

    inputValue = '';
    private inputSubject = new Subject<string>();
    private destroy$ = new Subject<void>();
    isComposing = false; // 用于处理中文输入法
    enterToSend: boolean = true; // Enter键发送

    constructor(private config: ConfigProviderService) {}

    ngOnInit(): void {
        // 读取 Enter 发送设置
        this.enterToSend = this.config.get<boolean>('ui.enterToSend', true) ?? true;

        // 监听输入变化，实现防抖
        this.inputSubject.pipe(
            debounceTime(300),
            takeUntil(this.destroy$)
        ).subscribe(value => {
            // 这里可以触发自动完成或其他功能
            this.onInputChange(value);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 处理输入变化
     */
    onInputChange(value: string): void {
        // TODO: 实现智能建议功能
        // 可以基于输入内容提供命令建议
    }

    /**
     * 处理键盘事件
     */
    onKeydown(event: KeyboardEvent): void {
        // Enter 发送（根据配置决定）
        if (event.key === 'Enter' && !event.shiftKey && !this.isComposing) {
            if (this.enterToSend) {
                event.preventDefault();
                this.submit();
            }
            // 如果 enterToSend 为 false，Enter 会插入换行符
        }
    }

    /**
     * 处理输入事件
     */
    onInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.inputValue = target.value;
        this.inputSubject.next(this.inputValue);
        this.autoResize();
    }

    /**
     * 处理composition开始（输入法）
     */
    onCompositionStart(): void {
        this.isComposing = true;
    }

    /**
     * 处理composition结束（输入法）
     */
    onCompositionEnd(): void {
        this.isComposing = false;
        this.autoResize();
    }

    /**
     * 提交消息
     */
    submit(): void {
        const message = this.inputValue.trim();
        if (message && !this.disabled) {
            this.send.emit(message);
            this.inputValue = '';
            setTimeout(() => this.autoResize(), 0);
            this.textInput?.nativeElement.focus();
        }
    }

    /**
     * 清空输入
     */
    clear(): void {
        this.inputValue = '';
        this.autoResize();
        this.textInput?.nativeElement.focus();
    }

    /**
     * 自动调整高度
     */
    private autoResize(): void {
        if (this.textInput?.nativeElement) {
            const textarea = this.textInput.nativeElement;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
    }

    /**
     * 获取字符计数
     */
    getCharCount(): number {
        return this.inputValue.length;
    }

    /**
     * 获取字符限制
     */
    getCharLimit(): number {
        return 4000; // 4K字符限制
    }

    /**
     * 检查是否接近限制
     */
    isNearLimit(): boolean {
        return this.getCharCount() > this.getCharLimit() * 0.8;
    }

    /**
     * 检查是否超过限制
     */
    isOverLimit(): boolean {
        return this.getCharCount() > this.getCharLimit();
    }

    /**
     * 聚焦输入框
     */
    focus(): void {
        this.textInput?.nativeElement.focus();
    }
}
