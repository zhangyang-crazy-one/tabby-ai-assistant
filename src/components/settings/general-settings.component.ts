import { Component, Output, EventEmitter, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ThemeService, ThemeType } from '../../services/core/theme.service';
import { ConfigService } from 'tabby-core';
import { TranslateService, SupportedLanguage } from '../../i18n';

@Component({
    selector: 'app-general-settings',
    templateUrl: './general-settings.component.html',
    styleUrls: ['./general-settings.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
    @Output() providerChanged = new EventEmitter<string>();

    availableProviders: any[] = [];
    selectedProvider: string = '';
    isEnabled: boolean = true;
    language: string = 'zh-CN';
    theme: string = 'auto';

    // 翻译对象
    t: any;

    // 本地供应商状态缓存
    private localProviderStatus: { [key: string]: { text: string; color: string; icon: string; time: number } } = {};
    private readonly statusCacheDuration = 30000; // 30秒缓存
    private destroy$ = new Subject<void>();

    languages = [
        { value: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
        { value: 'en-US', label: 'English', flag: '🇺🇸' }
    ];

    themes = [
        { value: 'auto', label: '跟随系统' },
        { value: 'light', label: '浅色主题' },
        { value: 'dark', label: '深色主题' },
        { value: 'pixel', label: '像素复古' },
        { value: 'tech', label: '赛博科技' }
    ];

    // 提供商模板，用于显示名称
    private providerNames: { [key: string]: string } = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic Claude',
        'minimax': 'Minimax',
        'glm': 'GLM (ChatGLM)',
        'openai-compatible': 'OpenAI Compatible',
        'ollama': 'Ollama (本地)',
        'vllm': 'vLLM (本地)'
    };

    constructor(
        private aiService: AiAssistantService,
        private config: ConfigProviderService,
        private tabbyConfig: ConfigService,
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
            // 更新主题翻译
            this.updateThemeLabels();
        });

        this.loadSettings();
        this.loadProviders();
        // 应用当前主题
        this.applyTheme(this.theme);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 更新主题标签翻译
     */
    private updateThemeLabels(): void {
        this.themes = [
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
        this.selectedProvider = this.config.getDefaultProvider() || '';
        this.isEnabled = this.config.isEnabled() ?? true;
        this.language = this.config.get('language', 'zh-CN') || 'zh-CN';
        this.theme = this.config.get('theme', 'auto') || 'auto';
    }

    /**
     * 加载可用提供商 - 支持云端和本地供应商
     */
    private loadProviders(): void {
        const allConfigs = this.config.getAllProviderConfigs();

        // 本地供应商列表（不需要 API Key）
        const localProviders = ['ollama', 'vllm'];
        this.availableProviders = Object.keys(allConfigs)
            .filter(key => {
                const config = allConfigs[key];
                if (!config) return false;

                // 本地供应商：只需要有配置即可
                if (localProviders.includes(key)) {
                    return config.enabled !== false;
                }

                // 云端供应商：需要 API Key
                return !!config.apiKey;
            })
            .map(key => ({
                name: key,
                displayName: allConfigs[key].displayName || this.providerNames[key] || key,
                description: this.getProviderDescription(key),
                enabled: allConfigs[key].enabled !== false,
                isLocal: localProviders.includes(key)
            }));

        this.logger.info('Loaded providers from config', { count: this.availableProviders.length });
    }

    /**
     * 获取供应商描述
     */
    private getProviderDescription(key: string): string {
        const descriptions: { [key: string]: string } = {
            'openai': '云端 OpenAI GPT 系列模型',
            'anthropic': '云端 Anthropic Claude 系列模型',
            'minimax': '云端 Minimax 大模型',
            'glm': '云端 智谱 ChatGLM 模型',
            'openai-compatible': '兼容 OpenAI API 的第三方服务',
            'ollama': '本地运行的 Ollama 服务 (端口 11434)',
            'vllm': '本地运行的 vLLM 服务 (端口 8000)'
        };
        return descriptions[key] || `${this.providerNames[key] || key} 提供商`;
    }

    /**
     * 获取云端提供商状态（同步返回）
     */
    getProviderStatus(providerName: string): { text: string; color: string; icon: string } {
        const providerConfig = this.config.getProviderConfig(providerName);
        if (providerConfig && providerConfig.apiKey) {
            return {
                text: providerConfig.enabled !== false ? '已启用' : '已禁用',
                color: providerConfig.enabled !== false ? '#4caf50' : '#ff9800',
                icon: providerConfig.enabled !== false ? 'fa-check-circle' : 'fa-pause-circle'
            };
        }
        return { text: '未配置', color: '#9e9e9e', icon: 'fa-question-circle' };
    }

    /**
     * 检测本地供应商状态（异步）
     */
    private async checkLocalProviderStatus(providerName: string): Promise<boolean> {
        const urls: { [key: string]: string } = {
            'ollama': 'http://localhost:11434/v1/models',
            'vllm': 'http://localhost:8000/v1/models'
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(urls[providerName], {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * 获取本地供应商状态（同步返回，异步更新缓存）
     */
    getLocalProviderStatus(providerName: string): { text: string; color: string; icon: string } {
        const now = Date.now();
        const cached = this.localProviderStatus[providerName];

        // 检查缓存是否有效（30秒内）
        if (cached && (now - cached.time) < this.statusCacheDuration) {
            return { text: cached.text, color: cached.color, icon: cached.icon };
        }

        // 返回默认状态并异步更新
        const defaultStatus = { text: '检测中...', color: '#ff9800', icon: 'fa-spinner fa-spin' };
        this.localProviderStatus[providerName] = { ...defaultStatus, time: now };

        // 异步检查实际状态
        this.checkLocalProviderStatus(providerName).then(isOnline => {
            const status = isOnline
                ? { text: '在线', color: '#4caf50', icon: 'fa-check-circle', time: now }
                : { text: '离线', color: '#f44336', icon: 'fa-times-circle', time: now };
            this.localProviderStatus[providerName] = status;
            this.logger.debug('Local provider status updated', { provider: providerName, isOnline });
        }).catch(() => {
            const status = { text: '离线', color: '#f44336', icon: 'fa-times-circle', time: now };
            this.localProviderStatus[providerName] = status;
        });

        return defaultStatus;
    }

    /**
     * 更新默认提供商
     */
    updateDefaultProvider(providerName: string): void {
        this.selectedProvider = providerName;
        this.config.setDefaultProvider(providerName);
        this.providerChanged.emit(providerName);
        this.logger.info('Default provider updated', { provider: providerName });
    }

    /**
     * 更新启用状态
     */
    updateEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.config.setEnabled(enabled);
        this.logger.info('AI Assistant enabled state changed', { enabled });
    }

    /**
     * 更新语言
     */
    updateLanguage(language: string): void {
        this.language = language;
        this.translate.setLanguage(language as SupportedLanguage);
        this.logger.info('Language updated', { language });
    }

    /**
     * 更新主题
     */
    updateTheme(theme: string): void {
        this.theme = theme;
        this.config.set('theme', theme);
        this.themeService.applyTheme(theme as ThemeType);
        this.logger.info('Theme updated', { theme });
    }

    /**
     * 应用主题 - 使用 ThemeService
     */
    private applyTheme(theme: string): void {
        this.themeService.applyTheme(theme as ThemeType);
    }
}
