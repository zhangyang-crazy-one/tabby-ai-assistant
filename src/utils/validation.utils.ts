/**
 * 验证工具类
 * 提供各种数据验证和格式检查功能
 */

/**
 * 验证API密钥格式
 */
export function validateApiKey(apiKey: string, provider: string): { valid: boolean; error?: string } {
    if (!apiKey || apiKey.trim().length === 0) {
        return { valid: false, error: 'API密钥不能为空' };
    }

    // 移除前后空格
    const trimmedKey = apiKey.trim();

    // 根据提供商验证格式
    switch (provider.toLowerCase()) {
        case 'openai':
            return validateOpenAiKey(trimmedKey);
        case 'anthropic':
            return validateAnthropicKey(trimmedKey);
        case 'minimax':
            return validateMinimaxKey(trimmedKey);
        case 'glm':
            return validateGlmKey(trimmedKey);
        case 'openai-compatible':
            return { valid: true };
        default:
            return { valid: true };
    }
}

/**
 * 验证OpenAI API密钥格式
 */
function validateOpenAiKey(key: string): { valid: boolean; error?: string } {
    // OpenAI密钥通常以 sk- 开头
    if (!key.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API密钥应以 sk- 开头' };
    }

    if (key.length < 50) {
        return { valid: false, error: 'OpenAI API密钥长度不足' };
    }

    return { valid: true };
}

/**
 * 验证Anthropic API密钥格式
 */
function validateAnthropicKey(key: string): { valid: boolean; error?: string } {
    // Anthropic密钥通常以 sk-ant- 开头
    if (!key.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic API密钥应以 sk-ant- 开头' };
    }

    if (key.length < 50) {
        return { valid: false, error: 'Anthropic API密钥长度不足' };
    }

    return { valid: true };
}

/**
 * 验证Minimax API密钥格式
 */
function validateMinimaxKey(key: string): { valid: boolean; error?: string } {
    // Minimax密钥长度检查
    if (key.length < 20) {
        return { valid: false, error: 'Minimax API密钥长度不足' };
    }

    return { valid: true };
}

/**
 * 验证GLM API密钥格式
 */
function validateGlmKey(key: string): { valid: boolean; error?: string } {
    // GLM密钥长度检查
    if (key.length < 20) {
        return { valid: false, error: 'GLM API密钥长度不足' };
    }

    return { valid: true };
}

/**
 * 验证URL格式
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url || url.trim().length === 0) {
        return { valid: false, error: 'URL不能为空' };
    }

    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, error: 'URL必须使用HTTP或HTTPS协议' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: '无效的URL格式' };
    }
}

/**
 * 验证模型名称
 */
export function validateModel(model: string, _provider: string): { valid: boolean; error?: string } {
    if (!model || model.trim().length === 0) {
        return { valid: false, error: '模型名称不能为空' };
    }

    const trimmedModel = model.trim();

    // 验证模型名称格式
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedModel)) {
        return { valid: false, error: '模型名称包含非法字符' };
    }

    // TODO: 根据提供商类型进行特定验证
    // _provider 参数保留用于未来扩展

    return { valid: true };
}

/**
 * 验证温度参数
 */
export function validateTemperature(temperature: number): { valid: boolean; error?: string } {
    if (typeof temperature !== 'number' || isNaN(temperature)) {
        return { valid: false, error: '温度必须是有效数字' };
    }

    if (temperature < 0 || temperature > 2) {
        return { valid: false, error: '温度值必须在0-2之间' };
    }

    return { valid: true };
}

/**
 * 验证最大令牌数
 */
export function validateMaxTokens(maxTokens: number): { valid: boolean; error?: string } {
    if (typeof maxTokens !== 'number' || isNaN(maxTokens) || maxTokens <= 0) {
        return { valid: false, error: '最大令牌数必须是正整数' };
    }

    if (maxTokens > 32000) {
        return { valid: false, error: '最大令牌数不能超过32000' };
    }

    return { valid: true };
}

/**
 * 验证命令字符串
 */
export function validateCommand(command: string): { valid: boolean; error?: string } {
    if (!command || command.trim().length === 0) {
        return { valid: false, error: '命令不能为空' };
    }

    const trimmed = command.trim();

    // 检查危险模式
    const dangerousPatterns = [
        /rm\s+-rf\s+\//,
        /sudo\s+rm/,
        />\s*\/dev\/null/,
        /chmod\s+777/,
        /dd\s+if=/,
        /fork\s*\(/,
        /\|\s*sh\b/,
        /\|\s*bash\b/,
        /\$\(/,
        /`[^`]*`/,
        /;\s*rm/,
        /&&\s*rm/
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            return { valid: false, error: '检测到潜在危险命令' };
        }
    }

    return { valid: true };
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || email.trim().length === 0) {
        return { valid: false, error: '邮箱不能为空' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: '邮箱格式无效' };
    }

    return { valid: true };
}

/**
 * 验证密码强度
 */
export function validatePassword(password: string): { valid: boolean; error?: string; score: number } {
    if (!password || password.length === 0) {
        return { valid: false, error: '密码不能为空', score: 0 };
    }

    let score = 0;
    const errors: string[] = [];

    // 长度检查
    if (password.length < 8) {
        errors.push('密码至少需要8个字符');
    } else {
        score += 20;
    }

    if (password.length >= 12) {
        score += 10;
    }

    // 字符类型检查
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (hasLower) score += 10;
    if (hasUpper) score += 10;
    if (hasNumber) score += 10;
    if (hasSpecial) score += 10;

    if (!hasLower) errors.push('需要包含小写字母');
    if (!hasUpper) errors.push('需要包含大写字母');
    if (!hasNumber) errors.push('需要包含数字');
    if (!hasSpecial) errors.push('需要包含特殊字符');

    // 常见密码检查
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
        return { valid: false, error: '密码过于常见', score: 0 };
    }

    const valid = errors.length === 0 && score >= 40;
    return {
        valid,
        error: valid ? undefined : errors.join(', '),
        score: Math.min(score, 100)
    };
}

/**
 * 验证端口号
 */
export function validatePort(port: number): { valid: boolean; error?: string } {
    if (typeof port !== 'number' || isNaN(port) || !Number.isInteger(port)) {
        return { valid: false, error: '端口必须是整数' };
    }

    if (port < 1 || port > 65535) {
        return { valid: false, error: '端口号必须在1-65535之间' };
    }

    return { valid: true };
}

/**
 * 验证JSON格式
 */
export function validateJson(jsonString: string): { valid: boolean; error?: string; data?: any } {
    if (!jsonString || jsonString.trim().length === 0) {
        return { valid: false, error: 'JSON字符串不能为空' };
    }

    try {
        const data = JSON.parse(jsonString);
        return { valid: true, data };
    } catch (error) {
        return { valid: false, error: '无效的JSON格式' };
    }
}

/**
 * 验证文件路径
 */
export function validateFilePath(path: string): { valid: boolean; error?: string } {
    if (!path || path.trim().length === 0) {
        return { valid: false, error: '文件路径不能为空' };
    }

    // 检查路径长度
    if (path.length > 260) {
        return { valid: false, error: '文件路径过长' };
    }

    // 检查非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(path)) {
        return { valid: false, error: '路径包含非法字符' };
    }

    return { valid: true };
}
