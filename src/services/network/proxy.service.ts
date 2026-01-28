import { Injectable } from '@angular/core';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { ConfigProviderService } from '../core/config-provider.service';
import { LoggerService } from '../core/logger.service';
import { ProxyConfig, DEFAULT_PROXY_CONFIG, ProxyTestResult } from '../../types/proxy.types';

/**
 * 代理服务
 * 提供统一的代理配置管理和 HTTP 代理支持
 */
@Injectable({ providedIn: 'root' })
export class ProxyService {
    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService
    ) {}

    /**
     * 获取代理配置
     */
    getProxyConfig(): ProxyConfig {
        const savedConfig = this.config.get<ProxyConfig>('proxy');
        return savedConfig ? { ...DEFAULT_PROXY_CONFIG, ...savedConfig } : { ...DEFAULT_PROXY_CONFIG };
    }

    /**
     * 检查是否应该绕过代理
     */
    shouldBypassProxy(url: string): boolean {
        const proxyConfig = this.getProxyConfig();
        if (!proxyConfig.enabled) return true;

        const noProxy = proxyConfig.noProxy || [];
        const hostname = this.extractHostname(url);

        return noProxy.some(pattern => {
            if (pattern.startsWith('*.')) {
                // 通配符匹配 *.local -> localhost, foo.local
                const suffix = pattern.slice(1);
                return hostname.endsWith(suffix) || hostname === suffix.slice(1);
            }
            return hostname === pattern || hostname.endsWith('.' + pattern);
        });
    }

    /**
     * 获取 HTTP/HTTPS Agent 用于 axios
     * 返回适用于 axios 的代理配置对象
     */
    getAxiosProxyConfig(url: string): { httpAgent?: HttpAgent; httpsAgent?: HttpsAgent } {
        const proxyConfig = this.getProxyConfig();

        if (!proxyConfig.enabled || this.shouldBypassProxy(url)) {
            return {};
        }

        const isHttps = url.startsWith('https://');
        const proxyUrl = isHttps
            ? (proxyConfig.httpsProxy || proxyConfig.httpProxy)
            : proxyConfig.httpProxy;

        if (!proxyUrl) {
            return {};
        }

        const options = this.buildProxyOptions(proxyUrl, proxyConfig);

        // 动态导入代理 agent
        if (isHttps) {
            return { httpsAgent: this.createHttpsProxyAgent(proxyUrl, options) };
        } else {
            return { httpAgent: this.createHttpProxyAgent(proxyUrl, options) };
        }
    }

    /**
     * 获取 fetch 使用的代理选项 (Electron 环境)
     * 注意：原生 fetch 不支持代理，需要使用 node-fetch 或 agent
     */
    getFetchProxyAgent(url: string): HttpsAgent | HttpAgent | undefined {
        const proxyConfig = this.getProxyConfig();

        if (!proxyConfig.enabled || this.shouldBypassProxy(url)) {
            return undefined;
        }

        const isHttps = url.startsWith('https://');
        const proxyUrl = isHttps
            ? (proxyConfig.httpsProxy || proxyConfig.httpProxy)
            : proxyConfig.httpProxy;

        if (!proxyUrl) {
            return undefined;
        }

        const options = this.buildProxyOptions(proxyUrl, proxyConfig);

        if (isHttps) {
            return this.createHttpsProxyAgent(proxyUrl, options);
        } else {
            return this.createHttpProxyAgent(proxyUrl, options);
        }
    }

    /**
     * 创建 HTTP 代理 Agent
     */
    private createHttpProxyAgent(proxyUrl: string, options: any): HttpAgent {
        // 使用 http-proxy-agent
        try {
            const HttpProxyAgent = require('http-proxy-agent');
            return new HttpProxyAgent(proxyUrl, options) as HttpAgent;
        } catch {
            // 回退到简单实现
            return new HttpAgent(options) as HttpAgent;
        }
    }

    /**
     * 创建 HTTPS 代理 Agent
     */
    private createHttpsProxyAgent(proxyUrl: string, options: any): HttpsAgent {
        // 使用 https-proxy-agent
        try {
            const HttpsProxyAgent = require('https-proxy-agent');
            return new HttpsProxyAgent(proxyUrl, options) as HttpsAgent;
        } catch {
            // 回退到简单实现
            return new HttpsAgent(options) as HttpsAgent;
        }
    }

    /**
     * 构建代理选项
     */
    private buildProxyOptions(proxyUrl: string, proxyConfig: ProxyConfig): any {
        const options: any = {};
        // 添加认证信息
        if (proxyConfig.auth?.username) {
            options.auth = `${proxyConfig.auth.username}:${proxyConfig.auth.password || ''}`;
        }
        return options;
    }

    /**
     * 提取主机名
     */
    private extractHostname(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    /**
     * 验证代理配置
     */
    validateProxyUrl(proxyUrl: string): { valid: boolean; message: string } {
        if (!proxyUrl || proxyUrl.trim() === '') {
            return { valid: true, message: '' };
        }
        try {
            const url = new URL(proxyUrl);
            const validProtocols = ['http:', 'https:', 'socks5:', 'socks4:'];

            if (!validProtocols.includes(url.protocol)) {
                return {
                    valid: false,
                    message: `不支持的协议: ${url.protocol}。支持: http, https, socks5`
                };
            }
            return { valid: true, message: '代理地址格式正确' };
        } catch {
            return { valid: false, message: '无效的代理地址格式' };
        }
    }

    /**
     * 测试代理连接
     */
    async testProxyConnection(proxyUrl: string): Promise<ProxyTestResult> {
        const testUrl = 'https://api.openai.com/v1/models';
        const startTime = Date.now();

        try {
            const agent = this.createHttpsProxyAgent(proxyUrl, {});

            // 使用 Node.js https 模块测试
            const https = require('https');

            return new Promise((resolve) => {
                const req = https.get(testUrl, { agent, timeout: 10000 }, (res: any) => {
                    const latency = Date.now() - startTime;
                    resolve({
                        success: res.statusCode < 500,
                        message: `连接成功 (${res.statusCode})`,
                        latency
                    });
                });

                req.on('error', (err: Error) => {
                    resolve({
                        success: false,
                        message: `连接失败: ${err.message}`
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        message: '连接超时'
                    });
                });
            });
        } catch (error) {
            return {
                success: false,
                message: `测试失败: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * 从环境变量导入代理配置
     */
    importFromEnv(): ProxyConfig {
        const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || '';
        const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
        const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';

        const proxyConfig: ProxyConfig = {
            enabled: !!(httpProxy || httpsProxy),
            httpProxy,
            httpsProxy,
            noProxy: noProxy.split(',').map(s => s.trim()).filter(s => s),
            auth: undefined
        };

        this.logger.info('Proxy config imported from environment', { proxyConfig });
        return proxyConfig;
    }

    /**
     * 保存代理配置
     */
    saveProxyConfig(config: ProxyConfig): void {
        this.config.set('proxy', config);
        this.logger.info('Proxy configuration saved', { enabled: config.enabled });
    }
}
