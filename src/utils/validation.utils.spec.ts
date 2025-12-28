import {
    validateApiKey,
    validateUrl,
    validateModel,
    validateTemperature,
    validateMaxTokens,
    validateCommand,
    validateEmail,
    validatePassword,
    validatePort,
    validateJson,
    validateFilePath
} from './validation.utils';

describe('ValidationUtils', () => {
    describe('validateApiKey', () => {
        it('should validate OpenAI API keys', () => {
            const result = validateApiKey('sk-test123456789', 'openai');
            expect(result.valid).toBe(true);

            const invalidResult = validateApiKey('invalid-key', 'openai');
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.error).toContain('sk-');
        });

        it('should validate Anthropic API keys', () => {
            const result = validateApiKey('sk-ant-test123456789', 'anthropic');
            expect(result.valid).toBe(true);

            const invalidResult = validateApiKey('invalid-key', 'anthropic');
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.error).toContain('sk-ant-');
        });

        it('should validate Minimax API keys', () => {
            const result = validateApiKey('minimax-key-123456789', 'minimax');
            expect(result.valid).toBe(true);

            const invalidResult = validateApiKey('short', 'minimax');
            expect(invalidResult.valid).toBe(false);
        });

        it('should validate GLM API keys', () => {
            const result = validateApiKey('glm-key-123456789', 'glm');
            expect(result.valid).toBe(true);
        });

        it('should accept empty keys for compatible provider', () => {
            const result = validateApiKey('', 'openai-compatible');
            expect(result.valid).toBe(true);
        });
    });

    describe('validateUrl', () => {
        it('should validate correct URLs', () => {
            const result = validateUrl('https://api.example.com');
            expect(result.valid).toBe(true);

            const result2 = validateUrl('http://localhost:11434');
            expect(result2.valid).toBe(true);
        });

        it('should reject invalid URLs', () => {
            const result = validateUrl('not-a-url');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('URL');

            const result2 = validateUrl('ftp://example.com');
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('HTTP');
        });

        it('should reject empty URLs', () => {
            const result = validateUrl('');
            expect(result.valid).toBe(false);
        });
    });

    describe('validateModel', () => {
        it('should validate correct model names', () => {
            const result = validateModel('gpt-4', 'openai');
            expect(result.valid).toBe(true);

            const result2 = validateModel('claude-3-sonnet', 'anthropic');
            expect(result2.valid).toBe(true);
        });

        it('should reject invalid model names', () => {
            const result = validateModel('', 'openai');
            expect(result.valid).toBe(false);

            const result2 = validateModel('model@#$%', 'openai');
            expect(result2.valid).toBe(false);
        });
    });

    describe('validateTemperature', () => {
        it('should validate correct temperature values', () => {
            expect(validateTemperature(0).valid).toBe(true);
            expect(validateTemperature(0.7).valid).toBe(true);
            expect(validateTemperature(1.5).valid).toBe(true);
            expect(validateTemperature(2).valid).toBe(true);
        });

        it('should reject invalid temperature values', () => {
            expect(validateTemperature(-0.1).valid).toBe(false);
            expect(validateTemperature(2.1).valid).toBe(false);
            expect(validateTemperature(NaN).valid).toBe(false);
        });
    });

    describe('validateMaxTokens', () => {
        it('should validate correct token values', () => {
            expect(validateMaxTokens(100).valid).toBe(true);
            expect(validateMaxTokens(1000).valid).toBe(true);
            expect(validateMaxTokens(32000).valid).toBe(true);
        });

        it('should reject invalid token values', () => {
            expect(validateMaxTokens(0).valid).toBe(false);
            expect(validateMaxTokens(-100).valid).toBe(false);
            expect(validateMaxTokens(32001).valid).toBe(false);
        });
    });

    describe('validateCommand', () => {
        it('should accept safe commands', () => {
            expect(validateCommand('ls -la').valid).toBe(true);
            expect(validateCommand('git status').valid).toBe(true);
            expect(validateCommand('echo "hello world"').valid).toBe(true);
        });

        it('should reject dangerous commands', () => {
            expect(validateCommand('rm -rf /').valid).toBe(false);
            expect(validateCommand('sudo rm -rf /home').valid).toBe(false);
            expect(validateCommand('chmod 777 /etc/passwd').valid).toBe(false);
            expect(validateCommand('dd if=/dev/zero of=/dev/sda').valid).toBe(false);
        });

        it('should reject commands with injection attempts', () => {
            expect(validateCommand('ls; rm -rf /').valid).toBe(false);
            expect(validateCommand('cat file | sh').valid).toBe(false);
            expect(validateCommand('$(rm -rf /)').valid).toBe(false);
        });
    });

    describe('validateEmail', () => {
        it('should validate correct email addresses', () => {
            expect(validateEmail('test@example.com').valid).toBe(true);
            expect(validateEmail('user.name@domain.co.uk').valid).toBe(true);
        });

        it('should reject invalid email addresses', () => {
            expect(validateEmail('invalid').valid).toBe(false);
            expect(validateEmail('@example.com').valid).toBe(false);
            expect(validateEmail('test@').valid).toBe(false);
        });
    });

    describe('validatePassword', () => {
        it('should validate strong passwords', () => {
            const result = validatePassword('SecurePass123!');
            expect(result.valid).toBe(true);
            expect(result.score).toBeGreaterThan(40);
        });

        it('should reject weak passwords', () => {
            expect(validatePassword('weak').valid).toBe(false);
            expect(validatePassword('password').valid).toBe(false);
            expect(validatePassword('123456').valid).toBe(false);
        });

        it('should score passwords correctly', () => {
            const weak = validatePassword('123');
            expect(weak.score).toBe(0);

            const medium = validatePassword('password123');
            expect(medium.score).toBeGreaterThan(0);
            expect(medium.score).toBeLessThan(50);

            const strong = validatePassword('StrongPass123!');
            expect(strong.score).toBeGreaterThan(60);
        });
    });

    describe('validatePort', () => {
        it('should validate correct ports', () => {
            expect(validatePort(80).valid).toBe(true);
            expect(validatePort(443).valid).toBe(true);
            expect(validatePort(3000).valid).toBe(true);
            expect(validatePort(65535).valid).toBe(true);
        });

        it('should reject invalid ports', () => {
            expect(validatePort(0).valid).toBe(false);
            expect(validatePort(65536).valid).toBe(false);
            expect(validatePort(-1).valid).toBe(false);
        });
    });

    describe('validateJson', () => {
        it('should validate correct JSON', () => {
            const result = validateJson('{"key": "value"}');
            expect(result.valid).toBe(true);
            expect(result.data).toEqual({ key: 'value' });
        });

        it('should reject invalid JSON', () => {
            const result = validateJson('{invalid json}');
            expect(result.valid).toBe(false);
        });
    });

    describe('validateFilePath', () => {
        it('should validate correct file paths', () => {
            expect(validateFilePath('/home/user/file.txt').valid).toBe(true);
            expect(validateFilePath('C:\\Windows\\System32').valid).toBe(true);
        });

        it('should reject invalid file paths', () => {
            expect(validateFilePath('').valid).toBe(false);
            expect(validateFilePath('path<with>invalid').valid).toBe(false);
        });
    });
});
