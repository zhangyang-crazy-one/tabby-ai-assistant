/**
 * 主题服务 - 统一管理所有 AI 助手主题
 * 通过动态 <style> 注入实现主题切换
 */
import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ConfigService } from 'tabby-core';
import { ConfigProviderService } from './config-provider.service';

export type ThemeType = 'auto' | 'light' | 'dark' | 'pixel' | 'tech' | 'parchment';

// 主题变量定义
const THEME_VARIABLES: Record<Exclude<ThemeType, 'auto'>, Record<string, string>> = {
    light: {
        // 主色调
        'ai-primary': '#007bff',
        'ai-primary-hover': '#0056b3',
        'ai-secondary': '#6c757d',
        'ai-success': '#28a745',
        'ai-warning': '#ffc107',
        'ai-danger': '#dc3545',
        'ai-info': '#17a2b8',
        // 风险级别颜色
        'ai-risk-low': '#28a745',
        'ai-risk-medium': '#ffc107',
        'ai-risk-high': '#fd7e14',
        'ai-risk-critical': '#dc3545',
        // 聊天消息颜色
        'ai-user-message': '#e3f2fd',
        'ai-assistant-message': '#f5f5f5',
        'ai-system-message': '#fff3cd',
        // 背景和边框
        'ai-bg-primary': '#ffffff',
        'ai-bg-secondary': '#f8f9fa',
        'ai-bg-tertiary': '#e9ecef',
        'ai-text-primary': '#212529',
        'ai-text-secondary': '#6c757d',
        'ai-border': '#dee2e6',
        'ai-border-radius': '0.375rem',
        'ai-box-shadow': '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',
        // 字体
        'ai-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        'ai-font-size-base': '14px',
        // 其他
        'ai-dark': '#212529',
        'ai-light': '#f8f9fa',
        'ai-transition-duration': '0.3s'
    },
    dark: {
        // 主色调 - 更深沉的深色主题
        'ai-primary': '#60a5fa',
        'ai-primary-hover': '#93c5fd',
        'ai-secondary': '#9ca3af',
        'ai-success': '#34d399',
        'ai-warning': '#fbbf24',
        'ai-danger': '#f87171',
        'ai-info': '#22d3ee',
        // 风险级别颜色
        'ai-risk-low': '#34d399',
        'ai-risk-medium': '#fbbf24',
        'ai-risk-high': '#fb923c',
        'ai-risk-critical': '#f87171',
        // 聊天消息颜色
        'ai-user-message': '#1e3a5f',
        'ai-assistant-message': '#1f2937',
        'ai-system-message': '#374151',
        // 背景和边框 - 更深的配色
        'ai-bg-primary': '#0d0d14',
        'ai-bg-secondary': '#12121a',
        'ai-bg-tertiary': '#1e1e2e',
        'ai-text-primary': '#f1f5f9',
        'ai-text-secondary': '#94a3b8',
        'ai-border': '#2d2d3d',
        'ai-border-radius': '0.375rem',
        'ai-box-shadow': '0 0.125rem 0.25rem rgba(0, 0, 0, 0.4)',
        // 字体
        'ai-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        'ai-font-size-base': '14px',
        // 其他
        'ai-dark': '#0d0d14',
        'ai-light': '#f1f5f9',
        'ai-transition-duration': '0.3s'
    },
    pixel: {
        // 主色调 - 经典 GameBoy 绿
        'ai-primary': '#9bbc0f',
        'ai-primary-hover': '#8bac0f',
        'ai-secondary': '#306230',
        'ai-success': '#9bbc0f',
        'ai-warning': '#ffeb3b',
        'ai-danger': '#f44336',
        'ai-info': '#03a9f4',
        // 风险级别颜色
        'ai-risk-low': '#9bbc0f',
        'ai-risk-medium': '#ffeb3b',
        'ai-risk-high': '#ff9800',
        'ai-risk-critical': '#f44336',
        // 聊天消息颜色
        'ai-user-message': '#0f380f',
        'ai-assistant-message': '#306230',
        'ai-system-message': '#1a1a1a',
        // 背景和边框
        'ai-bg-primary': '#0f380f',
        'ai-bg-secondary': '#1a2a1a',
        'ai-bg-tertiary': '#306230',
        'ai-text-primary': '#9bbc0f',
        'ai-text-secondary': '#8bac0f',
        'ai-border': '#9bbc0f',
        'ai-border-radius': '0',
        'ai-box-shadow': '4px 4px 0 rgba(15, 56, 15, 0.8)',
        // 字体 - 像素风格
        'ai-font-family': "'Courier New', 'Press Start 2P', monospace",
        'ai-font-size-base': '12px',
        // 其他
        'ai-dark': '#0f380f',
        'ai-light': '#306230',
        'ai-transition-duration': '0s'
    },
    tech: {
        // 主色调 - 霓虹赛博朋克
        'ai-primary': '#00fff9',
        'ai-primary-hover': '#00e6e0',
        'ai-secondary': '#adb5bd',
        'ai-success': '#00ff88',
        'ai-warning': '#ff00ff',
        'ai-danger': '#ff3366',
        'ai-info': '#00bfff',
        // 风险级别颜色
        'ai-risk-low': '#00ff88',
        'ai-risk-medium': '#ff00ff',
        'ai-risk-high': '#ff6600',
        'ai-risk-critical': '#ff3366',
        // 聊天消息颜色
        'ai-user-message': 'rgba(0, 255, 249, 0.1)',
        'ai-assistant-message': 'rgba(255, 0, 255, 0.1)',
        'ai-system-message': 'rgba(0, 255, 136, 0.1)',
        // 背景和边框
        'ai-bg-primary': '#0a0a0f',
        'ai-bg-secondary': '#12121a',
        'ai-bg-tertiary': '#1a1a2e',
        'ai-text-primary': '#00fff9',
        'ai-text-secondary': 'rgba(0, 255, 249, 0.7)',
        'ai-border': 'rgba(0, 255, 249, 0.3)',
        'ai-border-radius': '4px',
        'ai-box-shadow': '0 0 20px rgba(0, 255, 249, 0.2)',
        // 字体 - 科幻感
        'ai-font-family': "'Segoe UI', 'Share Tech Mono', monospace",
        'ai-font-size-base': '14px',
        // 其他
        'ai-dark': '#0a0a0f',
        'ai-light': '#12121a',
        'ai-transition-duration': '0.3s'
    },
    parchment: {
        // 做旧羊皮卷 (Parchment) 主题
        // 主色调 - 棕红色强调
        'ai-primary': '#8b4513',
        'ai-primary-hover': '#a0522d',
        'ai-secondary': '#6b5344',
        'ai-success': '#5d8a4d',
        'ai-warning': '#c9a227',
        'ai-danger': '#b84c4c',
        'ai-info': '#6b8e9f',
        // 风险级别颜色
        'ai-risk-low': '#5d8a4d',
        'ai-risk-medium': '#c9a227',
        'ai-risk-high': '#d4763a',
        'ai-risk-critical': '#b84c4c',
        // 聊天消息颜色 - 做旧质感
        'ai-user-message': '#e8d4a8',
        'ai-assistant-message': '#fff8e7',
        'ai-system-message': '#dcc78e',
        // 背景和边框 - 羊皮纸质感
        'ai-bg-primary': '#f5e6c8',
        'ai-bg-secondary': '#e8d4a8',
        'ai-bg-tertiary': '#dcc78e',
        'ai-text-primary': '#3d2e1c',
        'ai-text-secondary': '#5c4a32',
        'ai-text-muted': '#8a7355',
        'ai-border': '#c9b896',
        'ai-border-radius': '2px',
        'ai-box-shadow': '0 2px 8px rgba(61, 46, 28, 0.15)',
        // 字体
        'ai-font-family': "'Georgia', 'Times New Roman', serif",
        'ai-font-size-base': '14px',
        // 其他
        'ai-dark': '#3d2e1c',
        'ai-light': '#f5e6c8',
        'ai-transition-duration': '0.3s',
        // 羊皮卷特有 - 代码块背景
        'ai-code-bg': '#f0e0c0',
        // 滚动条
        'ai-scrollbar': '#c9b896',
        'ai-scrollbar-thumb': '#a08060'
    }
};

