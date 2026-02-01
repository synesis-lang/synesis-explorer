/**
 * templateParser.test.js - Testes unitários para templateParser
 */

const assert = require('assert');
const path = require('path');
const { parse } = require('../../../src/parsers/templateParser');

describe('templateParser', () => {
    const fixturesDir = path.resolve(__dirname, '../../fixtures');

    describe('parse', () => {
        it('should parse the lsp-project template file', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            assert.ok(result);
            assert.ok(Array.isArray(result.fields));
            assert.ok(result.fields.length > 0);
        });

        it('should extract field names and types', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            const fieldNames = result.fields.map(f => f.name);
            assert.ok(fieldNames.includes('desc'));
            assert.ok(fieldNames.includes('text'));
            assert.ok(fieldNames.includes('note'));
            assert.ok(fieldNames.includes('code'));
            assert.ok(fieldNames.includes('topic'));
        });

        it('should extract correct types for each field', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            const byName = {};
            for (const field of result.fields) {
                byName[field.name] = field;
            }

            assert.strictEqual(byName.desc.type, 'TEXT');
            assert.strictEqual(byName.text.type, 'QUOTATION');
            assert.strictEqual(byName.note.type, 'MEMO');
            assert.strictEqual(byName.code.type, 'CODE');
            assert.strictEqual(byName.topic.type, 'ENUMERATED');
        });

        it('should extract scope for each field', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            const byName = {};
            for (const field of result.fields) {
                byName[field.name] = field;
            }

            assert.strictEqual(byName.desc.scope, 'SOURCE');
            assert.strictEqual(byName.text.scope, 'ITEM');
            assert.strictEqual(byName.note.scope, 'ITEM');
            assert.strictEqual(byName.code.scope, 'ITEM');
            assert.strictEqual(byName.topic.scope, 'ONTOLOGY');
        });

        it('should extract VALUES for ENUMERATED fields', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            const topicField = result.fields.find(f => f.name === 'topic');
            assert.ok(topicField.values);
            assert.ok(Array.isArray(topicField.values));
            assert.strictEqual(topicField.values.length, 2);

            assert.strictEqual(topicField.values[0].label, 'usability');
            assert.strictEqual(topicField.values[1].label, 'reliability');
        });

        it('should return null relations for non-CHAIN fields', async () => {
            const templatePath = path.join(fixturesDir, 'lsp-project', 'lsp-project.synt');
            const result = await parse(templatePath);

            const codeField = result.fields.find(f => f.name === 'code');
            assert.strictEqual(codeField.relations, null);
        });
    });
});
