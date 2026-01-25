/**
 * synesisParser.test.js - Testes unitários para SynesisParser
 */

const assert = require('assert');
const SynesisParser = require('../../../src/parsers/synesisParser');

describe('SynesisParser', () => {
    let parser;

    beforeEach(() => {
        parser = new SynesisParser();
    });

    describe('parseSourceBlocks', () => {
        it('should parse a single SOURCE block', () => {
            const content = `
SOURCE @test2020
    description: Test description
    method: Test method
END SOURCE
`;
            const sources = parser.parseSourceBlocks(content, 'test.syn');

            assert.strictEqual(sources.length, 1);
            assert.strictEqual(sources[0].bibref, '@test2020');
            assert.strictEqual(sources[0].fields.description, 'Test description');
            assert.strictEqual(sources[0].fields.method, 'Test method');
        });

        it('should accept hyphen and dot in bibrefs and field names', () => {
            const content = `
SOURCE @ref-1.2
    method.v1: Test method
    code-name: Alpha
END SOURCE
`;
            const sources = parser.parseSourceBlocks(content, 'test.syn');

            assert.strictEqual(sources.length, 1);
            assert.strictEqual(sources[0].bibref, '@ref-1.2');
            assert.strictEqual(sources[0].fields['method.v1'], 'Test method');
            assert.strictEqual(sources[0].fields['code-name'], 'Alpha');
        });

        it('should accept unicode in bibrefs and field names', () => {
            const content = `
SOURCE @café2020
    descrição: Texto com acento
END SOURCE
`;
            const sources = parser.parseSourceBlocks(content, 'test.syn');

            assert.strictEqual(sources.length, 1);
            assert.strictEqual(sources[0].bibref, '@café2020');
            assert.strictEqual(sources[0].fields['descrição'], 'Texto com acento');
        });

        it('should parse multiple SOURCE blocks', () => {
            const content = `
SOURCE @ref1
    description: First
END SOURCE

SOURCE @ref2
    description: Second
END SOURCE
`;
            const sources = parser.parseSourceBlocks(content, 'test.syn');

            assert.strictEqual(sources.length, 2);
            assert.strictEqual(sources[0].bibref, '@ref1');
            assert.strictEqual(sources[1].bibref, '@ref2');
        });

        it('should handle multiline field values', () => {
            const content = `
SOURCE @test2020
    description: This is a long description
        that spans multiple lines
        and should be joined
END SOURCE
`;
            const sources = parser.parseSourceBlocks(content, 'test.syn');

            assert.strictEqual(sources.length, 1);
            const desc = sources[0].fields.description;
            assert.ok(desc.includes('long description'));
            assert.ok(desc.includes('multiple lines'));
        });
    });

    describe('parseItems', () => {
        it('should parse ITEM blocks', () => {
            const content = `
ITEM @test2020
    text: Sample text
    note: Sample note
    code: Code1, Code2
END ITEM
`;
            const items = parser.parseItems(content, 'test.syn');

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].bibref, '@test2020');
            assert.strictEqual(items[0].fields.text, 'Sample text');
            assert.strictEqual(items[0].fields.note, 'Sample note');
            assert.strictEqual(items[0].fields.code, 'Code1, Code2');
        });
    });

    describe('countItemsInSource', () => {
        it('should count ITEMs for a bibref', () => {
            const content = `
SOURCE @test2020
END SOURCE

ITEM @test2020
    text: First item
END ITEM

ITEM @test2020
    text: Second item
END ITEM

ITEM @other2020
    text: Other item
END ITEM
`;
            const count = parser.countItemsInSource(content, '@test2020');
            assert.strictEqual(count, 2);
        });
    });
});