@Injectable({
    providedIn: 'root'
})
export class ThemeService implements OnDestroy {
    private currentTheme$ = new Subject<ThemeType>();
    private tabbySubscription?: Subscription;
    private styleElement: HTMLStyleElement;
    readonly theme$ = this.currentTheme$.asObservable();

    private readonly allThemeClasses = [
        'ai-theme-auto', 'ai-theme-light', 'ai-theme-dark',
        'ai-theme-pixel', 'ai-theme-tech', 'ai-theme-parchment'
    ];

    // AI 助手容器选择器
    private readonly containerSelectors = [
        '.ai-chat-interface',
        '.ai-settings-tab',
        '.ai-assistant',
        '.ai-sidebar-container',
        '.ai-chat-modal-left'
    ];

    constructor(
        private config: ConfigProviderService,
        private tabbyConfig: ConfigService
    ) {
        // 创建并注入动态样式元素
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'ai-assistant-dynamic-theme';
        document.head.appendChild(this.styleElement);

        this.init();
    }

    private init(): void {
        const savedTheme = this.config.get<string>('theme', 'auto') as ThemeType;
        this.setTheme(savedTheme);

        // 监听 Tabby 主题变化（带防抖）
        this.tabbySubscription = this.tabbyConfig.changed$.pipe(
            debounceTime(100)
        ).subscribe(() => {
            const currentTheme = this.config.get<string>('theme', 'auto');
            if (currentTheme === 'auto') {
                this.applyTheme('auto');
            }
        });
    }

