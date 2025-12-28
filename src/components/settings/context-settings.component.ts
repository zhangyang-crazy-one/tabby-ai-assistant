import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { ContextManager } from '../../services/context/manager';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';
import { ContextConfig, DEFAULT_CONTEXT_CONFIG } from '../../types/ai.types';

@Component({
    selector: 'app-context-settings',
    templateUrl: './context-settings.component.html',
    styleUrls: ['./context-settings.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ContextSettingsComponent implements OnInit, OnDestroy {
    // 配置项
    config: ContextConfig = { ...DEFAULT_CONTEXT_CONFIG };
    autoCompactEnabled = true;

    // 当前供应商的上下文限制
    activeProviderContextWindow: number = 200000;

    // 翻译对象
    t: any;

    private destroy$ = new Subject<void>();

    constructor(
        private configService: ConfigProviderService,
        private contextManager: ContextManager,
        private toast: ToastService,
        private translate: TranslateService
    ) {
        this.t = this.translate.t;
    }

    ngOnInit(): void {
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
        });

        this.loadConfig();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadConfig(): void {
        const savedConfig = this.configService.getContextConfig();
        if (savedConfig) {
            this.config = { ...DEFAULT_CONTEXT_CONFIG, ...savedConfig };
        }
        this.autoCompactEnabled = this.configService.isAutoCompactEnabled();

        // 获取当前供应商的上下文限制
        this.activeProviderContextWindow = this.configService.getActiveProviderContextWindow();

        // 确保配置的 maxContextTokens 不超过供应商限制
        if (this.config.maxContextTokens > this.activeProviderContextWindow) {
            this.config.maxContextTokens = this.activeProviderContextWindow;
        }
    }

    saveConfig(): void {
        this.configService.setContextConfig(this.config);
        this.contextManager.updateConfig(this.config);
        this.toast.success(this.t?.contextSettings?.configSaved || '上下文配置已保存');
    }

    toggleAutoCompact(): void {
        this.autoCompactEnabled = !this.autoCompactEnabled;
        this.configService.setAutoCompactEnabled(this.autoCompactEnabled);
        this.toast.info(
            this.autoCompactEnabled
                ? (this.t?.contextSettings?.autoCompactEnabled || '自动压缩已启用')
                : (this.t?.contextSettings?.autoCompactDisabled || '自动压缩已禁用')
        );
    }

    resetToDefaults(): void {
        this.config = { ...DEFAULT_CONTEXT_CONFIG };
        this.autoCompactEnabled = true;
        this.saveConfig();
        this.toast.info(this.t?.common?.resetToDefault || '已重置为默认配置');
    }
}
