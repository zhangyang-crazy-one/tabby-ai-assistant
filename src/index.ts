import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// 全局样式
import './styles/ai-assistant.scss';

// i18n Services
import { TranslateService } from './i18n';

// Tabby modules
import TabbyCoreModule, { AppService, ConfigService, ToolbarButtonProvider, ConfigProvider, HotkeyProvider, HotkeysService } from 'tabby-core';
import TabbyTerminalModule from 'tabby-terminal';
import { SettingsTabProvider } from 'tabby-settings';

// Core Services
import { AiAssistantService } from './services/core/ai-assistant.service';
import { AiProviderManagerService } from './services/core/ai-provider-manager.service';
import { ConfigProviderService } from './services/core/config-provider.service';
import { LoggerService } from './services/core/logger.service';

// Providers
import { BaseAiProvider } from './services/providers/base-provider.service';
import { OpenAiProviderService } from './services/providers/openai-provider.service';
import { AnthropicProviderService } from './services/providers/anthropic-provider.service';
import { MinimaxProviderService } from './services/providers/minimax-provider.service';
import { GlmProviderService } from './services/providers/glm-provider.service';
import { OpenAiCompatibleProviderService } from './services/providers/openai-compatible.service';
import { OllamaProviderService } from './services/providers/ollama-provider.service';
import { VllmProviderService } from './services/providers/vllm-provider.service';

// Security Services
import { SecurityValidatorService } from './services/security/security-validator.service';
import { RiskAssessmentService } from './services/security/risk-assessment.service';
import { PasswordManagerService } from './services/security/password-manager.service';
import { ConsentManagerService } from './services/security/consent-manager.service';

// Chat Services
import { ChatSessionService } from './services/chat/chat-session.service';
import { ChatHistoryService } from './services/chat/chat-history.service';
import { CommandGeneratorService } from './services/chat/command-generator.service';
import { AiSidebarService } from './services/chat/ai-sidebar.service';

// Terminal Services
import { TerminalManagerService } from './services/terminal/terminal-manager.service';

// Context Engineering Services
import { ContextManager } from './services/context/manager';
import { Compaction } from './services/context/compaction';
import { Memory } from './services/context/memory';
import { TokenBudget } from './services/context/token-budget';

// Platform Services
import { PlatformDetectionService } from './services/platform/platform-detection.service';

// Core Services
import { CheckpointManager } from './services/core/checkpoint.service';
import { ToastService } from './services/core/toast.service';

// Enhanced Terminal Services
import { BufferAnalyzerService } from './services/terminal/buffer-analyzer.service';

// Tabby Providers (enabled for proper integration)

// Components
import { ChatInterfaceComponent } from './components/chat/chat-interface.component';
import { ChatMessageComponent } from './components/chat/chat-message.component';
import { ChatInputComponent } from './components/chat/chat-input.component';
import { ChatSettingsComponent } from './components/chat/chat-settings.component';
import { AiSidebarComponent } from './components/chat/ai-sidebar.component';

import { AiSettingsTabComponent } from './components/settings/ai-settings-tab.component';
import { ProviderConfigComponent } from './components/settings/provider-config.component';
import { SecuritySettingsComponent } from './components/settings/security-settings.component';
import { GeneralSettingsComponent } from './components/settings/general-settings.component';
import { ContextSettingsComponent } from './components/settings/context-settings.component';

import { RiskConfirmDialogComponent } from './components/security/risk-confirm-dialog.component';
import { PasswordPromptComponent } from './components/security/password-prompt.component';
import { ConsentDialogComponent } from './components/security/consent-dialog.component';

import { CommandSuggestionComponent } from './components/terminal/command-suggestion.component';
import { CommandPreviewComponent } from './components/terminal/command-preview.component';
import { AiToolbarButtonComponent } from './components/terminal/ai-toolbar-button.component';

import { LoadingSpinnerComponent } from './components/common/loading-spinner.component';
import { ErrorMessageComponent } from './components/common/error-message.component';

