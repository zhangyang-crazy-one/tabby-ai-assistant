import { Injectable } from '@angular/core';
import { HotkeyProvider, HotkeyDescription, TranslateService } from 'tabby-core';
import { AiSidebarService } from '../../services/chat/ai-sidebar.service';

/**
 * Tabby热键提供者
 * 为Tabby添加AI助手热键支持
 * 
 * 注意：热键 ID 必须与 AiConfigProvider.defaults.hotkeys 中定义的一致
 */
@Injectable()
export class AiHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'ai-assistant-toggle',
            name: '打开AI助手',
        },
        {
            id: 'ai-command-generation',
            name: '生成命令',
        },
        {
            id: 'ai-explain-command',
            name: '解释命令',
        }
    ];

    constructor(
        private sidebarService: AiSidebarService,
        private translate: TranslateService
    ) {
        super();
    }

    async provide(): Promise<HotkeyDescription[]> {
        return this.hotkeys;
    }
}

