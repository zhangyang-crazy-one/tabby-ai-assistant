import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { BaseAiProvider, ProviderManager, ProviderInfo, ProviderEvent } from '../../types/provider.types';
import { LoggerService } from './logger.service';

/**
 * AI提供商管理器
 * 负责注册、管理和切换不同的AI提供商
 */
@Injectable({ providedIn: 'root' })
export class AiProviderManagerService implements ProviderManager {
    private providers = new Map<string, BaseAiProvider>();
    private activeProvider: string | null = null;
    private eventSubject = new Subject<ProviderEvent>();

    constructor(private logger: LoggerService) {}

    /**
     * 注册AI提供商
     */
    registerProvider(provider: BaseAiProvider): void {
        if (this.providers.has(provider.name)) {
            this.logger.warn(`Provider ${provider.name} is already registered, replacing...`);
        }

        this.providers.set(provider.name, provider);
        this.logger.info(`Provider registered: ${provider.name}`);

        // 如果没有激活的提供商，自动设置第一个为默认
        if (!this.activeProvider) {
            this.setActiveProvider(provider.name);
        }

        // 发送事件
        this.emitEvent({
            type: 'config_changed',
            provider: provider.name,
            timestamp: new Date()
        });
    }

    /**
     * 注销AI提供商
     */
    unregisterProvider(name: string): void {
        if (!this.providers.has(name)) {
            this.logger.warn(`Provider ${name} not found, cannot unregister`);
            return;
        }

        this.providers.delete(name);

        // 如果删除的是当前激活的提供商，切换到其他提供商
        if (this.activeProvider === name) {
            const remainingProviders = Array.from(this.providers.keys());
            if (remainingProviders.length > 0) {
                this.setActiveProvider(remainingProviders[0]);
            } else {
                this.activeProvider = null;
            }
        }

        this.logger.info(`Provider unregistered: ${name}`);
    }

    /**
     * 获取指定提供商
     */
    getProvider(name: string): BaseAiProvider | undefined {
        return this.providers.get(name);
    }

    /**
     * 获取所有提供商
     */
    getAllProviders(): BaseAiProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * 获取当前激活的提供商
     */
    getActiveProvider(): BaseAiProvider | undefined {
        if (!this.activeProvider) {
            return undefined;
        }
        return this.providers.get(this.activeProvider);
    }

    /**
     * 设置激活的提供商
     */
    setActiveProvider(name: string): boolean {
        if (!this.providers.has(name)) {
            this.logger.error(`Provider ${name} not found`);
            return false;
        }

        const previousProvider = this.activeProvider;
        this.activeProvider = name;

        this.logger.info(`Active provider changed: ${previousProvider} -> ${name}`);

        // 发送事件
        this.emitEvent({
            type: 'config_changed',
            provider: name,
            timestamp: new Date()
        });

        return true;
    }

    /**
     * 获取提供商信息
     */
    getProviderInfo(name: string): ProviderInfo | undefined {
        const provider = this.providers.get(name);
        return provider ? provider.getInfo() : undefined;
    }

    /**
     * 获取所有提供商信息
     */
    getAllProviderInfo(): ProviderInfo[] {
        return this.getAllProviders().map(provider => provider.getInfo());
    }

    /**
     * 检查提供商是否存在
     */
    hasProvider(name: string): boolean {
        return this.providers.has(name);
    }

    /**
     * 获取提供商数量
     */
    getProviderCount(): number {
        return this.providers.size;
    }

    /**
     * 获取当前激活的提供商名称
     */
    getActiveProviderName(): string | null {
        return this.activeProvider;
    }

    /**
     * 验证所有提供商配置
     */
    async validateAllProviders(): Promise<{ name: string; valid: boolean; errors: string[] }[]> {
        const results: { name: string; valid: boolean; errors: string[] }[] = [];

        for (const [name, provider] of this.providers) {
            try {
                const validation = provider.validateConfig();
                results.push({
                    name,
                    valid: validation.valid,
                    errors: validation.errors || []
                });
            } catch (error) {
                results.push({
                    name,
                    valid: false,
                    errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
                });
            }
        }

        return results;
    }

