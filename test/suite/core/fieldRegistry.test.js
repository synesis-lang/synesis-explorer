/**
 * fieldRegistry.test.js - Testes unitários para FieldRegistry
 */

const assert = require('assert');
const FieldRegistry = require('../../../src/core/fieldRegistry');

describe('FieldRegistry', () => {
    describe('getCodeFields', () => {
        it('should return fields with type CODE', () => {
            const registry = new FieldRegistry({
                code: { type: 'CODE', scope: 'ITEM' },
                text: { type: 'QUOTATION', scope: 'ITEM' },
                tags: { type: 'CODE', scope: 'ITEM' }
            });

            const codeFields = registry.getCodeFields();
            assert.deepStrictEqual(codeFields.sort(), ['code', 'tags']);
        });

        it('should return empty array when no CODE fields', () => {
            const registry = new FieldRegistry({
                text: { type: 'QUOTATION', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getCodeFields(), []);
        });
    });

    describe('getChainFields', () => {
        it('should return fields with type CHAIN', () => {
            const registry = new FieldRegistry({
                chain: { type: 'CHAIN', scope: 'ITEM' },
                code: { type: 'CODE', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getChainFields(), ['chain']);
        });
    });

    describe('getTopicFields', () => {
        it('should return fields with type TOPIC and scope ONTOLOGY', () => {
            const registry = new FieldRegistry({
                topic: { type: 'TOPIC', scope: 'ONTOLOGY' },
                code: { type: 'CODE', scope: 'ITEM' },
                note: { type: 'TOPIC', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getTopicFields(), ['topic']);
        });

        it('should NOT return TOPIC fields with non-ONTOLOGY scope', () => {
            const registry = new FieldRegistry({
                topic: { type: 'TOPIC', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getTopicFields(), []);
        });
    });

    describe('getOrderedFields', () => {
        it('should return ORDERED fields with ONTOLOGY scope', () => {
            const registry = new FieldRegistry({
                rank: { type: 'ORDERED', scope: 'ONTOLOGY' },
                code: { type: 'CODE', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getOrderedFields(), ['rank']);
        });
    });

    describe('getEnumeratedFields', () => {
        it('should return ENUMERATED fields with ONTOLOGY scope', () => {
            const registry = new FieldRegistry({
                topic: { type: 'ENUMERATED', scope: 'ONTOLOGY' },
                code: { type: 'CODE', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getEnumeratedFields(), ['topic']);
        });

        it('should NOT return ENUMERATED with non-ONTOLOGY scope', () => {
            const registry = new FieldRegistry({
                category: { type: 'ENUMERATED', scope: 'ITEM' }
            });

            assert.deepStrictEqual(registry.getEnumeratedFields(), []);
        });
    });

    describe('isCodeField / isChainField / isTopicField', () => {
        it('should correctly identify field types', () => {
            const registry = new FieldRegistry({
                code: { type: 'CODE', scope: 'ITEM' },
                chain: { type: 'CHAIN', scope: 'ITEM' },
                topic: { type: 'TOPIC', scope: 'ONTOLOGY' }
            });

            assert.strictEqual(registry.isCodeField('code'), true);
            assert.strictEqual(registry.isCodeField('chain'), false);
            assert.strictEqual(registry.isChainField('chain'), true);
            assert.strictEqual(registry.isChainField('code'), false);
            assert.strictEqual(registry.isTopicField('topic'), true);
            assert.strictEqual(registry.isTopicField('code'), false);
        });

        it('should return false for unknown fields', () => {
            const registry = new FieldRegistry({});
            assert.strictEqual(registry.isCodeField('nonexistent'), false);
            assert.strictEqual(registry.isChainField('nonexistent'), false);
            assert.strictEqual(registry.isTopicField('nonexistent'), false);
        });
    });

    describe('getFieldDef', () => {
        it('should return field definition', () => {
            const registry = new FieldRegistry({
                code: { type: 'CODE', scope: 'ITEM' }
            });

            const def = registry.getFieldDef('code');
            assert.strictEqual(def.type, 'CODE');
            assert.strictEqual(def.scope, 'ITEM');
        });

        it('should return null for unknown fields', () => {
            const registry = new FieldRegistry({});
            assert.strictEqual(registry.getFieldDef('missing'), null);
        });
    });

    describe('hasRelations', () => {
        it('should return true for CHAIN fields with relations array', () => {
            const registry = new FieldRegistry({
                chain: { type: 'CHAIN', scope: 'ITEM', relations: ['enables', 'constrains'] }
            });

            assert.strictEqual(registry.hasRelations('chain'), true);
        });

        it('should return false for CHAIN fields without relations', () => {
            const registry = new FieldRegistry({
                chain: { type: 'CHAIN', scope: 'ITEM', relations: null }
            });

            assert.strictEqual(registry.hasRelations('chain'), false);
        });

        it('should return false for non-CHAIN fields', () => {
            const registry = new FieldRegistry({
                code: { type: 'CODE', scope: 'ITEM', relations: ['a'] }
            });

            assert.strictEqual(registry.hasRelations('code'), false);
        });
    });

    describe('constructor with empty/null fields', () => {
        it('should handle null fields', () => {
            const registry = new FieldRegistry(null);
            assert.deepStrictEqual(registry.getCodeFields(), []);
        });

        it('should handle undefined fields', () => {
            const registry = new FieldRegistry();
            assert.deepStrictEqual(registry.getCodeFields(), []);
        });
    });
});
