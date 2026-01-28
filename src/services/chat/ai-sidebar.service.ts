import { Injectable, ComponentFactoryResolver, ApplicationRef, Injector, EmbeddedViewRef, ComponentRef, EnvironmentInjector, createComponent } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ConfigService } from 'tabby-core';
import { AiSidebarComponent } from '../../components/chat/ai-sidebar.component';

/**
 * 预设消息接口
 */
export interface PresetMessage {
    message: string;
    autoSend: boolean;
}

/**
 * AI Sidebar 配置接口
 */
export interface AiSidebarConfig {
    enabled?: boolean;
    position?: 'left' | 'right';
    showInToolbar?: boolean;
    sidebarVisible?: boolean;
    sidebarCollapsed?: boolean;
    sidebarWidth?: number;
}

/**
 * AI Sidebar 服务 - 管理 AI 聊天侧边栏的生命周期
 *
 * 采用 Flexbox 布局方式，将 sidebar 插入到 app-root 作为第一个子元素，
 * app-root 变为水平 flex 容器，sidebar 在左侧
 */
@Injectable({ providedIn: 'root' })
export class AiSidebarService {
    private sidebarComponentRef: ComponentRef<AiSidebarComponent> | null = null;
    private sidebarElement: HTMLElement | null = null;
    private styleElement: HTMLStyleElement | null = null;
    private resizeHandle: HTMLElement | null = null;
    private _isVisible = false;

    // Resize constants
    private readonly MIN_WIDTH = 280;
    private readonly MAX_WIDTH = 500;
    private readonly DEFAULT_WIDTH = 320;
    private currentWidth: number = this.DEFAULT_WIDTH;
    private isResizing = false;

    // 预设消息 Subject（用于快捷键功能）
    private presetMessageSubject = new Subject<PresetMessage>();

    /**
     * 获取预设消息 Observable
     */
    get presetMessage$(): Observable<PresetMessage> {
        return this.presetMessageSubject.asObservable();
    }

    /**
     * 侧边栏是否可见
     */
    get sidebarVisible(): boolean {
        return this._isVisible;
    }

    constructor(
        private componentFactoryResolver: ComponentFactoryResolver,
        private appRef: ApplicationRef,
        private injector: Injector,
        private environmentInjector: EnvironmentInjector,
        private config: ConfigService,
    ) { }

    /**
     * 显示 sidebar
     */
    show(): void {
        if (this._isVisible) {
            return;
        }

        this.createSidebar();

        const pluginConfig = this.getPluginConfig();
        pluginConfig.sidebarVisible = true;
        this.savePluginConfig(pluginConfig);

        this._isVisible = true;
    }

    /**
     * 隐藏 sidebar
     */
    hide(): void {
        if (!this._isVisible) {
            return;
        }

        this.destroySidebar();

        const pluginConfig = this.getPluginConfig();
        pluginConfig.sidebarVisible = false;
        this.savePluginConfig(pluginConfig);

        this._isVisible = false;
    }

