/**
 * templateManager.test.js - Testes unitários para TemplateManager
 *
 * Foca em _hasTopicFields e buildFieldRegistry que foram corrigidos.
 */

// Instalar mock do vscode antes de importar o módulo
require('../helpers/mockVscode').install();

const assert = require('assert');
const TemplateManager = require('../../../src/core/templateManager');

describe('TemplateManager', () => {
    let manager;

    beforeEach(() => {
        manager = new TemplateManager();
    });

    describe('_hasTopicFields', () => {
        it('should return true for TOPIC fields with ONTOLOGY scope', () => {
            const template = {
                fields: [
                    { name: 'topic', type: 'TOPIC', scope: 'ONTOLOGY' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), true);
        });

        it('should return true for ENUMERATED fields with ONTOLOGY scope', () => {
            const template = {
                fields: [
                    { name: 'topic', type: 'ENUMERATED', scope: 'ONTOLOGY' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), true);
        });

        it('should return true for ORDERED fields with ONTOLOGY scope', () => {
            const template = {
                fields: [
                    { name: 'rank', type: 'ORDERED', scope: 'ONTOLOGY' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), true);
        });

        it('should return false for TOPIC fields without ONTOLOGY scope', () => {
            const template = {
                fields: [
                    { name: 'topic', type: 'TOPIC', scope: 'ITEM' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), false);
        });

        it('should return false for ENUMERATED fields without ONTOLOGY scope', () => {
            const template = {
                fields: [
                    { name: 'category', type: 'ENUMERATED', scope: 'ITEM' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), false);
        });

        it('should return false for non-topic field types', () => {
            const template = {
                fields: [
                    { name: 'code', type: 'CODE', scope: 'ITEM' },
                    { name: 'chain', type: 'CHAIN', scope: 'ITEM' },
                    { name: 'text', type: 'QUOTATION', scope: 'ITEM' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), false);
        });

        it('should return false for null template', () => {
            assert.strictEqual(manager._hasTopicFields(null), false);
        });

        it('should return false for template without fields array', () => {
            assert.strictEqual(manager._hasTopicFields({}), false);
            assert.strictEqual(manager._hasTopicFields({ fields: 'not an array' }), false);
        });

        it('should return false for empty fields array', () => {
            assert.strictEqual(manager._hasTopicFields({ fields: [] }), false);
        });

        it('should handle mixed fields correctly', () => {
            const template = {
                fields: [
                    { name: 'code', type: 'CODE', scope: 'ITEM' },
                    { name: 'text', type: 'QUOTATION', scope: 'ITEM' },
                    { name: 'topic', type: 'ENUMERATED', scope: 'ONTOLOGY' }
                ]
            };
            assert.strictEqual(manager._hasTopicFields(template), true);
        });
    });

    describe('_hasChainFields', () => {
        it('should return true when CHAIN fields exist', () => {
            const template = {
                fields: [{ name: 'chain', type: 'CHAIN', scope: 'ITEM' }]
            };
            assert.strictEqual(manager._hasChainFields(template), true);
        });

        it('should return false when no CHAIN fields', () => {
            const template = {
                fields: [{ name: 'code', type: 'CODE', scope: 'ITEM' }]
            };
            assert.strictEqual(manager._hasChainFields(template), false);
        });

        it('should return false for null template', () => {
            assert.strictEqual(manager._hasChainFields(null), false);
        });
    });

    describe('buildFieldRegistry', () => {
        it('should convert template fields to registry object', () => {
            const template = {
                fields: [
                    { name: 'code', type: 'CODE', scope: 'ITEM' },
                    { name: 'topic', type: 'ENUMERATED', scope: 'ONTOLOGY', values: [{ label: 'a' }] }
                ]
            };

            const registry = manager.buildFieldRegistry(template);

            assert.strictEqual(registry.code.type, 'CODE');
            assert.strictEqual(registry.code.scope, 'ITEM');
            assert.strictEqual(registry.topic.type, 'ENUMERATED');
            assert.strictEqual(registry.topic.scope, 'ONTOLOGY');
            assert.ok(Array.isArray(registry.topic.values));
        });

        it('should return empty object for null template', () => {
            const registry = manager.buildFieldRegistry(null);
            assert.deepStrictEqual(registry, {});
        });

        it('should return empty object for template without fields', () => {
            const registry = manager.buildFieldRegistry({});
            assert.deepStrictEqual(registry, {});
        });

        it('should preserve relations in CHAIN fields', () => {
            const template = {
                fields: [
                    { name: 'chain', type: 'CHAIN', scope: 'ITEM', relations: ['enables', 'constrains'] }
                ]
            };

            const registry = manager.buildFieldRegistry(template);
            assert.deepStrictEqual(registry.chain.relations, ['enables', 'constrains']);
        });
    });

    describe('invalidateCache', () => {
        it('should clear all caches when called without argument', () => {
            manager.cache.set('key1', { field1: {} });
            manager.cacheInfo.set('key1', { fromTemplate: true });

            manager.invalidateCache();

            assert.strictEqual(manager.cache.size, 0);
            assert.strictEqual(manager.cacheInfo.size, 0);
        });

        it('should clear specific cache when called with URI', () => {
            manager.cache.set('/path/a.synp', { field1: {} });
            manager.cache.set('/path/b.synp', { field2: {} });
            manager.cacheInfo.set('/path/a.synp', { fromTemplate: true });
            manager.cacheInfo.set('/path/b.synp', { fromTemplate: true });

            manager.invalidateCache({ fsPath: '/path/a.synp' });

            assert.strictEqual(manager.cache.has('/path/a.synp'), false);
            assert.strictEqual(manager.cache.has('/path/b.synp'), true);
        });
    });

    describe('getTemplateInfo', () => {
        it('should return cached info', () => {
            manager.cacheInfo.set('/path/project.synp', {
                fromTemplate: true,
                hasChainFields: false,
                hasTopicFields: true
            });

            const info = manager.getTemplateInfo({ fsPath: '/path/project.synp' });
            assert.strictEqual(info.fromTemplate, true);
            assert.strictEqual(info.hasTopicFields, true);
        });

        it('should return null for uncached project', () => {
            const info = manager.getTemplateInfo({ fsPath: '/unknown.synp' });
            assert.strictEqual(info, null);
        });
    });

    describe('getDefaults', () => {
        it('should return default fields with expected keys', () => {
            const defaults = manager.getDefaults();
            assert.ok(defaults.code);
            assert.ok(defaults.chain);
            assert.ok(defaults.text);
            assert.ok(defaults.note);
            assert.strictEqual(defaults.code.type, 'CODE');
            assert.strictEqual(defaults.chain.type, 'CHAIN');
        });
    });
});
