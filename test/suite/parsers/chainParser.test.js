/**
 * chainParser.test.js - Testes unitários para chainParser
 */

const assert = require('assert');
const { parseChain } = require('../../../src/parsers/chainParser');

describe('chainParser', () => {
    describe('parseChain', () => {
        it('should return empty result for empty input', () => {
            const result = parseChain('', {});
            assert.deepStrictEqual(result.codes, []);
            assert.deepStrictEqual(result.relations, []);
            assert.strictEqual(result.type, 'simple');
        });

        it('should return empty result for null input', () => {
            const result = parseChain(null, {});
            assert.deepStrictEqual(result.codes, []);
            assert.deepStrictEqual(result.relations, []);
        });

        it('should parse simple chain (no defined relations)', () => {
            const result = parseChain('A -> B -> C', {});

            assert.deepStrictEqual(result.codes, ['A', 'B', 'C']);
            assert.deepStrictEqual(result.relations, ['relates_to', 'relates_to']);
            assert.strictEqual(result.type, 'simple');
        });

        it('should parse qualified chain (with defined relations)', () => {
            const fieldDef = { relations: ['enables', 'constrains'] };
            const result = parseChain('A -> enables -> B', fieldDef);

            assert.deepStrictEqual(result.codes, ['A', 'B']);
            assert.deepStrictEqual(result.relations, ['enables']);
            assert.strictEqual(result.type, 'qualified');
        });

        it('should trim whitespace from codes', () => {
            const result = parseChain('  A  ->  B  ', {});
            assert.deepStrictEqual(result.codes, ['A', 'B']);
        });

        it('should handle single code (no arrow)', () => {
            const result = parseChain('onlyCode', {});
            assert.deepStrictEqual(result.codes, ['onlyCode']);
            assert.deepStrictEqual(result.relations, []);
        });

        it('should handle qualified chain with multiple relations', () => {
            const fieldDef = { relations: ['enables', 'constrains'] };
            const result = parseChain('A -> enables -> B -> constrains -> C', fieldDef);

            assert.deepStrictEqual(result.codes, ['A', 'B', 'C']);
            assert.deepStrictEqual(result.relations, ['enables', 'constrains']);
        });

        it('should treat empty relations array as simple', () => {
            const fieldDef = { relations: [] };
            const result = parseChain('A -> B', fieldDef);

            assert.strictEqual(result.type, 'simple');
            assert.deepStrictEqual(result.codes, ['A', 'B']);
        });

        it('should handle fieldDef without relations property', () => {
            const result = parseChain('A -> B', { type: 'CHAIN' });
            assert.strictEqual(result.type, 'simple');
        });
    });
});
