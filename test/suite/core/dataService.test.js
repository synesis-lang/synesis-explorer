/**
 * dataService.test.js - Testes unitários para DataService
 *
 * Foca em _trackLspNull e lógica de fallback.
 */

// Instalar mock do vscode antes de importar o módulo
require('../helpers/mockVscode').install();

const assert = require('assert');
const DataService = require('../../../src/services/dataService');

/**
 * Cria um mock de LSP client
 */
function createMockLspClient({ isReady = true, responses = {} } = {}) {
    return {
        isReady: () => isReady,
        sendRequest: async (method, params) => {
            if (responses[method] !== undefined) {
                const response = responses[method];
                if (response instanceof Error) {
                    throw response;
                }
                return response;
            }
            return null;
        }
    };
}

/**
 * Cria mocks mínimos para WorkspaceScanner e TemplateManager
 */
function createMockScanner() {
    return {
        findProjectFile: async () => null,
        findSynFiles: async () => [],
        findSynoFiles: async () => [],
        findTemplateFile: async () => null
    };
}

function createMockTemplateManager() {
    return {
        loadTemplate: async () => ({}),
        getTemplateInfo: () => null,
        invalidateCache: () => {}
    };
}

describe('DataService', () => {
    describe('_trackLspNull', () => {
        it('should call onLspIncompatible after 3 null responses', () => {
            let incompatibleCalled = false;

            const service = new DataService({
                lspClient: createMockLspClient(),
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager(),
                onLspIncompatible: () => { incompatibleCalled = true; }
            });

            service._trackLspNull();
            assert.strictEqual(incompatibleCalled, false);
            assert.strictEqual(service._lspNullCount, 1);

            service._trackLspNull();
            assert.strictEqual(incompatibleCalled, false);
            assert.strictEqual(service._lspNullCount, 2);

            service._trackLspNull();
            assert.strictEqual(incompatibleCalled, true);
            assert.strictEqual(service._lspNullCount, 3);
            assert.strictEqual(service._lspNullWarned, true);
        });

        it('should only call onLspIncompatible once', () => {
            let callCount = 0;

            const service = new DataService({
                lspClient: createMockLspClient(),
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager(),
                onLspIncompatible: () => { callCount += 1; }
            });

            for (let i = 0; i < 10; i++) {
                service._trackLspNull();
            }

            assert.strictEqual(callCount, 1);
        });

        it('should not crash when onLspIncompatible is not provided', () => {
            const service = new DataService({
                lspClient: createMockLspClient(),
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            // Should not throw
            for (let i = 0; i < 5; i++) {
                service._trackLspNull();
            }

            assert.strictEqual(service._lspNullCount, 5);
        });
    });

    describe('_isMethodNotFound', () => {
        it('should detect error code -32601', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.strictEqual(service._isMethodNotFound({ code: -32601, message: 'err' }), true);
        });

        it('should detect "Method Not Found" in message', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.strictEqual(service._isMethodNotFound({ message: 'Method Not Found' }), true);
        });

        it('should return false for other errors', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.strictEqual(service._isMethodNotFound({ code: -32600, message: 'err' }), false);
            assert.strictEqual(service._isMethodNotFound(null), false);
        });
    });

    describe('constructor', () => {
        it('should initialize lspNullCount and lspNullWarned', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.strictEqual(service._lspNullCount, 0);
            assert.strictEqual(service._lspNullWarned, false);
        });

        it('should create lspProvider when lspClient is provided', () => {
            const service = new DataService({
                lspClient: createMockLspClient(),
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.ok(service.lspProvider);
        });

        it('should set lspProvider to null when lspClient not provided', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            assert.strictEqual(service.lspProvider, null);
        });

        it('should store onLspIncompatible callback', () => {
            const callback = () => {};
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager(),
                onLspIncompatible: callback
            });

            assert.strictEqual(service.onLspIncompatible, callback);
        });

        it('should set onLspIncompatible to null for non-function values', () => {
            const service = new DataService({
                lspClient: null,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager(),
                onLspIncompatible: 'not a function'
            });

            assert.strictEqual(service.onLspIncompatible, null);
        });
    });

    describe('_tryLspThenLocal fallback', () => {
        it('should fall back to local when LSP returns null', async () => {
            const mockLsp = createMockLspClient({
                isReady: true,
                responses: {
                    'synesis/getReferences': null,
                    'synesis/get_references': null
                }
            });

            let localCalled = false;
            const service = new DataService({
                lspClient: mockLsp,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            // Override local provider for testing
            service.localProvider.getReferences = async () => {
                localCalled = true;
                return [];
            };

            await service.getReferences();
            assert.strictEqual(localCalled, true);
        });

        it('should use LSP result when available', async () => {
            const expectedRefs = [{ bibref: '@test', itemCount: 1, occurrences: [] }];
            const mockLsp = createMockLspClient({
                isReady: true,
                responses: {
                    'synesis/getReferences': { success: true, references: [] }
                }
            });

            const service = new DataService({
                lspClient: mockLsp,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            // The LSP returns empty array (not null), so local should NOT be called
            let localCalled = false;
            service.localProvider.getReferences = async () => {
                localCalled = true;
                return expectedRefs;
            };

            const result = await service.getReferences();
            assert.strictEqual(localCalled, false);
        });

        it('should fall back to local when LSP is not ready', async () => {
            const mockLsp = createMockLspClient({ isReady: false });

            let localCalled = false;
            const service = new DataService({
                lspClient: mockLsp,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            service.localProvider.getReferences = async () => {
                localCalled = true;
                return [];
            };

            await service.getReferences();
            assert.strictEqual(localCalled, true);
        });

        it('should fall back to local when LSP throws error', async () => {
            const mockLsp = createMockLspClient({ isReady: true });
            mockLsp.sendRequest = async () => { throw new Error('Connection lost'); };

            let localCalled = false;
            const service = new DataService({
                lspClient: mockLsp,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            service.localProvider.getReferences = async () => {
                localCalled = true;
                return [];
            };

            await service.getReferences();
            assert.strictEqual(localCalled, true);
        });

        it('should mark method as unsupported on Method Not Found error', async () => {
            const mockLsp = createMockLspClient({ isReady: true });
            mockLsp.sendRequest = async () => {
                const error = new Error('Method Not Found');
                error.code = -32601;
                throw error;
            };

            const service = new DataService({
                lspClient: mockLsp,
                workspaceScanner: createMockScanner(),
                templateManager: createMockTemplateManager()
            });

            service.localProvider.getReferences = async () => [];

            await service.getReferences();
            assert.strictEqual(service.unsupportedMethods.has('getReferences'), true);
        });
    });
});
