/**
 * positionUtils.test.js - Testes unitários para positionUtils
 */

const assert = require('assert');
const { buildLineOffsets, getLineColumn } = require('../../../src/utils/positionUtils');

describe('positionUtils', () => {
    describe('buildLineOffsets', () => {
        it('should return [0] for empty string', () => {
            const offsets = buildLineOffsets('');
            assert.deepStrictEqual(offsets, [0]);
        });

        it('should return correct offsets for single line', () => {
            const offsets = buildLineOffsets('hello');
            assert.deepStrictEqual(offsets, [0]);
        });

        it('should return correct offsets for multiple lines', () => {
            const offsets = buildLineOffsets('line1\nline2\nline3');
            assert.deepStrictEqual(offsets, [0, 6, 12]);
        });

        it('should handle trailing newline', () => {
            const offsets = buildLineOffsets('line1\n');
            assert.deepStrictEqual(offsets, [0, 6]);
        });

        it('should handle empty lines', () => {
            const offsets = buildLineOffsets('a\n\nb');
            assert.deepStrictEqual(offsets, [0, 2, 3]);
        });
    });

    describe('getLineColumn', () => {
        it('should return line 0 col 0 for offset 0', () => {
            const offsets = buildLineOffsets('hello\nworld');
            const pos = getLineColumn(offsets, 0);
            assert.deepStrictEqual(pos, { line: 0, column: 0 });
        });

        it('should return correct position within first line', () => {
            const offsets = buildLineOffsets('hello\nworld');
            const pos = getLineColumn(offsets, 3);
            assert.deepStrictEqual(pos, { line: 0, column: 3 });
        });

        it('should return correct position on second line', () => {
            const offsets = buildLineOffsets('hello\nworld');
            const pos = getLineColumn(offsets, 8);
            assert.deepStrictEqual(pos, { line: 1, column: 2 });
        });

        it('should return correct position at start of second line', () => {
            const offsets = buildLineOffsets('hello\nworld');
            const pos = getLineColumn(offsets, 6);
            assert.deepStrictEqual(pos, { line: 1, column: 0 });
        });

        it('should handle empty offsets array', () => {
            const pos = getLineColumn([], 5);
            assert.deepStrictEqual(pos, { line: 0, column: 0 });
        });

        it('should handle negative offset', () => {
            const offsets = buildLineOffsets('hello');
            const pos = getLineColumn(offsets, -1);
            assert.deepStrictEqual(pos, { line: 0, column: 0 });
        });

        it('should handle offset at newline character', () => {
            const offsets = buildLineOffsets('ab\ncd');
            const pos = getLineColumn(offsets, 2);
            assert.deepStrictEqual(pos, { line: 0, column: 2 });
        });
    });
});
