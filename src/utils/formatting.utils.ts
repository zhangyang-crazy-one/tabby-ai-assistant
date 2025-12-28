/**
 * 格式化工具类
 * 提供各种数据格式化功能
 */

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 格式化持续时间
 */
export function formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
        return `${milliseconds}ms`;
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * 格式化日期
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'relative' = 'short'): string {
    if (!date) return '';

    switch (format) {
        case 'short':
            return date.toLocaleDateString();
        case 'long':
            return date.toLocaleString();
        case 'relative':
            return formatRelativeTime(date);
        default:
            return date.toLocaleDateString();
    }
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
        return '刚刚';
    } else if (minutes < 60) {
        return `${minutes}分钟前`;
    } else if (hours < 24) {
        return `${hours}小时前`;
    } else if (days < 7) {
        return `${days}天前`;
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * 格式化数字
 */
export function formatNumber(num: number, decimals: number = 0): string {
    if (isNaN(num)) return '0';

    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number, total: number, decimals: number = 1): string {
    if (total === 0) return '0%';

    const percentage = (value / total) * 100;
    return `${percentage.toFixed(decimals)}%`;
}

/**
 * 格式化令牌数量
 */
export function formatTokens(tokens: number): string {
    if (tokens < 1000) {
        return `${tokens} tokens`;
    } else if (tokens < 1000000) {
        return `${(tokens / 1000).toFixed(1)}K tokens`;
    } else {
        return `${(tokens / 1000000).toFixed(1)}M tokens`;
    }
}

/**
 * 格式化价格
 */
export function formatPrice(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency
    }).format(amount);
}

/**
 * 格式化命令输出（添加语法高亮）
 */
export function formatCommandOutput(output: string): string {
    // 简单的语法高亮
    return output
        .replace(/(\b(?:error|ERROR|Error)\b)/g, '<span class="text-danger">$1</span>')
        .replace(/(\b(?:warning|WARNING|Warning)\b)/g, '<span class="text-warning">$1</span>')
        .replace(/(\b(?:success|SUCCESS|Success)\b)/g, '<span class="text-success">$1</span>')
        .replace(/(\`[^\`]+\`)/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

/**
 * 格式化风险级别
 */
export function formatRiskLevel(level: string): { text: string; class: string } {
    switch (level.toLowerCase()) {
        case 'low':
            return { text: '低风险', class: 'text-success' };
        case 'medium':
            return { text: '中风险', class: 'text-warning' };
        case 'high':
            return { text: '高风险', class: 'text-danger' };
        case 'critical':
            return { text: '极风险', class: 'text-danger' };
        default:
            return { text: '未知', class: 'text-muted' };
    }
}

/**
 * 格式化置信度
 */
export function formatConfidence(confidence: number): { text: string; class: string } {
    const percentage = Math.round(confidence * 100);

    if (percentage >= 90) {
        return { text: `${percentage}% - 很高`, class: 'text-success' };
    } else if (percentage >= 70) {
        return { text: `${percentage}% - 高`, class: 'text-info' };
    } else if (percentage >= 50) {
        return { text: `${percentage}% - 中`, class: 'text-warning' };
    } else {
        return { text: `${percentage}% - 低`, class: 'text-danger' };
    }
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
    if (!text || text.length <= maxLength) {
        return text || '';
    }

    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 格式化错误信息
 */
export function formatError(error: Error | string): string {
    if (!error) return '未知错误';

    if (typeof error === 'string') {
        return error;
    }

    const message = error.message || '未知错误';
    const stack = error.stack;

    // 如果是API错误，尝试解析
    if (message.includes('API') || message.includes('HTTP')) {
        return `API错误: ${message}`;
    }

    return stack ? `${message}\n${stack}` : message;
}

/**
 * 格式化字节数组
 */
export function formatBytes(bytes: number[], separator: string = ' '): string {
    return bytes.map(b => b.toString(16).padStart(2, '0')).join(separator);
}

/**
 * 格式化JSON（美化输出）
 */
export function formatJson(json: string | object, indent: number = 2): string {
    try {
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        return JSON.stringify(obj, null, indent);
    } catch {
        return typeof json === 'string' ? json : String(json);
    }
}

/**
 * 格式化速度（bytes per second）
 */
export function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
        return `${bytesPerSecond.toFixed(2)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
        return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else if (bytesPerSecond < 1024 * 1024 * 1024) {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else {
        return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    }
}

/**
 * 格式化进度条
 */
export function formatProgressBar(current: number, total: number, width: number = 20): string {
    if (total === 0) return '[' + ' '.repeat(width) + '] 0%';

    const percentage = current / total;
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round(percentage * 100);

    return `[${bar}] ${percent}%`;
}

/**
 * 格式化文件路径（显示简化版本）
 */
export function formatFilePath(path: string, maxLength: number = 50): string {
    if (!path || path.length <= maxLength) {
        return path;
    }

    const parts = path.split(/[\\/]/);
    if (parts.length <= 2) {
        return '...' + path.substring(path.length - maxLength + 3);
    }

    const first = parts[0];
    const last = parts[parts.length - 1];
    const second = parts[1];

    return `${first}/${second}/.../${last}`;
}

/**
 * 格式化列表为文本
 */
export function formatList(items: string[], delimiter: string = ', '): string {
    if (!items || items.length === 0) {
        return '';
    }

    if (items.length === 1) {
        return items[0];
    }

    if (items.length === 2) {
        return `${items[0]} 和 ${items[1]}`;
    }

    return items.slice(0, -1).join(delimiter) + '、以及 ' + items[items.length - 1];
}

/**
 * 格式化代码块
 */
export function formatCodeBlock(code: string, language: string = 'text'): string {
    return '```' + language + '\n' + code + '\n```';
}

/**
 * 转义HTML
 */
export function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 清理文本（移除多余空白）
 */
export function cleanText(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 驼峰命名格式化
 */
export function toCamelCase(str: string): string {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        })
        .replace(/\s+/g, '');
}

/**
 * 短横线命名格式化
 */
export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

/**
 * 下划线命名格式化
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}
