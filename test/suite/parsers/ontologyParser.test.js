/**
 * ontologyParser.test.js - Testes unitários para OntologyParser
 */

const assert = require('assert');
const OntologyParser = require('../../../src/parsers/ontologyParser');

describe('OntologyParser', () => {
    let parser;

    beforeEach(() => {
        parser = new OntologyParser();
    });

    describe('parseOntologyBlocks', () => {
        it('should parse a single ONTOLOGY block', () => {
            const content = `
ONTOLOGY usability
    topic: usability
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].concept, 'usability');
            assert.strictEqual(blocks[0].fields.topic, 'usability');
            assert.strictEqual(blocks[0].file, 'test.syno');
        });

        it('should parse multiple ONTOLOGY blocks', () => {
            const content = `
ONTOLOGY usability
    topic: usability
END ONTOLOGY

ONTOLOGY reliability
    topic: reliability
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 2);
            assert.strictEqual(blocks[0].concept, 'usability');
            assert.strictEqual(blocks[1].concept, 'reliability');
        });

        it('should parse block with multiple fields', () => {
            const content = `
ONTOLOGY performance
    topic: performance
    priority: high
    description: System performance metric
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].fields.topic, 'performance');
            assert.strictEqual(blocks[0].fields.priority, 'high');
            assert.strictEqual(blocks[0].fields.description, 'System performance metric');
        });

        it('should handle repeated fields as arrays', () => {
            const content = `
ONTOLOGY multi
    tag: first
    tag: second
    tag: third
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.ok(Array.isArray(blocks[0].fields.tag));
            assert.deepStrictEqual(blocks[0].fields.tag, ['first', 'second', 'third']);
        });

        it('should track field entries with line and column', () => {
            const content = `
ONTOLOGY test
    topic: value1
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks[0].fieldEntries.length, 1);
            assert.strictEqual(blocks[0].fieldEntries[0].name, 'topic');
            assert.strictEqual(blocks[0].fieldEntries[0].value, 'value1');
            assert.strictEqual(typeof blocks[0].fieldEntries[0].line, 'number');
            assert.strictEqual(typeof blocks[0].fieldEntries[0].column, 'number');
        });

        it('should compute correct line numbers', () => {
            const content = `ONTOLOGY first
    topic: a
END ONTOLOGY
ONTOLOGY second
    topic: b
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks[0].line, 0);
            assert.strictEqual(blocks[1].line, 3);
        });

        it('should ignore comments inside blocks', () => {
            const content = `
ONTOLOGY test
    # This is a comment
    topic: value
    # Another comment
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].fields.topic, 'value');
            assert.strictEqual(blocks[0].fieldEntries.length, 1);
        });

        it('should handle empty blocks', () => {
            const content = `
ONTOLOGY empty
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].concept, 'empty');
            assert.deepStrictEqual(blocks[0].fields, {});
        });

        it('should return empty array for content without blocks', () => {
            const blocks = parser.parseOntologyBlocks('no blocks here', 'test.syno');
            assert.strictEqual(blocks.length, 0);
        });

        it('should handle unicode concept names', () => {
            const content = `
ONTOLOGY conceito_análise
    tópico: análise qualitativa
END ONTOLOGY
`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].concept, 'conceito_análise');
            assert.strictEqual(blocks[0].fields['tópico'], 'análise qualitativa');
        });

        it('should track startOffset and endOffset', () => {
            const content = `ONTOLOGY test
    topic: value
END ONTOLOGY`;
            const blocks = parser.parseOntologyBlocks(content, 'test.syno');

            assert.strictEqual(blocks[0].startOffset, 0);
            assert.strictEqual(blocks[0].endOffset, content.length);
        });
    });
});