    /**
     * 获取当前主题
     */
    getCurrentTheme(): ThemeType {
        return this.config.get<string>('theme', 'auto') as ThemeType;
    }

    /**
     * 设置并应用主题
     */
    setTheme(theme: ThemeType): void {
        this.config.set('theme', theme);
        this.applyTheme(theme);
    }

    /**
     * 核心方法：动态注入主题样式
     */
    applyTheme(theme: ThemeType): void {
        this.currentTheme$.next(theme);

        // 确定实际生效的主题
        let effectiveTheme: ThemeType = theme;
        if (theme === 'auto') {
            effectiveTheme = this.getTabbyEffectiveTheme();
        }

        // 1. 生成 CSS 变量样式
        const cssVariables = this.buildCssVariables(effectiveTheme);
        // 2. 生成主题特定样式
        const themeStyles = this.buildThemeStyles(effectiveTheme);
        // 3. 注入完整样式到 DOM
        this.styleElement.innerHTML = `
/* AI Assistant Dynamic Theme - ${theme} (effective: ${effectiveTheme}) */
:root,
html,
body,
${this.containerSelectors.join(',\n')} {
${cssVariables}
}
${themeStyles}
        `.trim();

        // 4. 更新类名和 data 属性
        this.updateBodyClasses(theme, effectiveTheme);

        // 5. 触发自定义事件
        window.dispatchEvent(new CustomEvent('ai-theme-changed', {
            detail: { theme, effectiveTheme }
        }));

        console.log('[ThemeService] Theme applied dynamically:', { theme, effectiveTheme });
    }

    /**
     * 生成 CSS 变量字符串
     */
    private buildCssVariables(theme: ThemeType): string {
        const vars = THEME_VARIABLES[theme] || THEME_VARIABLES.dark;
        return Object.entries(vars)
            .map(([key, value]) => `    --${key}: ${value} !important;`)
            .join('\n');
    }

