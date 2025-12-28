import { Injectable } from '@angular/core';
import { ConfigProvider, Platform } from 'tabby-core';
import { ConfigProviderService } from '../../services/core/config-provider.service';

/**
 * Tabby配置提供者
 * 为Tabby提供AI助手配置管理
 */
@Injectable()
export class AiConfigProvider extends ConfigProvider {
    /**
     * 默认配置
     */
    defaults = {
        hotkeys: {
            'ai-assistant-toggle': ['Ctrl-Shift-A'],
            'ai-command-generation': ['Ctrl-Shift-G'],
            'ai-explain-command': ['Ctrl-Shift-E'],
        },
        aiAssistant: {
            enabled: true,
            defaultProvider: 'openai',
            autoSuggestCommands: true,
            enableSecurityChecks: true,
            providers: {
                openai: {
                    apiKey: '',
                    model: 'gpt-3.5-turbo',
                    baseURL: 'https://api.openai.com/v1'
                },
                anthropic: {
                    apiKey: '',
                    model: 'claude-3-sonnet',
                    baseURL: 'https://api.anthropic.com'
                },
                minimax: {
                    apiKey: '',
                    model: 'MiniMax-M2',
                    baseURL: 'https://api.minimaxi.com/anthropic'
                },
                glm: {
                    apiKey: '',
                    model: 'glm-4',
                    baseURL: 'https://open.bigmodel.cn/api/paas/v4'
                },
                openaiCompatible: {
                    apiKey: '',
                    model: 'gpt-3.5-turbo',
                    baseURL: ''
                }
            },
            security: {
                passwordProtection: false,
                riskAssessmentLevel: 'medium',
                consentPersistenceDays: 30
            }
        }
    };

    /**
     * 平台特定默认配置
     */
    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                'ai-assistant-toggle': ['⌘-Shift-A'],
                'ai-command-generation': ['⌘-Shift-G'],
                'ai-explain-command': ['⌘-Shift-E'],
            }
        }
    };

    constructor(
        private configService: ConfigProviderService
    ) {
        super();
    }
}

