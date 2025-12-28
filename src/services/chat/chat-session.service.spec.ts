import { TestBed } from '@angular/core/testing';
import { ChatSessionService } from './chat-session.service';
import { AiAssistantService } from '../core/ai-assistant.service';
import { LoggerService } from '../core/logger.service';
import { MessageRole } from '../../types/ai.types';

// Mock AiAssistantService
class MockAiAssistantService {
    async chat(request: any): Promise<any> {
        return {
            message: {
                role: MessageRole.ASSISTANT,
                content: 'AI response',
                timestamp: new Date()
            }
        };
    }
}

// Mock LoggerService
class MockLoggerService {
    info = jest.fn();
    error = jest.fn();
    warn = jest.fn();
}

describe('ChatSessionService', () => {
    let service: ChatSessionService;
    let mockAiService: MockAiAssistantService;
    let mockLogger: MockLoggerService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                ChatSessionService,
                { provide: AiAssistantService, useClass: MockAiAssistantService },
                { provide: LoggerService, useClass: MockLoggerService }
            ]
        });

        service = TestBed.inject(ChatSessionService);
        mockAiService = TestBed.inject(AiAssistantService) as any;
        mockLogger = TestBed.inject(LoggerService) as any;
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    describe('createSession', () => {
        it('should create a new session', () => {
            const sessionId = service.createSession();
            expect(sessionId).toBeDefined();
            expect(sessionId).toMatch(/^session_/);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Created new chat session',
                expect.objectContaining({ sessionId })
            );
        });

        it('should initialize with empty messages', () => {
            service.createSession();
            service.messages$.subscribe(messages => {
                expect(messages).toEqual([]);
            });
        });
    });

    describe('sendMessage', () => {
        it('should send a message and receive response', async () => {
            service.createSession();

            await service.sendMessage('Test message');

            service.messages$.subscribe(messages => {
                expect(messages.length).toBe(2); // User message + AI response
                expect(messages[0].content).toBe('Test message');
                expect(messages[0].role).toBe(MessageRole.USER);
                expect(messages[1].content).toBe('AI response');
                expect(messages[1].role).toBe(MessageRole.ASSISTANT);
            });
        });

        it('should create session if none exists', async () => {
            await service.sendMessage('Test message');

            const sessionId = service.getCurrentSessionId();
            expect(sessionId).toBeDefined();
        });

        it('should handle errors gracefully', async () => {
            mockAiService.chat = jest.fn().mockRejectedValue(new Error('API error'));

            try {
                await service.sendMessage('Test message');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('should set and clear typing indicator', async () => {
            service.createSession();

            let typingStates: boolean[] = [];
            service.isTyping$.subscribe(state => typingStates.push(state));

            await service.sendMessage('Test message');

            // Should be false initially, true during request, false after
            expect(typingStates[typingStates.length - 1]).toBe(false);
        });
    });

    describe('clearSession', () => {
        it('should clear session messages', async () => {
            service.createSession();
            await service.sendMessage('Test message');

            service.clearSession();

            service.messages$.subscribe(messages => {
                expect(messages).toEqual([]);
            });
        });
    });

    describe('deleteMessage', () => {
        it('should delete a specific message', async () => {
            service.createSession();
            await service.sendMessage('Message 1');
            await service.sendMessage('Message 2');

            service.messages$.subscribe(messages => {
                expect(messages.length).toBe(4);
            });

            const messages = service.getCurrentMessages();
            const messageId = messages[0].id;
            service.deleteMessage(messageId);

            service.messages$.subscribe(messages => {
                expect(messages.length).toBe(3);
                expect(messages.find(m => m.id === messageId)).toBeUndefined();
            });
        });
    });

    describe('exportSession', () => {
        it('should export session data', async () => {
            service.createSession();
            await service.sendMessage('Test message');

            const exported = service.exportSession();
            const data = JSON.parse(exported);

            expect(data.sessionId).toBeDefined();
            expect(data.messages).toBeDefined();
            expect(data.timestamp).toBeDefined();
            expect(Array.isArray(data.messages)).toBe(true);
        });
    });

    describe('importSession', () => {
        it('should import session data', () => {
            const sessionData = {
                sessionId: 'test-session',
                messages: [
                    {
                        id: 'msg-1',
                        role: MessageRole.USER,
                        content: 'Test',
                        timestamp: new Date()
                    }
                ],
                timestamp: new Date().toISOString()
            };

            service.importSession(JSON.stringify(sessionData));

            expect(service.getCurrentSessionId()).toBe('test-session');
            service.messages$.subscribe(messages => {
                expect(messages.length).toBe(1);
            });
        });

        it('should throw error for invalid data', () => {
            expect(() => service.importSession('invalid json')).toThrow();
        });
    });

    describe('switchToSession', () => {
        it('should switch to specified session', () => {
            service.createSession();
            const sessionId = service.getCurrentSessionId();

            service.switchToSession('new-session-id');

            expect(service.getCurrentSessionId()).toBe('new-session-id');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Switched to session',
                expect.objectContaining({ sessionId: 'new-session-id' })
            );
        });
    });

    describe('getCurrentMessages', () => {
        it('should return current messages', async () => {
            service.createSession();
            await service.sendMessage('Test message');

            const messages = service.getCurrentMessages();
            expect(messages.length).toBe(2);
        });
    });

    describe('Observable streams', () => {
        it('should emit messages when changed', async () => {
            service.createSession();

            let emittedMessages: any[][] = [];
            service.messages$.subscribe(messages => {
                emittedMessages.push(messages);
            });

            await service.sendMessage('Message 1');

            expect(emittedMessages.length).toBeGreaterThan(1);
            expect(emittedMessages[emittedMessages.length - 1].length).toBe(2);
        });

        it('should emit errors', async () => {
            service.createSession();
            mockAiService.chat = jest.fn().mockRejectedValue(new Error('Test error'));

            let errorMessage: string | undefined;
            service.error$.subscribe(error => {
                errorMessage = error;
            });

            try {
                await service.sendMessage('Test');
            } catch {
                // Ignore
            }

            expect(errorMessage).toBe('Test error');
        });
    });
});
