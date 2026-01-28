import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { ProxyService } from '../../services/network/proxy.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';
import { ProxyConfig, ProxyTestResult } from '../../types/proxy.types';

/**
 * 代理设置组件
 */
@Component({
    selector: 'app-proxy-settings',
    template: `
        <div class="proxy-settings">
            <h3>{{ t.proxy?.title || '代理设置' }}</h3>

            <!-- 启用开关 -->
            <div class="settings-section">
                <div class="section-header">
                    <i class="fa fa-globe"></i>
                    <h4>{{ t.proxy?.networkProxy || '网络代理' }}</h4>
                </div>

                <div class="toggle-row">
                    <label class="toggle-label">
                        <span class="toggle-text">{{ t.proxy?.enableProxy || '启用代理' }}</span>
                        <span class="toggle-description">{{ t.proxy?.enableProxyDesc || '通过代理服务器访问 AI API 端点' }}</span>
                    </label>
                    <label class="switch">
                        <input type="checkbox" [checked]="proxyConfig.enabled" (change)="toggleEnabled()">
                        <span class="slider"></span>
                    </label>
                </div>

                <button class="btn btn-link" (click)="importFromEnv()">
                    <i class="fa fa-download"></i>
                    {{ t.proxy?.importFromEnv || '从环境变量导入' }}
                </button>
            </div>

            <!-- 代理配置 (启用时显示) -->
            <div class="settings-section" *ngIf="proxyConfig.enabled">
                <h4>{{ t.proxy?.proxyConfig || '代理配置' }}</h4>

                <div class="form-group">
                    <label>
                        HTTP {{ t.proxy?.httpProxy || '代理' }}
                        <span class="optional">({{ t.proxy?.optional || '可选' }})</span>
                    </label>
                    <input type="text" class="form-control"
                           [placeholder]="t.proxy?.httpProxyPlaceholder || 'http://127.0.0.1:7890'"
                           [(ngModel)]="proxyConfig.httpProxy"
                           (blur)="saveConfig()">
                    <p class="form-hint">{{ t.proxy?.httpProxyHint || '用于 HTTP 请求的代理地址' }}</p>
                </div>

                <div class="form-group">
                    <label>
                        HTTPS {{ t.proxy?.httpsProxy || '代理' }}
                        <span class="recommended">({{ t.proxy?.recommended || '推荐' }})</span>
                    </label>
                    <input type="text" class="form-control"
                           [placeholder]="t.proxy?.httpsProxyPlaceholder || 'http://127.0.0.1:7890'"
                           [(ngModel)]="proxyConfig.httpsProxy"
                           (blur)="saveConfig()">
                    <p class="form-hint">{{ t.proxy?.httpsProxyHint || '用于 HTTPS 请求的代理地址（大多数 API 使用 HTTPS）' }}</p>
                </div>

                <div class="form-group">
                    <label>{{ t.proxy?.noProxy || 'No Proxy' }}</label>
                    <input type="text" class="form-control"
                           [placeholder]="t.proxy?.noProxyPlaceholder || 'localhost, 127.0.0.1, *.local'"
                           [value]="getNoProxyString()"
                           (blur)="updateNoProxy($event)">
                    <p class="form-hint">{{ t.proxy?.noProxyHint || '不使用代理的地址（逗号分隔）' }}</p>
                </div>

                <!-- 代理认证 -->
                <div class="toggle-row">
                    <label class="toggle-label">
                        <span class="toggle-text">{{ t.proxy?.requireAuth || '需要认证' }}</span>
                    </label>
                    <label class="switch">
                        <input type="checkbox" [checked]="showAuthFields" (change)="toggleAuthFields()">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="auth-fields" *ngIf="showAuthFields">
                    <div class="form-row">
                        <div class="form-group">
                            <label>{{ t.proxy?.username || '用户名' }}</label>
                            <input type="text" class="form-control"
                                   [(ngModel)]="proxyConfig.auth.username"
                                   (blur)="saveConfig()">
                        </div>
                        <div class="form-group">
                            <label>{{ t.proxy?.password || '密码' }}</label>
                            <input type="password" class="form-control"
                                   [(ngModel)]="proxyConfig.auth.password"
                                   (blur)="saveConfig()">
                        </div>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div class="form-actions">
                    <button class="btn btn-primary" (click)="saveConfig()">
                        <i class="fa fa-save"></i>
                        {{ t.common?.save || '保存' }}
                    </button>
                    <button class="btn btn-secondary" (click)="testConnection()" [disabled]="isTesting">
                        <i class="fa" [ngClass]="isTesting ? 'fa-spinner fa-spin' : 'fa-plug'"></i>
                        {{ t.proxy?.testConnection || '测试连接' }}
                    </button>
                </div>

                <!-- 测试结果 -->
                <div class="test-result" *ngIf="testResult">
                    <div class="result-badge" [class.success]="testResult.success" [class.error]="!testResult.success">
                        <i class="fa" [ngClass]="testResult.success ? 'fa-check-circle' : 'fa-times-circle'"></i>
                        {{ testResult.message }}
                        <span *ngIf="testResult.latency">({{ testResult.latency }}ms)</span>
                    </div>
                </div>
            </div>

            <!-- 使用说明 -->
            <div class="settings-section">
                <h4>{{ t.proxy?.usage || '使用说明' }}</h4>
                <div class="info-box">
                    <p><i class="fa fa-info-circle"></i> {{ t.proxy?.usageInfo1 || '代理设置将应用于所有云端 AI 提供商的 API 请求' }}</p>
                    <p><i class="fa fa-info-circle"></i> {{ t.proxy?.usageInfo2 || '本地提供商（Ollama、vLLM）默认不使用代理' }}</p>
                    <p><i class="fa fa-info-circle"></i> {{ t.proxy?.usageInfo3 || '支持 HTTP、HTTPS 和 SOCKS5 代理协议' }}</p>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .proxy-settings {
            padding: 20px;
        }

        .proxy-settings h3 {
            margin-bottom: 20px;
            color: var(--text-primary);
        }

        .proxy-settings h4 {
            margin-bottom: 16px;
            color: var(--text-primary);
        }

        .settings-section {
            background: var(--background-secondary);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }

        .section-header i {
            font-size: 20px;
            color: var(--primary);
        }

        .section-header h4 {
            margin: 0;
        }

        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 12px;
        }

        .toggle-label {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .toggle-text {
            font-weight: 500;
            color: var(--text-primary);
        }

        .toggle-description {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 48px;
            height: 24px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--background-tertiary);
            transition: 0.3s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--primary);
        }

        input:checked + .slider:before {
            transform: translateX(24px);
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--text-primary);
        }

        .form-group label .optional {
            font-size: 12px;
            color: var(--text-secondary);
            font-weight: normal;
        }

        .form-group label .recommended {
            font-size: 12px;
            color: var(--success);
            font-weight: normal;
        }

        .form-control {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--background-tertiary);
            color: var(--text-primary);
            font-size: 14px;
            transition: border-color 0.2s;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--primary);
        }

        .form-hint {
            margin: 6px 0 0;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .form-actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-hover);
        }

        .btn-secondary {
            background: var(--background-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: var(--border-color);
        }

        .btn-secondary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-link {
            background: none;
            border: none;
            color: var(--primary);
            padding: 8px 0;
            font-size: 13px;
        }

        .btn-link:hover {
            text-decoration: underline;
        }

        .test-result {
            margin-top: 16px;
        }

        .result-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
        }

        .result-badge.success {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border: 1px solid var(--success);
        }

        .result-badge.error {
            background: rgba(239, 68, 68, 0.1);
            color: var(--danger);
            border: 1px solid var(--danger);
        }

        .info-box {
            background: var(--background-tertiary);
            padding: 16px;
            border-radius: 6px;
        }

        .info-box p {
            margin: 8px 0;
            color: var(--text-secondary);
            font-size: 13px;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .info-box i {
            color: var(--primary);
            margin-top: 3px;
        }

        .auth-fields {
            padding: 16px 0;
            border-top: 1px solid var(--border-color);
            margin-top: 12px;
        }
    `]
})
export class ProxySettingsComponent implements OnInit, OnDestroy {
    proxyConfig: ProxyConfig = {
        enabled: false,
        httpProxy: '',
        httpsProxy: '',
        noProxy: ['localhost', '127.0.0.1', '::1'],
        auth: undefined
    };

