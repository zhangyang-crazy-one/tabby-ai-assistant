import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { TranslateService } from '../../i18n';

@Component({
    selector: 'app-security-settings',
    templateUrl: './security-settings.component.html',
    styleUrls: ['./security-settings.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class SecuritySettingsComponent implements OnInit, OnDestroy {
    settings = {
        enablePasswordProtection: false,
        enableRiskAssessment: true,
        defaultRiskLevel: 'medium',
        enableConsentPersistence: true,
        consentExpiryDays: 30,
        autoApproveLowRisk: true,
        promptForMediumRisk: true,
        requirePasswordForHighRisk: true
    };

    // 缺失的变量
    password: string = '';
    newPattern: string = '';

    dangerousPatterns = [
        'rm -rf /',
        'sudo rm',
        'format',
        'dd if=',
        'fork('
    ];

    // 翻译对象
    t: any;

    private destroy$ = new Subject<void>();

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService,
        private translate: TranslateService
    ) {
        this.t = this.translate.t;
    }

    ngOnInit(): void {
        // 监听语言变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
        });

        this.loadSettings();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private loadSettings(): void {
        const securityConfig = this.config.getSecurityConfig();
        this.settings = { ...this.settings, ...securityConfig };
    }

    updateSetting(key: string, value: any): void {
        (this.settings as any)[key] = value;
        this.config.updateSecurityConfig({ [key]: value });
        this.logger.debug('Security setting updated', { key, value });
    }

    addDangerousPattern(pattern: string): void {
        if (pattern && !this.dangerousPatterns.includes(pattern)) {
            this.dangerousPatterns.push(pattern);
            this.newPattern = '';
        }
    }

    removeDangerousPattern(index: number): void {
        this.dangerousPatterns.splice(index, 1);
    }

    saveSettings(): void {
        this.config.updateSecurityConfig(this.settings);
        this.logger.info('Security settings saved', this.settings);
    }

    resetToDefaults(): void {
        if (confirm(this.t.security.resetConfirm)) {
            this.settings = {
                enablePasswordProtection: false,
                enableRiskAssessment: true,
                defaultRiskLevel: 'medium',
                enableConsentPersistence: true,
                consentExpiryDays: 30,
                autoApproveLowRisk: true,
                promptForMediumRisk: true,
                requirePasswordForHighRisk: true
            };
            this.config.updateSecurityConfig(this.settings);
        }
    }
}
