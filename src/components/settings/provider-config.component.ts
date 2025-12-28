import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';

@Component({
    selector: 'app-provider-config',
    templateUrl: './provider-config.component.html',
    styleUrls: ['./provider-config.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ProviderConfigComponent implements OnInit, OnDestroy {
    @Input() providerStatus: any = {};
    @Output() refreshStatus = new EventEmitter<void>();
    @Output() switchProvider = new EventEmitter<string>();

    // 暴露 Object 给模板使用
    Object = Object;

    selectedProvider = '';
    configs: { [key: string]: any } = {};
    expandedProvider: string = '';
    localStatus: { [key: string]: boolean } = {};
    passwordVisibility: { [key: string]: { [fieldKey: string]: boolean } } = {};

    // 翻译对象
    t: any;

    // API Key 格式校验规则
    private apiKeyPatterns: { [key: string]: RegExp } = {
        'openai': /^sk-[a-zA-Z0-9]{32,}$/,
        'anthropic': /^sk-ant-[a-zA-Z0-9-]+$/,
        'minimax': /^[a-zA-Z0-9]{32,}$/,
        'glm': /^[a-zA-Z0-9._-]+$/
    };

    private destroy$ = new Subject<void>();

    // 云端提供商模板
    cloudProviderTemplates = {
        'openai': {
            name: 'OpenAI',
            description: 'OpenAI GPT模型',
            icon: 'fa-robot',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.openai.com/v1', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'gpt-4', required: false, placeholder: '例如: gpt-4, gpt-4-turbo, gpt-3.5-turbo' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 128000, required: false, placeholder: 'GPT-4: 128000, GPT-3.5: 16385' }
            ]
        },
        'anthropic': {
            name: 'Anthropic Claude',
            description: 'Anthropic Claude模型',
            icon: 'fa-comments',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.anthropic.com', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'claude-3-sonnet-20240229', required: false, placeholder: '例如: claude-3-opus, claude-3-sonnet' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 200000, required: false, placeholder: 'Claude 3: 200000' }
            ]
        },
        'minimax': {
            name: 'Minimax',
            description: 'Minimax AI模型',
            icon: 'fa-brain',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.minimaxi.com/anthropic', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'MiniMax-M2', required: false, placeholder: '例如: MiniMax-M2, MiniMax-M2.1' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 128000, required: false, placeholder: 'MiniMax-M2: 128000' }
            ]
        },
        'glm': {
            name: 'GLM (ChatGLM)',
            description: '智谱AI ChatGLM模型',
            icon: 'fa-network-wired',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://open.bigmodel.cn/api/paas/v4', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'glm-4', required: false, placeholder: '例如: glm-4, glm-4-air, glm-4-flash' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 128000, required: false, placeholder: 'GLM-4: 128000' }
            ]
        }
    };

    // 本地提供商模板（不需要 API Key）
    localProviderTemplates = {
        'ollama': {
            name: 'Ollama (本地)',
            description: '本地运行的 Ollama 服务，支持 Llama、Qwen 等模型',
            icon: 'fa-server',
            defaultURL: 'http://localhost:11434/v1',
            fields: [
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:11434/v1', required: true, placeholder: '例如: http://localhost:11434/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'llama3.1', required: false, placeholder: '例如: llama3.1, qwen2.5, mistral' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 8192, required: false, placeholder: 'Llama 3.1: 8192' }
            ]
        },
        'vllm': {
            name: 'vLLM (本地)',
            description: '本地运行的 vLLM 服务，适合生产部署',
            icon: 'fa-database',
            defaultURL: 'http://localhost:8000/v1',
            fields: [
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:8000/v1', required: true, placeholder: '例如: http://localhost:8000/v1' },
                { key: 'apiKey', label: 'API Key (可选)', type: 'password', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'meta-llama/Llama-3.1-8B', required: false, placeholder: 'HuggingFace 模型路径' },
                { key: 'contextWindow', label: '上下文限制', type: 'number', default: 8192, required: false, placeholder: '根据模型实际配置设置' }
            ]
        }
    };

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService,
        private toast: ToastService,
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

        this.loadConfigs();
        // 检测本地供应商状态
        this.checkLocalProviderStatus();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 加载配置
     */
    private loadConfigs(): void {
        const allConfigs = this.config.getAllProviderConfigs();

        // 为所有云端供应商初始化默认配置
        for (const providerName of Object.keys(this.cloudProviderTemplates)) {
            if (!allConfigs[providerName]) {
                const template = this.cloudProviderTemplates[providerName];
                allConfigs[providerName] = {
                    name: providerName,
                    displayName: template.name,
                    enabled: false,
                    ...this.createDefaultConfig(template.fields)
                };
            }
        }

        // 为所有本地供应商初始化默认配置
        for (const providerName of Object.keys(this.localProviderTemplates)) {
            if (!allConfigs[providerName]) {
                const template = this.localProviderTemplates[providerName];
                allConfigs[providerName] = {
                    name: providerName,
                    displayName: template.name,
                    enabled: false,
                    ...this.createDefaultConfig(template.fields)
                };
            }
        }

        this.configs = allConfigs;
        this.selectedProvider = this.config.getDefaultProvider();
    }

    /**
     * 切换展开/折叠
     */
    toggleExpand(providerName: string): void {
        this.expandedProvider = this.expandedProvider === providerName ? '' : providerName;
    }

    /**
     * 检查是否是本地提供商
     */
    isLocalProvider(providerName: string): boolean {
        return providerName in this.localProviderTemplates;
    }

    /**
     * 检测本地供应商状态
     */
    private async checkLocalProviderStatus(): Promise<void> {
        const localUrls: { [key: string]: string } = {
            'ollama': 'http://localhost:11434/v1/models',
            'vllm': 'http://localhost:8000/v1/models'
        };

        for (const [name, url] of Object.entries(localUrls)) {
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 2000);

                const response = await fetch(url, { signal: controller.signal });
                this.localStatus[name] = response.ok;
            } catch {
                this.localStatus[name] = false;
            }
        }
    }

    /**
     * 获取本地供应商在线状态
     */
    getLocalStatus(providerName: string): { text: string; color: string; icon: string } {
        const isOnline = this.localStatus[providerName];
        return isOnline
            ? { text: '在线', color: '#4caf50', icon: 'fa-check-circle' }
            : { text: '离线', color: '#f44336', icon: 'fa-times-circle' };
    }

    /**
     * 测试本地提供商连接
     */
    async testLocalProvider(providerName: string): Promise<void> {
        const template = this.localProviderTemplates[providerName];
        const baseURL = this.configs[providerName]?.baseURL || template?.defaultURL;

        if (!baseURL) {
            this.toast.error(this.t.providers.baseURL + ': ' + this.t.providers.testError);
            return;
        }

        const testingMessage = `${this.t.providers.testConnection} ${template.name}...`;
        this.logger.info(testingMessage);

        try {
            const response = await fetch(`${baseURL}/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                this.toast.success(`${template.name}: ${this.t.providers.testSuccess}`);
                this.localStatus[providerName] = true;
                this.logger.info('Local provider test successful', { provider: providerName });
            } else {
                this.toast.error(`${this.t.providers.testFail}: ${response.status}`);
                this.localStatus[providerName] = false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : this.t.providers.testError;
            this.toast.error(`${template.name}\n\n${this.t.providers.testError}\n${errorMessage}`);
            this.localStatus[providerName] = false;
            this.logger.error('Local provider test failed', { provider: providerName, error: errorMessage });
        }
    }

    /**
     * 保存配置
     */
    saveConfig(providerName: string): void {
        const providerConfig = this.configs[providerName];
        if (providerConfig) {
            this.config.setProviderConfig(providerName, providerConfig);
            this.logger.info('Provider config saved', { provider: providerName });
            this.toast.success(`${this.getProviderTemplate(providerName)?.name || providerName} ${this.t.providers.configSaved || '配置已保存'}`);
        }
    }

    /**
     * 添加提供商
     */
    addProvider(providerName: string): void {
        if (!this.configs[providerName]) {
            // 检查是云端还是本地提供商
            let template = this.cloudProviderTemplates[providerName];
            if (!template) {
                template = this.localProviderTemplates[providerName];
            }
            if (template) {
                const newConfig = {
                    name: providerName,
                    displayName: template.name,
                    enabled: true,
                    ...this.createDefaultConfig(template.fields)
                };
                this.configs[providerName] = newConfig;
                this.saveConfig(providerName);
            }
        }
    }

    /**
     * 删除提供商
     */
    removeProvider(providerName: string): void {
        if (confirm(this.t.providers.deleteConfirm)) {
            delete this.configs[providerName];
            this.config.deleteProviderConfig(providerName);
            this.logger.info('Provider config removed', { provider: providerName });
        }
    }

    /**
     * 切换提供商启用状态
     */
    toggleProviderEnabled(providerName: string): void {
        if (this.configs[providerName]) {
            this.configs[providerName].enabled = !this.configs[providerName].enabled;
            this.saveConfig(providerName);
        }
    }

    /**
     * 测试连接
     */
    async testConnection(providerName: string): Promise<void> {
        const providerConfig = this.configs[providerName];
        if (!providerConfig) {
            this.toast.error(this.t.providers.testError);
            return;
        }

        // 本地提供商使用不同的测试方法
        if (this.isLocalProvider(providerName)) {
            await this.testLocalProvider(providerName);
            return;
        }

        const apiKey = providerConfig.apiKey;
        const baseURL = providerConfig.baseURL;

        if (!apiKey) {
            this.toast.error(this.t.providers.apiKey + ': ' + this.t.providers.testError);
            return;
        }

        const template = this.cloudProviderTemplates[providerName];
        const providerDisplayName = template?.name || providerName;

        // 显示测试中状态
        const testingMessage = `${this.t.providers.testConnection} ${providerDisplayName}...`;
        this.logger.info(testingMessage);

        try {
            // 构造测试请求
            const testEndpoint = this.getTestEndpoint(providerName, baseURL);
            const headers = this.getTestHeaders(providerName, apiKey, baseURL);

            const response = await fetch(testEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(this.getTestBody(providerName, baseURL))
            });

            if (response.ok) {
                this.toast.success(this.t.providers.testSuccess);
                this.logger.info('Connection test successful', { provider: providerName });
            } else {
                const errorData = await response.text();
                this.toast.error(`${this.t.providers.testFail}\n\nStatus: ${response.status}\n${errorData.substring(0, 200)}`);
                this.logger.error('Connection test failed', { provider: providerName, status: response.status });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : this.t.providers.testError;
            this.toast.error(`${this.t.providers.testFail}\n\n${errorMessage}`);
            this.logger.error('Connection test error', { provider: providerName, error: errorMessage });
        }
    }

    /**
     * 获取测试端点
     */
    private getTestEndpoint(providerName: string, baseURL: string): string {
        // 检查 baseURL 是否包含 anthropic 路径（如 Minimax 的 Anthropic 兼容接口）
        const isAnthropicCompatible = baseURL.includes('/anthropic');

        if (isAnthropicCompatible) {
            return `${baseURL}/v1/messages`;
        }

        switch (providerName) {
            case 'openai':
                return `${baseURL}/chat/completions`;
            case 'anthropic':
                return `${baseURL}/v1/messages`;
            case 'glm':
                return `${baseURL}/chat/completions`;
            default:
                return `${baseURL}/v1/chat/completions`;
        }
    }

    /**
     * 获取测试请求头
     */
    private getTestHeaders(providerName: string, apiKey: string, baseURL: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // 检查是否使用 Anthropic 兼容接口
        const isAnthropicCompatible = baseURL.includes('/anthropic') || providerName === 'anthropic';

        if (isAnthropicCompatible) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }

    /**
     * 获取测试请求体
     */
    private getTestBody(providerName: string, baseURL: string): any {
        // 检查是否使用 Anthropic 兼容接口
        const isAnthropicCompatible = baseURL.includes('/anthropic') || providerName === 'anthropic';

        if (isAnthropicCompatible) {
            return {
                model: this.configs[providerName]?.model || 'claude-3-sonnet-20240229',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            };
        }

        return {
            model: this.configs[providerName]?.model || 'gpt-3.5-turbo',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }]
        };
    }

    /**
     * 创建默认配置
     */
    private createDefaultConfig(fields: any[]): any {
        const config: any = {};
        fields.forEach(field => {
            if (field.default !== undefined) {
                config[field.key] = field.default;
            }
        });
        return config;
    }

    /**
     * 获取字段类型
     */
    getFieldType(field: any): string {
        return field.type || 'text';
    }

    /**
     * 获取选项
     */
    getFieldOptions(field: any): string[] {
        return field.options || [];
    }

    /**
     * 检查是否是密码字段
     */
    isPasswordField(field: any): boolean {
        return field.type === 'password';
    }

    /**
     * 检查是否必填
     */
    isRequired(field: any): boolean {
        return field.required;
    }

    /**
     * 获取提供商模板（支持云端和本地）
     */
    getProviderTemplate(providerName: string): any {
        return this.cloudProviderTemplates[providerName] || this.localProviderTemplates[providerName];
    }

    /**
     * 获取提供商图标
     */
    getProviderIcon(providerName: string): string {
        const template = this.getProviderTemplate(providerName);
        return template?.icon || 'fa-cog';
    }

    /**
     * 检查是否有配置
     */
    hasConfig(providerName: string): boolean {
        return !!this.configs[providerName];
    }

    /**
     * 获取配置值
     */
    getConfigValue(providerName: string, key: string, defaultValue: any = ''): any {
        return this.configs[providerName]?.[key] ?? defaultValue;
    }

    /**
     * 更新配置值
     */
    updateConfigValue(providerName: string, key: string, value: any): void {
        if (!this.configs[providerName]) {
            this.configs[providerName] = {};
        }
        this.configs[providerName][key] = value;
    }

    /**
     * 切换密码字段可见性
     */
    togglePasswordVisibility(providerName: string, fieldKey: string): void {
        if (!this.passwordVisibility[providerName]) {
            this.passwordVisibility[providerName] = {};
        }
        this.passwordVisibility[providerName][fieldKey] = !this.passwordVisibility[providerName][fieldKey];
    }

    /**
     * 获取密码字段可见性状态
     */
    isPasswordVisible(providerName: string, fieldKey: string): boolean {
        return this.passwordVisibility[providerName]?.[fieldKey] ?? false;
    }

    /**
     * 验证 API Key 格式
     */
    validateApiKeyFormat(providerName: string, apiKey: string): { valid: boolean; message: string } {
        if (!apiKey || apiKey.trim().length === 0) {
            return { valid: false, message: this.t?.providers?.apiKeyRequired || 'API Key 不能为空' };
        }

        const pattern = this.apiKeyPatterns[providerName];
        if (pattern && !pattern.test(apiKey)) {
            const hints: { [key: string]: string } = {
                'openai': 'OpenAI API Key 应以 sk- 开头',
                'anthropic': 'Anthropic API Key 应以 sk-ant- 开头',
                'minimax': 'Minimax API Key 应为 32 位以上的字母数字',
                'glm': 'GLM API Key 格式不正确'
            };
            return { valid: false, message: hints[providerName] || 'API Key 格式可能不正确' };
        }

        return { valid: true, message: '' };
    }

    /**
     * 获取输入框的验证状态类
     */
    getInputValidationClass(providerName: string, fieldKey: string): string {
        if (fieldKey !== 'apiKey') return '';

        const value = this.configs[providerName]?.[fieldKey];
        if (!value || value.trim().length === 0) return '';

        const result = this.validateApiKeyFormat(providerName, value);
        return result.valid ? 'is-valid' : 'is-invalid';
    }
}
