import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { BaseAiProvider, ProviderManager, ProviderInfo, ProviderEvent, HealthStatus } from '../../types/provider.types';
import { LoggerService } from './logger.service';

/**
 * 健康检查缓存项
 */
interface HealthCheckCacheItem {
    status: HealthStatus;
    latency: number;
    timestamp: number;
}

/**
 * AI提供商管理器
 * 负责注册、管理和切换不同的AI提供商
 */
@Injectable({ providedIn: 'root' })
export class AiProviderManagerService implements ProviderManager {
    private providers = new Map<string, BaseAiProvider>();
    private activeProvider: string | null = null;
    private eventSubject = new Subject<ProviderEvent>();

    // 健康检查缓存
    private healthCache = new Map<string, HealthCheckCacheItem>();
    private readonly HEALTH_CACHE_TTL = 60000; // 缓存有效期：60秒
    private readonly HEALTH_CHECK_TIMEOUT = 10000; // 健康检查超时：10秒

    // 正在进行的健康检查（防止并发重复检查）
    private pendingHealthChecks = new Map<string, Promise<HealthStatus>>();

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
     * 检查所有提供商健康状态（使用缓存）
     */
    async checkAllProvidersHealth(forceRefresh: boolean = false): Promise<{ provider: string; status: HealthStatus; latency?: number; cached?: boolean }[]> {
        const results: { provider: string; status: HealthStatus; latency?: number; cached?: boolean }[] = [];

        // 并行执行所有健康检查
        const checks = Array.from(this.providers.entries()).map(async ([name, provider]) => {
            const healthStatus = await this.getProviderHealthStatus(name, forceRefresh);
            const cachedItem = this.healthCache.get(name);

            return {
                provider: name,
                status: healthStatus,
                latency: cachedItem?.latency,
                cached: cachedItem && !forceRefresh && (Date.now() - cachedItem.timestamp) < this.HEALTH_CACHE_TTL
            };
        });

        const settledResults = await Promise.allSettled(checks);

        for (const result of settledResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
        }

        return results;
    }

    /**
     * 获取单个提供商的健康状态（使用缓存）
     */
    async getProviderHealthStatus(providerName: string, forceRefresh: boolean = false): Promise<HealthStatus> {
        const provider = this.providers.get(providerName);
        if (!provider) {
            return HealthStatus.UNHEALTHY;
        }

        // 检查缓存是否有效
        if (!forceRefresh) {
            const cached = this.healthCache.get(providerName);
            if (cached && (Date.now() - cached.timestamp) < this.HEALTH_CACHE_TTL) {
                this.logger.debug(`Health check cache hit for ${providerName}`);
                return cached.status;
            }
        }

        // 检查是否已有正在进行的健康检查
        if (this.pendingHealthChecks.has(providerName)) {
            this.logger.debug(`Health check already in progress for ${providerName}`);
            return this.pendingHealthChecks.get(providerName)!;
        }

        // 执行新的健康检查
        const healthCheckPromise = this.executeHealthCheck(provider);
        this.pendingHealthChecks.set(providerName, healthCheckPromise);

        try {
            const status = await Promise.race([
                healthCheckPromise,
                new Promise<HealthStatus>(resolve => {
                    setTimeout(() => resolve(HealthStatus.DEGRADED), this.HEALTH_CHECK_TIMEOUT);
                })
            ]);

            // 更新缓存
            this.updateHealthCache(providerName, status);

            return status;
        } finally {
            this.pendingHealthChecks.delete(providerName);
        }
    }

    /**
     * 执行健康检查（内部方法）
     */
    private async executeHealthCheck(provider: BaseAiProvider): Promise<HealthStatus> {
        const start = Date.now();
        try {
            const status = await provider.healthCheck();
            const latency = Date.now() - start;
            this.logger.debug(`Health check completed for ${provider.name}`, { status, latency });
            return status;
        } catch (error) {
            this.logger.warn(`Health check failed for ${provider.name}`, error);
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 更新健康检查缓存
     */
    private updateHealthCache(providerName: string, status: HealthStatus): void {
        const provider = this.providers.get(providerName);
        if (!provider) return;

        const cachedItem = this.healthCache.get(providerName);
        this.healthCache.set(providerName, {
            status,
            latency: cachedItem?.latency || 0,
            timestamp: Date.now()
        });
    }

    /**
     * 清除健康检查缓存
     */
    clearHealthCache(): void {
        this.healthCache.clear();
        this.logger.info('Health check cache cleared');
    }

    /**
     * 清除指定提供商的健康检查缓存
     */
    clearProviderHealthCache(providerName: string): void {
        this.healthCache.delete(providerName);
        this.logger.debug(`Health check cache cleared for ${providerName}`);
    }

    /**
     * 获取健康检查缓存状态
     */
    getHealthCacheStatus(): { provider: string; cached: boolean; age: number }[] {
        const now = Date.now();
        return Array.from(this.healthCache.entries()).map(([name, item]) => ({
            provider: name,
            cached: true,
            age: now - item.timestamp
        }));
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
        providers: { name: string; enabled: boolean; healthy: boolean; cached?: boolean }[];
    } {
        const providers = this.getAllProviders();
        return {
            totalProviders: providers.length,
            enabledProviders: this.getEnabledProviders().length,
            activeProvider: this.activeProvider,
            providers: providers.map(p => {
                const cached = this.healthCache.get(p.name);
                return {
                    name: p.name,
                    enabled: p.getConfig()?.enabled !== false,
                    healthy: cached?.status === HealthStatus.HEALTHY,
                    cached: !!cached
                };
            })
        };
    }

    /**
     * 重置所有提供商
     */
    reset(): void {
        this.providers.clear();
        this.activeProvider = null;
        this.healthCache.clear();
        this.pendingHealthChecks.clear();
        this.logger.info('All providers reset');
    }
}