    /**
     * 生成主题特定样式（像素风格、科技风格等）
     */
    private buildThemeStyles(theme: ThemeType): string {
        if (theme === 'pixel') {
            return `
/* Pixel theme specific styles */
${this.containerSelectors.join(',\n')} {
    /* 按钮像素化 */
    .btn {
        border: 3px solid var(--ai-border) !important;
        border-radius: 0 !important;
        box-shadow: 4px 4px 0 var(--ai-bg-tertiary) !important;
        font-family: var(--ai-font-family) !important;
        transition: none !important;
    }

    .btn:active {
        box-shadow: none !important;
        transform: translate(4px, 4px) !important;
    }

    /* 输入框 */
    input,
    textarea,
    .form-control {
        border: 3px solid var(--ai-border) !important;
        border-radius: 0 !important;
        background: var(--ai-bg-primary) !important;
        color: var(--ai-text-primary) !important;
        font-family: var(--ai-font-family) !important;
    }

    input:focus,
    textarea:focus,
    .form-control:focus {
        outline: none !important;
        border-color: var(--ai-primary) !important;
        box-shadow: 4px 4px 0 var(--ai-bg-tertiary) !important;
    }

    /* 聊天气泡 */
    .message-bubble {
        border: 3px solid var(--ai-border) !important;
        border-radius: 0 !important;
    }

    /* 标题 */
    h2, h3, h4 {
        font-family: var(--ai-font-family) !important;
        letter-spacing: 1px !important;
    }
}
            `.trim();
        }

        if (theme === 'tech') {
            return `
/* Tech theme specific styles */
${this.containerSelectors.join(',\n')} {
    /* 扫描线背景 */
    background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 255, 249, 0.03) 2px,
        rgba(0, 255, 249, 0.03) 4px
    ) !important;

    /* 发光按钮 */
    .btn {
        background: linear-gradient(135deg, var(--ai-bg-secondary) 0%, var(--ai-bg-tertiary) 100%) !important;
        border: 1px solid var(--ai-primary) !important;
        color: var(--ai-text-primary) !important;
        box-shadow:
            0 0 10px rgba(0, 255, 249, 0.2),
            inset 0 0 10px rgba(0, 255, 249, 0.05) !important;
    }

    .btn:hover {
        box-shadow:
            0 0 20px rgba(0, 255, 249, 0.4),
            inset 0 0 20px rgba(0, 255, 249, 0.1) !important;
    }

    /* 发光输入框 */
    input,
    textarea,
    .form-control {
        border: 1px solid var(--ai-primary) !important;
        background: var(--ai-bg-primary) !important;
        color: var(--ai-text-primary) !important;
        box-shadow: 0 0 10px rgba(0, 255, 249, 0.1) !important;
    }

    input:focus,
    textarea:focus,
    .form-control:focus {
        outline: none !important;
        border-color: var(--ai-primary) !important;
        box-shadow:
            0 0 20px rgba(0, 255, 249, 0.3),
            inset 0 0 10px rgba(0, 255, 249, 0.05) !important;
    }

    /* 霓虹标题 */
    h2, h3, h4 {
        text-shadow:
            0 0 10px var(--ai-primary),
            0 0 20px var(--ai-primary) !important;
    }

    /* 滚动条 */
    ::-webkit-scrollbar {
        width: 8px !important;
        background: var(--ai-bg-secondary) !important;
    }

    ::-webkit-scrollbar-thumb {
        background: var(--ai-primary) !important;
        border-radius: 0 !important;
        box-shadow: 0 0 10px var(--ai-primary) !important;
    }
}
            `.trim();
        }

        if (theme === 'parchment') {
            return `
/* Parchment theme specific styles - 做旧羊皮卷风格 */
${this.containerSelectors.join(',\n')} {
    /* 纸张纹理背景效果 */
    background: var(--ai-bg-primary) !important;

    /* 复古边框效果 */
    .btn {
        background: linear-gradient(180deg, var(--ai-bg-secondary) 0%, var(--ai-bg-tertiary) 100%) !important;
        border: 2px solid var(--ai-border) !important;
        color: var(--ai-text-primary) !important;
        border-radius: var(--ai-border-radius) !important;
        font-family: var(--ai-font-family) !important;
        box-shadow:
            0 2px 4px rgba(61, 46, 28, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
    }

    .btn:hover {
        background: linear-gradient(180deg, var(--ai-bg-tertiary) 0%, var(--ai-bg-secondary) 100%) !important;
        border-color: var(--ai-primary) !important;
        box-shadow:
            0 4px 8px rgba(61, 46, 28, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
    }

    /* 做旧输入框 */
    input,
    textarea,
    .form-control {
        border: 2px solid var(--ai-border) !important;
        border-radius: var(--ai-border-radius) !important;
        background: var(--ai-bg-primary) !important;
        color: var(--ai-text-primary) !important;
        font-family: var(--ai-font-family) !important;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05) !important;
    }

    input:focus,
    textarea:focus,
    .form-control:focus {
        outline: none !important;
        border-color: var(--ai-primary) !important;
        box-shadow:
            0 0 0 3px rgba(139, 69, 19, 0.1),
            inset 0 2px 4px rgba(0, 0, 0, 0.05) !important;
    }

    /* 聊天气泡做旧效果 */
    .message-bubble,
    .message-content {
        border-radius: var(--ai-border-radius) !important;
        font-family: var(--ai-font-family) !important;
    }

    .message-item.user .message-bubble {
        background: var(--ai-user-message) !important;
        border: 1px solid var(--ai-border) !important;
    }

    .message-item.assistant .message-bubble {
        background: var(--ai-assistant-message) !important;
        border: 1px solid var(--ai-border) !important;
    }

    /* 标题使用衬线字体 */
    h2, h3, h4, h5, h6 {
        font-family: var(--ai-font-family) !important;
        color: var(--ai-text-primary) !important;
        font-weight: 600 !important;
        letter-spacing: 0.02em !important;
    }

    /* 分割线做旧效果 */
    hr {
        border-color: var(--ai-border) !important;
        opacity: 0.6 !important;
    }

    /* 代码块背景 */
    pre, code {
        background: var(--ai-code-bg) !important;
        font-family: 'Consolas', 'Monaco', monospace !important;
        border-radius: var(--ai-border-radius) !important;
    }

    /* 滚动条做旧 */
    ::-webkit-scrollbar {
        width: 10px !important;
        background: var(--ai-scrollbar) !important;
        border-radius: 5px !important;
    }

    ::-webkit-scrollbar-thumb {
        background: var(--ai-scrollbar-thumb) !important;
        border-radius: 5px !important;
        border: 2px solid var(--ai-scrollbar) !important;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: var(--ai-primary) !important;
    }

    /* 下拉菜单做旧效果 */
    .dropdown-menu {
        background: var(--ai-bg-primary) !important;
        border: 2px solid var(--ai-border) !important;
        border-radius: var(--ai-border-radius) !important;
        box-shadow: 0 4px 12px rgba(61, 46, 28, 0.15) !important;
    }

    .dropdown-item {
        color: var(--ai-text-primary) !important;
        font-family: var(--ai-font-family) !important;
    }

    .dropdown-item:hover {
        background: var(--ai-bg-secondary) !important;
    }

    /* 标签页样式 */
    .nav-tabs .nav-link {
        color: var(--ai-text-secondary) !important;
        font-family: var(--ai-font-family) !important;
        border: none !important;
        border-bottom: 2px solid transparent !important;
    }

    .nav-tabs .nav-link:hover {
        color: var(--ai-text-primary) !important;
        border-bottom-color: var(--ai-border) !important;
    }

    .nav-tabs .nav-link.active {
        color: var(--ai-primary) !important;
        border-bottom-color: var(--ai-primary) !important;
        background: transparent !important;
    }

    /* 警告框做旧 */
    .alert {
        border-radius: var(--ai-border-radius) !important;
        font-family: var(--ai-font-family) !important;
    }
}
            `.trim();
        }

        return '';
    }

