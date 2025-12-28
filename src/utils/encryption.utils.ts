import * as CryptoJS from 'crypto-js';

/**
 * 加密工具类
 * 提供安全的加密和解密功能
 */

const KEY_SIZE = 256;
const IV_SIZE = 16;

/**
 * 生成随机密钥
 */
export function generateKey(): string {
    return CryptoJS.lib.WordArray.random(KEY_SIZE / 8).toString();
}

/**
 * 生成随机初始化向量
 */
export function generateIV(): string {
    return CryptoJS.lib.WordArray.random(IV_SIZE).toString();
}

/**
 * 使用AES加密字符串
 */
export function encrypt(text: string, key: string): string {
    if (text === null || text === undefined || key === null || key === undefined) {
        throw new Error('文本和密钥不能为空');
    }

    try {
        // 确保输入是字符串
        const strText = String(text);
        const strKey = String(key);
        const encrypted = CryptoJS.AES.encrypt(strText, strKey);
        return encrypted.toString();
    } catch (error) {
        throw new Error(`加密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 使用AES解密字符串
 */
export function decrypt(encryptedText: string, key: string): string {
    if (encryptedText === null || encryptedText === undefined || key === null || key === undefined) {
        throw new Error('加密文本和密钥不能为空');
    }

    try {
        // 确保输入是字符串
        const strEncryptedText = String(encryptedText);
        const strKey = String(key);
        const decrypted = CryptoJS.AES.decrypt(strEncryptedText, strKey);
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 使用PBKDF2派生密钥
 */
export function deriveKey(password: string, salt: string, iterations: number = 10000): string {
    if (!password || !salt) {
        throw new Error('密码和盐值不能为空');
    }

    try {
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: KEY_SIZE / 32,
            iterations: iterations
        });
        return key.toString();
    } catch (error) {
        throw new Error(`密钥派生失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 生成加密盐值
 */
export function generateSalt(): string {
    return CryptoJS.lib.WordArray.random(128 / 8).toString();
}

/**
 * 安全的哈希函数
 */
export function hash(text: string, salt?: string): string {
    if (!text) {
        throw new Error('文本不能为空');
    }

    try {
        const data = salt ? text + salt : text;
        return CryptoJS.SHA256(data).toString();
    } catch (error) {
        throw new Error(`哈希失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 验证哈希值
 */
export function verifyHash(text: string, hashValue: string, salt?: string): boolean {
    try {
        const computedHash = hash(text, salt);
        return computedHash === hashValue;
    } catch {
        return false;
    }
}

/**
 * 加密对象
 */
export function encryptObject(obj: any, key: string): string {
    if (!obj || !key) {
        throw new Error('对象和密钥不能为空');
    }

    try {
        const jsonString = JSON.stringify(obj);
        return encrypt(jsonString, key);
    } catch (error) {
        throw new Error(`对象加密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 解密对象
 */
export function decryptObject<T>(encryptedText: string, key: string): T {
    if (!encryptedText || !key) {
        throw new Error('加密文本和密钥不能为空');
    }

    try {
        const jsonString = decrypt(encryptedText, key);
        return JSON.parse(jsonString) as T;
    } catch (error) {
        throw new Error(`对象解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 生成令牌
 */
export function generateToken(length: number = 32): string {
    return CryptoJS.lib.WordArray.random(length).toString();
}

/**
 * Base64编码
 */
export function base64Encode(text: string): string {
    if (text === null || text === undefined) {
        throw new Error('文本不能为空');
    }

    try {
        // 确保输入是字符串
        const str = String(text);
        return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(str));
    } catch (error) {
        throw new Error(`Base64编码失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Base64解码
 */
export function base64Decode(encodedText: string): string {
    if (encodedText === null || encodedText === undefined) {
        throw new Error('编码文本不能为空');
    }

    try {
        // 确保输入是字符串
        const str = String(encodedText);
        return CryptoJS.enc.Base64.parse(str).toString(CryptoJS.enc.Utf8);
    } catch (error) {
        throw new Error(`Base64解码失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 安全地比较两个字符串（防止时序攻击）
 */
export function secureCompare(a: any, b: any): boolean {
    // 确保输入是字符串
    const strA = a != null ? String(a) : '';
    const strB = b != null ? String(b) : '';

    if (strA.length !== strB.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < strA.length; i++) {
        const codeA = strA.charCodeAt(i);
        const codeB = strB.charCodeAt(i);
        // 确保charCodeAt返回有效值
        if (typeof codeA !== 'number' || typeof codeB !== 'number') {
            return false;
        }
        result |= codeA ^ codeB;
    }

    return result === 0;
}

/**
 * 清除敏感数据
 */
export function clearSensitiveData(obj: any): void {
    if (!obj) return;

    const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'key', 'credential'];

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const lowerKey = key.toLowerCase();

            if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                obj[key] = '********';
            } else if (typeof obj[key] === 'object') {
                clearSensitiveData(obj[key]);
            }
        }
    }
}

/**
 * 生成加密的配置对象
 */
export function createSecureConfig(data: any, masterPassword: string): { encrypted: string; salt: string } {
    if (!data || !masterPassword) {
        throw new Error('数据和主密码不能为空');
    }

    const salt = generateSalt();
    const key = deriveKey(masterPassword, salt);
    const encrypted = encryptObject(data, key);

    return { encrypted, salt };
}

/**
 * 解密配置对象
 */
export function parseSecureConfig(encryptedData: string, salt: string, masterPassword: string): any {
    if (!encryptedData || !salt || !masterPassword) {
        throw new Error('加密数据、盐值和主密码不能为空');
    }

    const key = deriveKey(masterPassword, salt);
    return decryptObject(encryptedData, key);
}

/**
 * 检查密码强度并生成哈希
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string; valid: boolean } {
    if (!password) {
        return { hash: '', salt: '', valid: false };
    }

    const passwordSalt = salt || generateSalt();
    const passwordHash = hash(password, passwordSalt);

    return {
        hash: passwordHash,
        salt: passwordSalt,
        valid: password.length >= 8
    };
}

/**
 * 验证密码
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
    if (!password || !hash || !salt) {
        return false;
    }

    return verifyHash(password, hash, salt);
}