    /**
     * 检查所有提供商健康状态
     */
    async checkAllProvidersHealth(): Promise<{ provider: string; status: string; latency?: number }[]> {
        const results: { provider: string; status: string; latency?: number }[] = [];

        for (const [name, provider] of this.providers) {
            try {
                const start = Date.now();
                const health = await provider.healthCheck();
                const latency = Date.now() - start;

                results.push({
                    provider: name,
                    status: health,
                    latency
                });
            } catch (error) {
                results.push({
                    provider: name,
                    status: 'unhealthy'
                });
            }
        }

        return results;
    }

    /**
     * 获取启用的提供商
     */
    getEnabledProviders(): BaseAiProvider[] {
        return this.getAllProviders().filter(provider => {
            const config = provider.getConfig();
            return config?.enabled !== false;
        });
    }

    /**
     * 获取启用的提供商名称
     */
    getEnabledProviderNames(): string[] {
        return this.getEnabledProviders().map(p => p.name);
    }

    /**
     * 切换到下一个启用的提供商
     */
    switchToNextProvider(): boolean {
        const enabledProviders = this.getEnabledProviders();
        if (enabledProviders.length === 0) {
            return false;
        }

        const currentIndex = enabledProviders.findIndex(p => p.name === this.activeProvider);
        const nextIndex = (currentIndex + 1) % enabledProviders.length;
        const nextProvider = enabledProviders[nextIndex];

        return this.setActiveProvider(nextProvider.name);
    }

    /**
     * 切换到上一个启用的提供商
     */
    switchToPreviousProvider(): boolean {
        const enabledProviders = this.getEnabledProviders();
        if (enabledProviders.length === 0) {
            return false;
        }

        const currentIndex = enabledProviders.findIndex(p => p.name === this.activeProvider);
        const prevIndex = currentIndex === 0 ? enabledProviders.length - 1 : currentIndex - 1;
        const prevProvider = enabledProviders[prevIndex];

        return this.setActiveProvider(prevProvider.name);
    }

    /**
     * 订阅提供商事件
     */
    onEvent(): Observable<ProviderEvent> {
        return this.eventSubject.asObservable();
    }

    /**
     * 获取所有启用的提供商中性能最好的（延迟最低）
     */
    async getBestPerformingProvider(): Promise<BaseAiProvider | null> {
        const healthStatus = await this.checkAllProvidersHealth();
        const healthyProviders = healthStatus
            .filter(h => h.status === 'healthy')
            .sort((a, b) => (a.latency || 0) - (b.latency || 0));

        if (healthyProviders.length === 0) {
            return null;
        }

        const bestProviderName = healthyProviders[0].provider;
        return this.providers.get(bestProviderName) || null;
    }

    /**
     * 发送事件
     */
    private emitEvent(event: ProviderEvent): void {
        this.eventSubject.next(event);
    }

    /**
     * 获取提供商统计信息
     */
    getStats(): {
        totalProviders: number;
        enabledProviders: number;
        activeProvider: string | null;
        providers: { name: string; enabled: boolean; healthy: boolean }[];
    } {
        const providers = this.getAllProviders();
        return {
            totalProviders: providers.length,
            enabledProviders: this.getEnabledProviders().length,
            activeProvider: this.activeProvider,
            providers: providers.map(p => ({
                name: p.name,
                enabled: p.getConfig()?.enabled !== false,
                healthy: true // TODO: 实现健康检查缓存
            }))
        };
    }

    /**
     * 重置所有提供商
     */
    reset(): void {
        this.providers.clear();
        this.activeProvider = null;
        this.logger.info('All providers reset');
    }
}
