// 简化测试配置
// 模拟localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// 模拟navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
        readText: jest.fn().mockImplementation(() => Promise.resolve())
    }
});

// 模拟crypto
Object.defineProperty(global, 'crypto', {
    value: {
        getRandomValues: jest.fn().mockReturnValue(new Uint8Array(32)),
        subtle: {
            digest: jest.fn().mockImplementation(() => Promise.resolve(new ArrayBuffer(32)))
        }
    }
});

// 模拟console.log以减少测试输出噪音
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};