    /**
     * 切换 sidebar 显示状态
     */
    toggle(): void {
        if (this._isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 获取当前显示状态
     */
    get visible(): boolean {
        return this._isVisible;
    }

    /**
     * 发送预设消息并执行
     * 用于快捷键功能 - 自动填充并发送消息
     * @param message 消息内容
     * @param autoSend 是否自动发送（否则只填充不发送）
     */
    sendPresetMessage(message: string, autoSend: boolean = true): void {
        if (!this._isVisible) {
            this.show();
        }

        // 通知侧边栏组件填充消息
        this.presetMessageSubject.next({ message, autoSend });
    }

    /**
     * 初始化 - 应用启动时调用
     */
    initialize(): void {
        const pluginConfig = this.getPluginConfig();
        // 默认显示 sidebar，除非明确设置为隐藏
        if (pluginConfig.sidebarVisible !== false) {
            this.show();
        }
    }

    /**
     * 获取 sidebar 位置
     */
    getSidebarPosition(): 'left' | 'right' {
        const pluginConfig = this.getPluginConfig();
        return pluginConfig.position || 'left';
    }

    /**
     * 设置 sidebar 位置
     */
    setSidebarPosition(position: 'left' | 'right'): void {
        const pluginConfig = this.getPluginConfig();
        pluginConfig.position = position;
        this.savePluginConfig(pluginConfig);
        
        // 如果 sidebar 正在显示，重新创建以应用新位置
        if (this._isVisible) {
            this.destroySidebar();
            this.createSidebar();
        }
    }

    /**
     * 创建 sidebar 组件
     * 
     * 使用固定定位方案：
     * 1. 侧边栏 position: fixed，固定在左侧或右侧
     * 2. 主内容区通过 margin 推开
     * 这样不改变任何现有元素的 flex 布局
     */
    private createSidebar(): void {
        // 使用 createComponent API (Angular 14+)，传入 EnvironmentInjector
        // 这确保组件能正确解析所有 root 级服务依赖
        this.sidebarComponentRef = createComponent(AiSidebarComponent, {
            environmentInjector: this.environmentInjector,
            elementInjector: this.injector
        });

        // 附加到应用
        this.appRef.attachView(this.sidebarComponentRef.hostView);

        // 获取 DOM 元素
        const domElem = (this.sidebarComponentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement;
        // 直接设置组件 host 元素的样式 - 确保 flex 布局正确
        domElem.style.display = 'flex';
        domElem.style.flexDirection = 'column';
        domElem.style.height = '100%';
        domElem.style.width = '100%';
        domElem.style.overflow = 'hidden';

        // 创建 wrapper 元素 - 使用固定定位
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-sidebar-wrapper';

        // 加载保存的宽度和位置
        this.currentWidth = this.loadSidebarWidth();
        const position = this.getSidebarPosition();
        const isRight = position === 'right';

        // 获取视口高度 - 使用绝对像素值确保滚动容器正确计算
        const viewportHeight = window.innerHeight;
        wrapper.style.cssText = `
            position: fixed;
            ${isRight ? 'right' : 'left'}: 0;
            top: 0;
            width: ${this.currentWidth}px;
            height: ${viewportHeight}px;
            display: flex;
            flex-direction: column;
            background: var(--bs-body-bg, #1e1e1e);
            border-${isRight ? 'left' : 'right'}: 1px solid var(--bs-border-color, #333);
            box-shadow: ${isRight ? '-2px' : '2px'} 0 10px rgba(0,0,0,0.3);
            z-index: 1000;
            overflow: hidden;
        `;

        // 监听窗口大小变化，动态更新高度
        const resizeHandler = () => {
            wrapper.style.height = `${window.innerHeight}px`;
        };
        window.addEventListener('resize', resizeHandler);
        // 存储 handler 以便在销毁时移除
        (wrapper as any)._resizeHandler = resizeHandler;

        // 创建 resize handle（拖动条）
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ai-sidebar-resize-handle';
        // 根据位置调整 resize handle 的位置
        const handlePosition = isRight ? 'left: -4px;' : 'right: -4px;';
        resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            ${handlePosition}
            width: 8px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
            z-index: 1001;
            transition: background 0.2s;
        `;

        // 鼠标悬停时显示高亮
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.background = 'var(--ai-primary, #4dabf7)';
        });
        resizeHandle.addEventListener('mouseleave', () => {
            if (!this.isResizing) {
                resizeHandle.style.background = 'transparent';
            }
        });

        // 添加拖动逻辑
        this.setupResizeHandler(resizeHandle, wrapper, viewportHeight);

        wrapper.appendChild(resizeHandle);
        this.resizeHandle = resizeHandle;

        wrapper.appendChild(domElem);

        // 插入到 body
        document.body.appendChild(wrapper);

        this.sidebarElement = wrapper;

        // 注入布局 CSS - 只添加 margin-left 把主内容推开
        this.injectLayoutCSS();

        // 注入服务引用到组件
        if (this.sidebarComponentRef) {
            const component = this.sidebarComponentRef.instance;
            component.sidebarService = this;
        }
    }

    /**
     * 销毁 sidebar 组件
     */
    private destroySidebar(): void {
        // 移除注入的 CSS
        this.removeLayoutCSS();

        // 移除 resize 监听器
        if (this.sidebarElement) {
            const handler = (this.sidebarElement as any)._resizeHandler;
            if (handler) {
                window.removeEventListener('resize', handler);
            }
        }

        if (this.sidebarComponentRef) {
            this.appRef.detachView(this.sidebarComponentRef.hostView);
            this.sidebarComponentRef.destroy();
            this.sidebarComponentRef = null;
        }

        if (this.sidebarElement) {
            this.sidebarElement.remove();
            this.sidebarElement = null;
        }
    }

    /**
     * 调整 .content 元素样式 - 只处理第二个（更深层的）.content
     */
    private adjustContentStyles(appRoot: Element, apply: boolean): void {
        const contentElements = appRoot.querySelectorAll('.content');

        if (contentElements.length > 1) {
            // 选择第二个（更深层的）.content 元素，这是 Tabby 的主内容区
            const contentElement = contentElements[1] as HTMLElement;
            if (apply) {
                contentElement.style.width = 'auto';
                contentElement.style.flex = '1 1 auto';
                contentElement.style.minWidth = '0';
            } else {
                contentElement.style.removeProperty('width');
                contentElement.style.removeProperty('flex');
                contentElement.style.removeProperty('min-width');
            }
        } else if (contentElements.length === 1) {
            // 如果只有一个 .content，则处理它
            const contentElement = contentElements[0] as HTMLElement;
            if (apply) {
                contentElement.style.width = 'auto';
                contentElement.style.flex = '1 1 auto';
                contentElement.style.minWidth = '0';
            } else {
                contentElement.style.removeProperty('width');
                contentElement.style.removeProperty('flex');
                contentElement.style.removeProperty('min-width');
            }
        }
    }

    /**
     * 注入布局 CSS - 使用 margin 把主内容推开
     *
     * 固定定位方案：侧边栏 fixed，主内容区 margin
     * 
     * 修复：只推开内容区，不影响标题栏/标签栏
     * 支持左右位置
     */
    private injectLayoutCSS(): void {
        const position = this.getSidebarPosition();
        const isRight = position === 'right';
        const marginProp = isRight ? 'margin-right' : 'margin-left';
        
        const style = document.createElement('style');
        style.id = 'ai-sidebar-layout-css';
        style.textContent = `
            /* 用 margin 把主内容区推开，为侧边栏腾出空间 */
            /* 针对 Tabby 的布局结构：只影响 .content 区域，不影响 tab-bar */
            app-root > .content,
            app-root > app-title-bar + .content,
            app-root > .tab-bar + .content,
            app-root > .layout > .content,
            body > app-root > .content {
                ${marginProp}: ${this.currentWidth}px !important;
            }
            
            /* 确保 tab-bar 和 title-bar 不被推开 */
            app-root > .tab-bar,
            app-root > app-title-bar,
            app-root > .title-bar,
            app-root > [class*="tab"],
            app-root > [class*="title"] {
                ${marginProp}: 0 !important;
            }
            
            /* 备用方案：如果上述选择器不生效，使用 transform 位移 */
            app-root {
                position: relative;
            }
        `;

        document.head.appendChild(style);
        this.styleElement = style;
        
        // 同时尝试直接调整 DOM 元素的样式（更可靠）
        this.adjustMainContentMargin(true);
    }
    
    /**
     * 调整主内容区的 margin
     */
    private adjustMainContentMargin(apply: boolean): void {
        const appRoot = document.querySelector('app-root');
        if (!appRoot) return;
        
        const position = this.getSidebarPosition();
        const isRight = position === 'right';
        const marginProp = isRight ? 'marginRight' : 'marginLeft';
        
        // 查找主内容区（通常是 .content 或 main 元素）
        // 排除 tab-bar、title-bar 等顶部元素
        const children = Array.from(appRoot.children);
        
        for (const child of children) {
            const tagName = child.tagName.toLowerCase();
            const className = child.className || '';
            
            // 跳过标签栏、标题栏等顶部元素
            if (tagName.includes('tab') || 
                tagName.includes('title') ||
                className.includes('tab') || 
                className.includes('title') ||
                tagName === 'ai-sidebar-wrapper') {
                continue;
            }
            
            // 给主内容区添加 margin
            const el = child as HTMLElement;
            if (apply) {
                (el.style as any)[marginProp] = `${this.currentWidth}px`;
                el.style.transition = `${isRight ? 'margin-right' : 'margin-left'} 0.2s ease`;
            } else {
                (el.style as any)[marginProp] = '';
                el.style.transition = '';
            }
        }
    }

    /**
     * 移除布局 CSS
     */
    private removeLayoutCSS(): void {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
        
        // 同时移除直接设置的样式
        this.adjustMainContentMargin(false);
    }

    /**
     * 设置 resize handle 拖动逻辑
     */
    private setupResizeHandler(handle: HTMLElement, wrapper: HTMLElement, viewportHeight: number): void {
        let startX: number;
        let startWidth: number;

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            this.isResizing = true;
            startX = e.clientX;
            startWidth = this.currentWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isResizing) return;

            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;

            // 限制宽度范围
            newWidth = Math.max(this.MIN_WIDTH, Math.min(this.MAX_WIDTH, newWidth));

            this.currentWidth = newWidth;
            wrapper.style.width = `${newWidth}px`;

            // 更新 app-root 的 margin-left
            this.updateLayoutCSS(newWidth);
        };

        const onMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            handle.style.background = 'transparent';

            // 保存宽度到配置
            this.saveSidebarWidth(this.currentWidth);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    /**
     * 更新布局 CSS（resize 时调用）
     */
    private updateLayoutCSS(width: number): void {
        const position = this.getSidebarPosition();
        const isRight = position === 'right';
        const marginProp = isRight ? 'margin-right' : 'margin-left';
        
        if (this.styleElement) {
            this.styleElement.textContent = `
                /* 用 margin 把主内容区推开，为侧边栏腾出空间 */
                app-root > .content,
                app-root > app-title-bar + .content,
                app-root > .tab-bar + .content,
                app-root > .layout > .content,
                body > app-root > .content {
                    ${marginProp}: ${width}px !important;
                }
                
                /* 确保 tab-bar 和 title-bar 不被推开 */
                app-root > .tab-bar,
                app-root > app-title-bar,
                app-root > .title-bar,
                app-root > [class*="tab"],
                app-root > [class*="title"] {
                    ${marginProp}: 0 !important;
                }
                
                app-root {
                    position: relative;
                }
            `;
        }
        
        // 同时更新直接设置的样式
        this.adjustMainContentMargin(true);
    }

    /**
     * 加载保存的侧边栏宽度
     */
    private loadSidebarWidth(): number {
        const pluginConfig = this.getPluginConfig();
        const savedWidth = pluginConfig.sidebarWidth;
        if (savedWidth && savedWidth >= this.MIN_WIDTH && savedWidth <= this.MAX_WIDTH) {
            return savedWidth;
        }
        return this.DEFAULT_WIDTH;
    }

    /**
     * 保存侧边栏宽度到配置
     */
    private saveSidebarWidth(width: number): void {
        const pluginConfig = this.getPluginConfig();
        pluginConfig.sidebarWidth = width;
        this.savePluginConfig(pluginConfig);
    }

    /**
     * 获取插件配置
     */
    private getPluginConfig(): AiSidebarConfig {
        return this.config.store.pluginConfig?.['ai-assistant'] || {};
    }

    /**
     * 保存插件配置
     */
    private savePluginConfig(pluginConfig: AiSidebarConfig): void {
        if (!this.config.store.pluginConfig) {
            this.config.store.pluginConfig = {};
        }
        this.config.store.pluginConfig['ai-assistant'] = pluginConfig;
        this.config.save();
    }
}
