/**
 * 代理配置类型定义
 */

/**
 * 代理配置接口
 */
export interface ProxyConfig {
    /** 是否启用代理 */
    enabled: boolean;

    /** HTTP 代理地址 (例如: http://127.0.0.1:7890) */
    httpProxy?: string;

    /** HTTPS 代理地址 (例如: http://127.0.0.1:7890) */
    httpsProxy?: string;

    /** 不使用代理的地址列表 (例如: localhost, 127.0.0.1, *.local) */
    noProxy?: string[];

    /** 代理认证信息 (可选) */
    auth?: ProxyAuthConfig;
}

/**
 * 代理认证配置
 */
export interface ProxyAuthConfig {
    username: string;
    password: string;
}

/**
 * 默认代理配置
 */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
    enabled: false,
    httpProxy: '',
    httpsProxy: '',
    noProxy: ['localhost', '127.0.0.1', '::1', '*.local'],
    auth: undefined
};

/**
 * 代理测试结果
 */
export interface ProxyTestResult {
    success: boolean;
    message: string;
    latency?: number;
}