    /**
     * 更新 body 和 html 的类名
     */
    private updateBodyClasses(theme: ThemeType, effectiveTheme: ThemeType): void {
        const root = document.documentElement;
        const body = document.body;

        // 移除所有主题类
        this.allThemeClasses.forEach(cls => {
            root.classList.remove(cls);
            body.classList.remove(cls);
        });

        // 添加新主题类
        const themeClass = `ai-theme-${theme}`;
        const effectiveClass = `ai-theme-${effectiveTheme}`;

        root.classList.add(themeClass);
        body.classList.add(themeClass);
        root.setAttribute('data-ai-theme', effectiveTheme);
        body.setAttribute('data-ai-theme', effectiveTheme);

        if (theme === 'auto') {
            root.classList.add(effectiveClass);
            body.classList.add(effectiveClass);
        }

        // 更新所有 AI 容器的类
        const containers = document.querySelectorAll(this.containerSelectors.join(','));
        containers.forEach(container => {
            this.allThemeClasses.forEach(cls => container.classList.remove(cls));
            container.classList.add(themeClass);
            container.setAttribute('data-ai-theme', effectiveTheme);

            if (theme === 'auto') {
                container.classList.add(effectiveClass);
            }
        });
    }

    /**
     * 获取 Tabby 当前的有效主题
     */
    private getTabbyEffectiveTheme(): 'light' | 'dark' {
        const appearance = this.tabbyConfig.store?.appearance;

        if (appearance) {
            if (appearance.colorScheme) {
                const scheme = appearance.colorScheme.toLowerCase();
                if (scheme === 'light') return 'light';
                if (scheme === 'dark') return 'dark';
            }

            const theme = appearance.theme?.toLowerCase() || '';
            const darkThemes = ['hype', 'standard', 'dark', 'dracula', 'monokai', 'one-dark'];
            if (darkThemes.some(t => theme.includes(t))) {
                return 'dark';
            }
        }

        return 'dark';
    }

    /**
     * 刷新所有容器的主题类
     */
    refreshContainers(): void {
        const theme = this.config.get<string>('theme', 'auto') as ThemeType;
        this.applyTheme(theme);
    }

    ngOnDestroy(): void {
        // 清理动态样式
        if (this.styleElement && this.styleElement.parentNode) {
            this.styleElement.parentNode.removeChild(this.styleElement);
        }
        this.tabbySubscription?.unsubscribe();
        this.currentTheme$.complete();
    }
}
