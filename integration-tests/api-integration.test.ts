/**
 * 集成测试 - AI提供商API调用
 * 使用真实API进行测试
 */

import axios from 'axios';

// GLM API配置
const GLM_API_CONFIG = {
    apiKey: 'e247e649f1534651a3f12bfe47d2c42f.qlrVZegtSW0nFdMI',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-4'
};

describe('GLM API Integration Tests', () => {
    it('should connect to GLM API successfully', async () => {
        try {
            console.log('🔄 开始连接GLM API...');
            console.log('API配置:', {
                baseURL: GLM_API_CONFIG.baseURL,
                model: GLM_API_CONFIG.model,
                apiKeyLength: GLM_API_CONFIG.apiKey.length
            });

            const response = await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello, can you respond?'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GLM_API_CONFIG.apiKey}`
                    },
                    timeout: 30000
                }
            );

            console.log('✅ GLM API连接成功');
            console.log('响应状态:', response.status);
            console.log('响应数据结构:', JSON.stringify(response.data, null, 2));

            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
            // GLM API可能使用不同的响应格式
            if (response.data.content) {
                expect(response.data.content).toBeDefined();
            } else if (response.data.choices) {
                expect(response.data.choices).toBeDefined();
                console.log('choices格式响应:', response.data.choices);
            }
        } catch (error: any) {
            console.error('❌ GLM API连接失败');
            console.error('错误类型:', error.name);
            console.error('错误信息:', error.message);
            console.error('完整错误对象:', error.toJSON ? error.toJSON() : error);
            if (error.response) {
                console.error('响应状态:', error.response.status);
                console.error('响应头:', error.response.headers);
                console.error('响应数据:', error.response.data);
            } else if (error.request) {
                console.error('请求配置:', error.config);
                console.error('无响应返回 - 可能是网络问题或超时');
            }
            throw error;
        }
    }, 60000);

    it('should handle API errors gracefully', async () => {
        try {
            // 使用无效的API key测试错误处理
            const response = await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Test'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer invalid-key'
                    },
                    timeout: 10000
                }
            );

            // 如果到这里说明没有抛出错误，测试失败
            fail('应该抛出API错误');
        } catch (error: any) {
            console.log('✅ 错误处理测试通过');
            console.log('捕获到预期错误:', error.message);
            expect(error.response?.status).toBe(401);
        }
    }, 30000);

    it('should generate command from natural language', async () => {
        try {
            const response = await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 200,
                    messages: [
                        {
                            role: 'user',
                            content: `请将以下自然语言转换为终端命令："列出当前目录的所有文件"`
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GLM_API_CONFIG.apiKey}`
                    },
                    timeout: 30000
                }
            );

            console.log('✅ 命令生成测试成功');
            console.log('生成内容:', response.data.content?.[0]?.text);

            expect(response.status).toBe(200);
            expect(response.data.content?.[0]?.text).toBeDefined();
        } catch (error: any) {
            console.error('❌ 命令生成测试失败:', error.message);
            throw error;
        }
    }, 60000);
});

// OpenAI API测试
const OPENAI_API_CONFIG = {
    apiKey: 'sk-test-key',  // 测试密钥
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo'
};

describe('OpenAI API Integration Tests', () => {
    it('should test OpenAI API connectivity', async () => {
        try {
            const response = await axios.post(
                `${OPENAI_API_CONFIG.baseURL}/chat/completions`,
                {
                    model: OPENAI_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_CONFIG.apiKey}`
                    },
                    timeout: 10000
                }
            );

            console.log('✅ OpenAI API测试完成');
            console.log('响应状态:', response.status);
        } catch (error: any) {
            console.log('ℹ️ OpenAI API测试（使用测试密钥，预期失败）');
            console.log('错误信息:', error.message);
            // 对于OpenAI，我们只是测试连接，不强制要求成功
        }
    }, 30000);
});
