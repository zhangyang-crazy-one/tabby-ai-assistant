import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ThemeService, ThemeType } from '../../services/core/theme.service';
import { TranslateService } from '../../i18n';

@Component({
    selector: 'app-chat-settings',
    templateUrl: './chat-settings.component.html',
    styleUrls: ['./chat-settings.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatSettingsComponent implements OnInit, OnDestroy {
    settings: {
        chatHistoryEnabled: boolean;
        maxChatHistory: number;
        autoSaveChat: boolean;
        theme: string;
        fontSize: number;
        compactMode: boolean;
        showTimestamps: boolean;
        showAvatars: boolean;
        enterToSend: boolean;
        soundEnabled: boolean;
        agentMaxRounds: number;
    } = {
        chatHistoryEnabled: true,
        maxChatHistory: 100,
        autoSaveChat: true,
        theme: 'auto',
        fontSize: 14,
        compactMode: false,
        showTimestamps: true,
        showAvatars: true,
        enterToSend: true,
        soundEnabled: true,
        agentMaxRounds: 50
    };

    // 翻译对象
    t: any;

    fontSizes = [12, 14, 16, 18, 20];

    private destroy$ = new Subject<void>();

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService,
        private translate: TranslateService,
        private themeService: ThemeService
    ) {
        this.t = this.translate.t;
    }

    ngOnInit(): void {
        // 监听语言变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
            this.updateThemeLabels();
        });

        this.loadSettings();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 更新主题标签翻译
     */
    private updateThemeLabels(): void {
        this.settings.theme = this.config.get('theme', 'auto') ?? 'auto';
    }

    /**
     * 获取主题选项
     */
    get themes() {
        return [
            { value: 'auto', label: this.t.general.themeAuto },
            { value: 'light', label: this.t.general.themeLight },
            { value: 'dark', label: this.t.general.themeDark },
            { value: 'pixel', label: this.t.general.themePixel || '像素复古' },
            { value: 'tech', label: this.t.general.themeTech || '赛博科技' }
        ];
    }

    /**
     * 加载设置
     */
    private loadSettings(): void {
        this.settings.chatHistoryEnabled = this.config.get('chatHistoryEnabled', true) ?? true;
        this.settings.maxChatHistory = this.config.get('maxChatHistory', 100) ?? 100;
        this.settings.autoSaveChat = this.config.get('autoSaveChat', true) ?? true;
        this.settings.theme = this.config.get('theme', 'auto') ?? 'auto';
        this.settings.fontSize = this.config.get('ui.fontSize', 14) ?? 14;
        this.settings.compactMode = this.config.get('ui.compactMode', false) ?? false;
        this.settings.showTimestamps = this.config.get('ui.showTimestamps', true) ?? true;
        this.settings.showAvatars = this.config.get('ui.showAvatars', true) ?? true;
        this.settings.enterToSend = this.config.get('ui.enterToSend', true) ?? true;
        this.settings.soundEnabled = this.config.get('ui.soundEnabled', true) ?? true;
        this.settings.agentMaxRounds = this.config.get('agentMaxRounds', 50) ?? 50;
    }

    /**
     * 保存设置
     */
    saveSetting(key: string, value: any): void {
        try {
            this.config.set(key, value);
            this.logger.debug('Chat setting saved', { key, value });
        } catch (error) {
            this.logger.error('Failed to save chat setting', error);
        }
    }

    /**
     * 更新主题
     */
    updateTheme(theme: string): void {
        this.settings.theme = theme;
        this.saveSetting('theme', theme);
        this.themeService.applyTheme(theme as ThemeType);
    }

    /**
     * 更新字体大小
     */
    updateFontSize(size: number): void {
        this.settings.fontSize = size;
        this.saveSetting('ui.fontSize', size);
        document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
    }

    /**
     * 切换紧凑模式
     */
    toggleCompactMode(): void {
        this.settings.compactMode = !this.settings.compactMode;
        this.saveSetting('ui.compactMode', this.settings.compactMode);
        document.documentElement.classList.toggle('compact-chat', this.settings.compactMode);
    }

    /**
     * 清空聊天历史
     */
    clearChatHistory(): void {
        if (confirm(this.t.chatSettings.clearHistoryConfirm)) {
            localStorage.removeItem('ai-assistant-chat-history');
            this.logger.info('Chat history cleared');
            alert(this.t.providers.configDeleted);
        }
    }

    /**
     * 导出聊天设置
     */
    exportSettings(): void {
        const exportData = {
            chatSettings: this.settings,
            exportTime: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * 重置为默认设置
     */
    resetToDefaults(): void {
        if (confirm(this.t.chatSettings.resetConfirm)) {
            this.settings = {
                chatHistoryEnabled: true,
                maxChatHistory: 100,
                autoSaveChat: true,
                theme: 'auto',
                fontSize: 14,
                compactMode: false,
                showTimestamps: true,
                showAvatars: true,
                enterToSend: true,
                soundEnabled: true,
                agentMaxRounds: 50
            };

            // 保存所有设置
            Object.entries(this.settings).forEach(([key, value]) => {
                const configKey = key.includes('.') ? key : `ui.${key}`;
                this.saveSetting(configKey, value);
            });
            // 单独保存 agentMaxRounds（不在 ui 命名空间下）
            this.saveSetting('agentMaxRounds', this.settings.agentMaxRounds);

            this.logger.info('Chat settings reset to defaults');
            alert(this.t.providers.configSaved);
        }
    }
}