// Tabby Integration Providers (enabled for proper integration)
import { AiToolbarButtonProvider } from './providers/tabby/ai-toolbar-button.provider';
import { AiSettingsTabProvider } from './providers/tabby/ai-settings-tab.provider';
import { AiConfigProvider } from './providers/tabby/ai-config.provider';
import { AiHotkeyProvider } from './providers/tabby/ai-hotkey.provider';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
        TabbyTerminalModule,
        NgbModule
    ],
    providers: [
        // Core Services
        AiAssistantService,
        AiProviderManagerService,
        ConfigProviderService,
        LoggerService,

        // i18n Services
        TranslateService,

        // AI Providers
        OpenAiProviderService,
        AnthropicProviderService,
        MinimaxProviderService,
        GlmProviderService,
        OpenAiCompatibleProviderService,
        OllamaProviderService,
        VllmProviderService,

        // Security Services
        SecurityValidatorService,
        RiskAssessmentService,
        PasswordManagerService,
        ConsentManagerService,

        // Chat Services
        ChatSessionService,
        ChatHistoryService,
        CommandGeneratorService,
        AiSidebarService,

        // Terminal Services
        TerminalManagerService,

        // Context Engineering Services
        ContextManager,
        Compaction,
        Memory,
        TokenBudget,

        // Platform Services
        PlatformDetectionService,

        // Core Services
        CheckpointManager,

        // Toast Service
        ToastService,

        // Enhanced Terminal Services
        BufferAnalyzerService,

        // Tabby Integration Providers
        { provide: ToolbarButtonProvider, useClass: AiToolbarButtonProvider, multi: true },
        { provide: SettingsTabProvider, useClass: AiSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: AiConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: AiHotkeyProvider, multi: true },
    ],
    declarations: [
        // Chat Components
        ChatInterfaceComponent,
        ChatMessageComponent,
        ChatInputComponent,
        ChatSettingsComponent,
        AiSidebarComponent,

        // Settings Components
        AiSettingsTabComponent,
        ProviderConfigComponent,
        SecuritySettingsComponent,
        GeneralSettingsComponent,
        ContextSettingsComponent,

        // Security Components
        RiskConfirmDialogComponent,
        PasswordPromptComponent,
        ConsentDialogComponent,

        // Terminal Components
        CommandSuggestionComponent,
        CommandPreviewComponent,
        AiToolbarButtonComponent,

        // Common Components
        LoadingSpinnerComponent,
        ErrorMessageComponent
    ],
    entryComponents: [
        ChatInterfaceComponent,
        AiSidebarComponent,
        RiskConfirmDialogComponent,
        PasswordPromptComponent,
        ConsentDialogComponent,
        CommandSuggestionComponent,
        CommandPreviewComponent
    ]
})
export default class AiAssistantModule {
    constructor(
        private app: AppService,
        private config: ConfigService,
        private aiService: AiAssistantService,
        private sidebarService: AiSidebarService,
        hotkeys: HotkeysService
    ) {
        console.log('[AiAssistantModule] Module initialized');

        // 等待应用就绪后初始化
        this.app.ready$.subscribe(() => {
            this.config.ready$.toPromise().then(() => {
                // 初始化 AI 服务
                this.aiService.initialize();

                // 延迟 1 秒初始化侧边栏，等待 Tabby DOM 完全准备好
                // 这与 tabby-ssh-sidebar 的实现保持一致
                setTimeout(() => {
                    this.sidebarService.initialize();
                }, 1000);
            });
        });

        // 订阅热键事件
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'ai-assistant-toggle') {
                this.sidebarService.toggle();
            } else if (hotkey === 'ai-command-generation') {
                // 打开侧边栏并聚焦输入
                if (!this.sidebarService.sidebarVisible) {
                    this.sidebarService.show();
                }
            } else if (hotkey === 'ai-explain-command') {
                // 打开侧边栏
                if (!this.sidebarService.sidebarVisible) {
                    this.sidebarService.show();
                }
            }
        });
    }
}

export const forRoot = (): typeof AiAssistantModule => {
    return AiAssistantModule;
};

declare const module: any;
if (typeof module !== 'undefined' && module.exports) {
    module.exports.forRoot = forRoot;
    module.exports.default = AiAssistantModule;
}
