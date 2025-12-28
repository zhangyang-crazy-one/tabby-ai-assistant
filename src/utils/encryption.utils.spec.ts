import {
    encrypt,
    decrypt,
    deriveKey,
    generateSalt,
    hash,
    verifyHash,
    encryptObject,
    decryptObject,
    generateToken,
    base64Encode,
    base64Decode,
    secureCompare,
    clearSensitiveData,
    createSecureConfig,
    parseSecureConfig,
    hashPassword,
    verifyPassword
} from './encryption.utils';

describe('EncryptionUtils', () => {
    const testText = 'Hello, World!';
    const testKey = 'my-secret-key-123';
    const testPassword = 'SecurePassword123!';
    const testObject = { name: 'John', age: 30, apiKey: 'secret-key' };

    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt text correctly', () => {
            const encrypted = encrypt(testText, testKey);
            expect(encrypted).not.toBe(testText);

            const decrypted = decrypt(encrypted, testKey);
            expect(decrypted).toBe(testText);
        });

        it('should throw error for empty inputs', () => {
            expect(() => encrypt('', testKey)).toThrow();
            expect(() => encrypt(testText, '')).toThrow();
        });

        it('should throw error for invalid decryption', () => {
            const encrypted = encrypt(testText, testKey);
            expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
        });
    });

    describe('deriveKey', () => {
        it('should derive key from password and salt', () => {
            const salt = generateSalt();
            const key1 = deriveKey(testPassword, salt);
            const key2 = deriveKey(testPassword, salt);

            expect(key1).toBe(key2);
        });

        it('should produce different keys for different salts', () => {
            const salt1 = generateSalt();
            const salt2 = generateSalt();
            const key1 = deriveKey(testPassword, salt1);
            const key2 = deriveKey(testPassword, salt2);

            expect(key1).not.toBe(key2);
        });
    });

    describe('hash and verifyHash', () => {
        it('should hash text correctly', () => {
            const hash1 = hash(testText);
            const hash2 = hash(testText);

            expect(hash1).toBe(hash2);
        });

        it('should verify hash correctly', () => {
            const salt = generateSalt();
            const hashValue = hash(testText, salt);

            expect(verifyHash(testText, hashValue, salt)).toBe(true);
            expect(verifyHash('wrong-text', hashValue, salt)).toBe(false);
        });
    });

    describe('encryptObject and decryptObject', () => {
        it('should encrypt and decrypt objects correctly', () => {
            const encrypted = encryptObject(testObject, testKey);
            const decrypted = decryptObject(encrypted, testKey);

            expect(decrypted).toEqual(testObject);
        });

        it('should throw error for invalid decryption', () => {
            const encrypted = encryptObject(testObject, testKey);
            expect(() => decryptObject(encrypted, 'wrong-key')).toThrow();
        });
    });

    describe('generateToken', () => {
        it('should generate tokens of correct length', () => {
            const token1 = generateToken(32);
            const token2 = generateToken(64);

            expect(token1.length).toBe(32);
            expect(token2.length).toBe(64);
        });

        it('should generate different tokens', () => {
            const token1 = generateToken();
            const token2 = generateToken();

            expect(token1).not.toBe(token2);
        });
    });

    describe('base64Encode and base64Decode', () => {
        it('should encode and decode text correctly', () => {
            const encoded = base64Encode(testText);
            const decoded = base64Decode(encoded);

            expect(decoded).toBe(testText);
        });

        it('should handle special characters', () => {
            const specialText = 'Hello 世界!@#$%';
            const encoded = base64Encode(specialText);
            const decoded = base64Decode(encoded);

            expect(decoded).toBe(specialText);
        });
    });

    describe('secureCompare', () => {
        it('should return true for equal strings', () => {
            expect(secureCompare('test', 'test')).toBe(true);
        });

        it('should return false for different strings', () => {
            expect(secureCompare('test', 'Test')).toBe(false);
            expect(secureCompare('test', 'testing')).toBe(false);
        });

        it('should prevent timing attacks', () => {
            // This is a basic test - in reality, timing attack prevention
            // would require more sophisticated testing
            const start1 = performance.now();
            secureCompare('a'.repeat(1000), 'b'.repeat(1000));
            const time1 = performance.now() - start1;

            const start2 = performance.now();
            secureCompare('a', 'b');
            const time2 = performance.now() - start2;

            // Times should be relatively similar (within an order of magnitude)
            expect(Math.abs(time1 - time2)).toBeLessThan(time2 * 10);
        });
    });

    describe('clearSensitiveData', () => {
        it('should clear sensitive fields', () => {
            const data = { ...testObject };
            clearSensitiveData(data);

            expect(data.apiKey).toBe('********');
            expect(data.name).toBe('John');
            expect(data.age).toBe(30);
        });

        it('should recursively clear nested objects', () => {
            const nestedData = {
                user: {
                    name: 'John',
                    password: 'secret',
                    apiKey: 'key123'
                },
                normalField: 'value'
            };

            clearSensitiveData(nestedData);

            expect(nestedData.user.password).toBe('********');
            expect(nestedData.user.apiKey).toBe('********');
            expect(nestedData.user.name).toBe('John');
            expect(nestedData.normalField).toBe('value');
        });

        it('should handle arrays', () => {
            const arrayData = [
                { apiKey: 'key1', name: 'Item 1' },
                { password: 'pass2', value: 'Item 2' }
            ];

            clearSensitiveData(arrayData);

            expect(arrayData[0].apiKey).toBe('********');
            expect(arrayData[1].password).toBe('********');
        });
    });

    describe('createSecureConfig and parseSecureConfig', () => {
        it('should create and parse secure config', () => {
            const masterPassword = 'master-password-123';
            const configData = { apiKey: 'test-key', setting: 'value' };

            const { encrypted, salt } = createSecureConfig(configData, masterPassword);
            expect(encrypted).toBeDefined();
            expect(salt).toBeDefined();

            const parsed = parseSecureConfig(encrypted, salt, masterPassword);
            expect(parsed).toEqual(configData);
        });

        it('should throw error with wrong master password', () => {
            const masterPassword = 'master-password-123';
            const wrongPassword = 'wrong-password';
            const configData = { apiKey: 'test-key' };

            const { encrypted, salt } = createSecureConfig(configData, masterPassword);

            expect(() => parseSecureConfig(encrypted, salt, wrongPassword)).toThrow();
        });
    });

    describe('hashPassword and verifyPassword', () => {
        it('should hash and verify passwords correctly', () => {
            const { hash: passwordHash, salt } = hashPassword(testPassword);

            expect(passwordHash).toBeDefined();
            expect(salt).toBeDefined();
            expect(passwordHash.length).toBe(64); // SHA256 hex string length

            expect(verifyPassword(testPassword, passwordHash, salt)).toBe(true);
            expect(verifyPassword('wrong-password', passwordHash, salt)).toBe(false);
        });

        it('should handle custom salt', () => {
            const customSalt = generateSalt();
            const { hash: hash1 } = hashPassword(testPassword, customSalt);
            const { hash: hash2 } = hashPassword(testPassword, customSalt);

            expect(hash1).toBe(hash2);
        });

        it('should validate password strength', () => {
            const weakResult = hashPassword('123');
            expect(weakResult.valid).toBe(false);

            const strongResult = hashPassword(testPassword);
            expect(strongResult.valid).toBe(true);
        });
    });
});