    showAuthFields = false;
    isTesting = false;
    testResult: ProxyTestResult | null = null;

    t: any;
    private destroy$ = new Subject<void>();

    constructor(
        private config: ConfigProviderService,
        private proxyService: ProxyService,
        private logger: LoggerService,
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

    /**
     * 加载配置
     */
    private loadConfig(): void {
        const savedConfig = this.config.getProxyConfig();
        if (savedConfig) {
            this.proxyConfig = { ...savedConfig };
            this.showAuthFields = !!(savedConfig.auth?.username);
        }
    }

    /**
     * 切换启用状态
     */
    toggleEnabled(): void {
        this.proxyConfig.enabled = !this.proxyConfig.enabled;
        this.saveConfig();
    }

    /**
     * 切换认证字段显示
     */
    toggleAuthFields(): void {
        this.showAuthFields = !this.showAuthFields;
        if (!this.showAuthFields) {
            this.proxyConfig.auth = undefined;
        } else if (!this.proxyConfig.auth) {
            this.proxyConfig.auth = { username: '', password: '' };
        }
        this.saveConfig();
    }

    /**
     * 更新 noProxy
     */
    updateNoProxy(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.proxyConfig.noProxy = value.split(',').map(s => s.trim()).filter(s => s);
        this.saveConfig();
    }

    /**
     * 获取 noProxy 字符串
     */
    getNoProxyString(): string {
        return this.proxyConfig.noProxy?.join(', ') || '';
    }

    /**
     * 保存配置
     */
    saveConfig(): void {
        // 验证代理地址
        if (this.proxyConfig.enabled) {
            const httpResult = this.proxyService.validateProxyUrl(this.proxyConfig.httpProxy || '');
            const httpsResult = this.proxyService.validateProxyUrl(this.proxyConfig.httpsProxy || '');

            if (!httpResult.valid && this.proxyConfig.httpProxy) {
                this.toast.error(`HTTP ${this.t.proxy?.testFailed || '代理'}: ${httpResult.message}`);
                return;
            }
            if (!httpsResult.valid && this.proxyConfig.httpsProxy) {
                this.toast.error(`HTTPS ${this.t.proxy?.testFailed || '代理'}: ${httpsResult.message}`);
                return;
            }
        }

        this.config.updateProxyConfig(this.proxyConfig);
        this.toast.success(this.t.proxy?.configSaved || '代理配置已保存');
        this.logger.info('Proxy configuration saved', { enabled: this.proxyConfig.enabled });
    }

    /**
     * 测试代理连接
     */
    async testConnection(): Promise<void> {
        const proxyUrl = this.proxyConfig.httpsProxy || this.proxyConfig.httpProxy;

        if (!proxyUrl) {
            this.toast.error(this.t.proxy?.noProxyUrl || '请先配置代理地址');
            return;
        }

        this.isTesting = true;
        this.testResult = null;

        try {
            this.testResult = await this.proxyService.testProxyConnection(proxyUrl);
            if (this.testResult.success) {
                this.toast.success(`${this.t.proxy?.testSuccess || '连接成功'} (${this.testResult.latency}ms)`);
            } else {
                this.toast.error(`${this.t.proxy?.testFailed || '连接失败'}: ${this.testResult.message}`);
            }
        } catch (error) {
            this.testResult = {
                success: false,
                message: error instanceof Error ? error.message : String(error)
            };
            this.toast.error(this.t.proxy?.testFailed || '测试失败');
        } finally {
            this.isTesting = false;
        }
    }

    /**
     * 从环境变量导入代理配置
     */
    importFromEnv(): void {
        const importedConfig = this.proxyService.importFromEnv();
        if (importedConfig.enabled) {
            this.proxyConfig = { ...importedConfig };
            this.showAuthFields = !!(importedConfig.auth?.username);
            this.saveConfig();
            this.toast.success(this.t.proxy?.importSuccess || '已从环境变量导入代理配置');
        } else {
            this.toast.info(this.t.proxy?.noEnvProxy || '未检测到环境变量中的代理配置');
        }
    }
}
