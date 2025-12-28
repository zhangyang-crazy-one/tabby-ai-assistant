import { Injectable } from '@angular/core';
import { SettingsTabProvider } from 'tabby-settings';
import { AiSettingsTabComponent } from '../../components/settings/ai-settings-tab.component';

/**
 * Tabby设置页面提供者
 * 为Tabby添加AI助手设置页面
 */
@Injectable()
export class AiSettingsTabProvider extends SettingsTabProvider {
    id = 'ai-assistant';
    icon = 'fa fa-robot';
    title = 'AI 助手';

    getComponentType(): any {
        return AiSettingsTabComponent;
    }
}
