/**
 * mermaidUtils.test.js - Testes unitários para mermaidUtils
 */

const assert = require('assert');
const {
    generateMermaidGraph,
    ensureNodeId,
    getNodeClass,
    escapeMermaidLabel
} = require('../../../src/utils/mermaidUtils');

describe('mermaidUtils', () => {
    describe('ensureNodeId', () => {
        it('should generate a valid node id from name', () => {
            const map = new Map();
            const id = ensureNodeId(map, 'usability');
            assert.strictEqual(id, 'usability');
            assert.strictEqual(map.get('usability'), 'usability');
        });

        it('should replace special characters with underscore', () => {
            const map = new Map();
            const id = ensureNodeId(map, 'code A');
            assert.strictEqual(id, 'code_A');
        });

        it('should prefix numeric-starting ids', () => {
            const map = new Map();
            const id = ensureNodeId(map, '123abc');
            assert.strictEqual(id, 'n_123abc');
        });

        it('should reuse existing id for same name', () => {
            const map = new Map();
            const id1 = ensureNodeId(map, 'test');
            const id2 = ensureNodeId(map, 'test');
            assert.strictEqual(id1, id2);
        });

        it('should generate unique ids for collisions', () => {
            const map = new Map();
            const id1 = ensureNodeId(map, 'code A');
            const id2 = ensureNodeId(map, 'code-A');
            // Both would normalize to code_A, second should get a suffix
            assert.notStrictEqual(id1, id2);
        });
    });

    describe('getNodeClass', () => {
        it('should return "enable" for labels containing "enable"', () => {
            assert.strictEqual(getNodeClass('enables'), 'enable');
        });

        it('should return "constrain" for labels containing "constrain"', () => {
            assert.strictEqual(getNodeClass('constrains'), 'constrain');
        });

        it('should return "enable" for Portuguese "habilita"', () => {
            assert.strictEqual(getNodeClass('habilita'), 'enable');
        });

        it('should return "constrain" for Portuguese "restringe"', () => {
            assert.strictEqual(getNodeClass('restringe'), 'constrain');
        });

        it('should return "node" for other labels', () => {
            assert.strictEqual(getNodeClass('relates_to'), 'node');
        });

        it('should handle null input', () => {
            assert.strictEqual(getNodeClass(null), 'node');
        });
    });

    describe('escapeMermaidLabel', () => {
        it('should escape double quotes', () => {
            assert.strictEqual(escapeMermaidLabel('say "hello"'), 'say \\"hello\\"');
        });

        it('should handle empty string', () => {
            assert.strictEqual(escapeMermaidLabel(''), '');
        });

        it('should handle null', () => {
            assert.strictEqual(escapeMermaidLabel(null), '');
        });
    });

    describe('generateMermaidGraph', () => {
        it('should return null for empty relations', () => {
            assert.strictEqual(generateMermaidGraph('@ref', []), null);
            assert.strictEqual(generateMermaidGraph('@ref', null), null);
        });

        it('should generate flowchart with nodes and edges', () => {
            const relations = [
                { from: 'A', to: 'B', label: 'enables' }
            ];

            const mermaid = generateMermaidGraph('@test', relations);
            assert.ok(mermaid.includes('flowchart LR'));
            assert.ok(mermaid.includes('A'));
            assert.ok(mermaid.includes('B'));
            assert.ok(mermaid.includes('enables'));
        });

        it('should include class definitions', () => {
            const relations = [{ from: 'A', to: 'B', label: 'x' }];
            const mermaid = generateMermaidGraph('@test', relations);

            assert.ok(mermaid.includes('classDef enable'));
            assert.ok(mermaid.includes('classDef constrain'));
            assert.ok(mermaid.includes('classDef node'));
        });

        it('should handle multiple relations', () => {
            const relations = [
                { from: 'A', to: 'B', label: 'enables' },
                { from: 'B', to: 'C', label: 'constrains' }
            ];

            const mermaid = generateMermaidGraph('@test', relations);
            assert.ok(mermaid.includes('A'));
            assert.ok(mermaid.includes('B'));
            assert.ok(mermaid.includes('C'));
        });

        it('should handle edges without labels', () => {
            const relations = [
                { from: 'A', to: 'B', label: '' }
            ];

            const mermaid = generateMermaidGraph('@test', relations);
            assert.ok(mermaid.includes('-->'));
            assert.ok(!mermaid.includes('-->|'));
        });
    });
});
