import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { ChatMessage } from '../../types/ai.types';

@Component({
    selector: 'app-chat-message',
    templateUrl: './chat-message.component.html',
    styleUrls: ['./chat-message.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatMessageComponent {
    @Input() message!: ChatMessage;
    @Input() showAvatar = true;
    @Input() showTimestamp = true;
    @Input() isGrouped = false; // 是否与上一条消息分组
    @Output() messageClick = new EventEmitter<ChatMessage>();
    @Output() messageAction = new EventEmitter<{ action: string; message: ChatMessage }>();

    /**
     * 处理消息点击
     */
    onMessageClick(): void {
        this.messageClick.emit(this.message);
    }

    /**
     * 处理消息操作
     */
    onAction(action: string): void {
        this.messageAction.emit({ action, message: this.message });
    }

    /**
     * 复制消息内容
     */
    copyMessage(): void {
        navigator.clipboard.writeText(this.message.content).then(() => {
            // TODO: 显示复制成功提示
        });
    }

    /**
     * 重新生成响应
     */
    regenerateResponse(): void {
        if (this.message.role === 'assistant') {
            this.onAction('regenerate');
        }
    }

    /**
     * 标记为有用
     */
    markAsHelpful(): void {
        this.onAction('helpful');
    }

    /**
     * 标记为无用
     */
    markAsNotHelpful(): void {
        this.onAction('not-helpful');
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp: Date): string {
        return timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 检查是否为用户消息
     */
    isUserMessage(): boolean {
        return this.message.role === 'user';
    }

    /**
     * 检查是否为AI消息
     */
    isAssistantMessage(): boolean {
        return this.message.role === 'assistant';
    }

    /**
     * 检查是否为系统消息
     */
    isSystemMessage(): boolean {
        return this.message.role === 'system';
    }
}
