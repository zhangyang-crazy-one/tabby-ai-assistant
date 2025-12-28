import { Component, Input } from '@angular/core';
import { AiSidebarService } from '../../services/chat/ai-sidebar.service';

/**
 * AI工具栏按钮组件
 * 在Tabby工具栏显示AI助手按钮
 */
@Component({
    selector: 'ai-toolbar-button',
    templateUrl: './ai-toolbar-button.component.html',
    styleUrls: ['./ai-toolbar-button.component.scss']
})
export class AiToolbarButtonComponent {
    @Input() label: string = 'AI Assistant';
    @Input() tooltip: string = 'Open AI Assistant';
    @Input() showLabel: boolean = true;

    constructor(private sidebarService: AiSidebarService) {}

    onClick(): void {
        this.sidebarService.toggle();
    }
}
