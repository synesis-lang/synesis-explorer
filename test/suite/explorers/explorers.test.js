/**
 * explorers.test.js - Testes para lógica dos explorers
 *
 * Testa a correção do path.basename nos OccurrenceTreeItem
 * e a lógica geral dos explorers via mock do vscode.
 */

require('../helpers/mockVscode').install();

const assert = require('assert');
const path = require('path');
const ReferenceExplorer = require('../../../src/explorers/reference/referenceExplorer');
const CodeExplorer = require('../../../src/explorers/code/codeExplorer');

function createMockDataService(refs = [], codes = []) {
    return {
        getReferences: async () => refs,
        getCodes: async () => codes,
        getRelations: async () => [],
        getRelationGraph: async () => null
    };
}

describe('ReferenceExplorer', () => {
    describe('refresh and getChildren', () => {
        it('should populate references from DataService', async () => {
            const refs = [
                {
                    bibref: '@paper01',
                    itemCount: 2,
                    occurrences: [
                        { file: '/path/to/file.syn', line: 5, itemCount: 2 }
                    ]
                }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            const children = await explorer.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].bibref, '@paper01');
        });

        it('should return occurrences as children', async () => {
            const refs = [
                {
                    bibref: '@paper01',
                    itemCount: 3,
                    occurrences: [
                        { file: '/path/to/file1.syn', line: 5, itemCount: 2 },
                        { file: '/path/to/file2.syn', line: 10, itemCount: 1 }
                    ]
                }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            const roots = await explorer.getChildren();
            const children = await explorer.getChildren(roots[0]);

            assert.strictEqual(children.length, 2);
        });

        it('should use path.basename for occurrence labels (Fix 1)', async () => {
            const refs = [
                {
                    bibref: '@test',
                    itemCount: 1,
                    occurrences: [
                        { file: 'd:\\GitHub\\project\\data\\test.syn', line: 5, itemCount: 1 }
                    ]
                }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            const roots = await explorer.getChildren();
            const children = await explorer.getChildren(roots[0]);

            // O label deve conter apenas o nome do arquivo, não o path completo
            assert.ok(children[0].label.startsWith('test.syn'));
            assert.ok(!children[0].label.includes('GitHub'));
            assert.ok(!children[0].label.includes('\\'));
        });

        it('should use path.basename for Unix paths too', async () => {
            const refs = [
                {
                    bibref: '@test',
                    itemCount: 1,
                    occurrences: [
                        { file: '/home/user/project/data/test.syn', line: 3, itemCount: 1 }
                    ]
                }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            const roots = await explorer.getChildren();
            const children = await explorer.getChildren(roots[0]);

            assert.ok(children[0].label.startsWith('test.syn'));
            assert.ok(!children[0].label.includes('/home'));
        });

        it('should filter references by text', async () => {
            const refs = [
                { bibref: '@apple', itemCount: 1, occurrences: [] },
                { bibref: '@banana', itemCount: 1, occurrences: [] },
                { bibref: '@cherry', itemCount: 1, occurrences: [] }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            explorer.setFilter('an');
            const children = await explorer.getChildren();

            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].bibref, '@banana');
        });

        it('should sort references alphabetically', async () => {
            const refs = [
                { bibref: '@cherry', itemCount: 1, occurrences: [] },
                { bibref: '@apple', itemCount: 1, occurrences: [] },
                { bibref: '@banana', itemCount: 1, occurrences: [] }
            ];

            const explorer = new ReferenceExplorer(createMockDataService(refs));
            await explorer.refresh();

            const children = await explorer.getChildren();
            assert.strictEqual(children[0].bibref, '@apple');
            assert.strictEqual(children[1].bibref, '@banana');
            assert.strictEqual(children[2].bibref, '@cherry');
        });
    });
});

describe('CodeExplorer', () => {
    describe('refresh and getChildren', () => {
        it('should populate codes from DataService', async () => {
            const codes = [
                { code: 'usability', usageCount: 2, ontologyDefined: false, occurrences: [] }
            ];

            const explorer = new CodeExplorer(createMockDataService([], codes));
            await explorer.refresh();

            const children = await explorer.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].code, 'usability');
        });

        it('should use path.basename for occurrence labels (Fix 1)', async () => {
            const codes = [
                {
                    code: 'usability',
                    usageCount: 1,
                    ontologyDefined: false,
                    occurrences: [
                        { file: 'd:\\GitHub\\project\\data\\test.syn', line: 10, column: 5, context: 'code', field: 'code' }
                    ]
                }
            ];

            const explorer = new CodeExplorer(createMockDataService([], codes));
            await explorer.refresh();

            const roots = await explorer.getChildren();
            const children = await explorer.getChildren(roots[0]);

            assert.ok(children[0].label.startsWith('test.syn'));
            assert.ok(!children[0].label.includes('GitHub'));
        });

        it('should filter codes by text', async () => {
            const codes = [
                { code: 'usability', usageCount: 1, ontologyDefined: false, occurrences: [] },
                { code: 'reliability', usageCount: 1, ontologyDefined: false, occurrences: [] }
            ];

            const explorer = new CodeExplorer(createMockDataService([], codes));
            await explorer.refresh();

            explorer.setFilter('usa');
            const children = await explorer.getChildren();

            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].code, 'usability');
        });

        it('should sort codes alphabetically', async () => {
            const codes = [
                { code: 'zebra', usageCount: 1, ontologyDefined: false, occurrences: [] },
                { code: 'alpha', usageCount: 1, ontologyDefined: false, occurrences: [] }
            ];

            const explorer = new CodeExplorer(createMockDataService([], codes));
            await explorer.refresh();

            const children = await explorer.getChildren();
            assert.strictEqual(children[0].code, 'alpha');
            assert.strictEqual(children[1].code, 'zebra');
        });

        it('should show different icons for ontology-defined codes', async () => {
            const codes = [
                { code: 'defined', usageCount: 1, ontologyDefined: true, occurrences: [] },
                { code: 'regular', usageCount: 1, ontologyDefined: false, occurrences: [] }
            ];

            const explorer = new CodeExplorer(createMockDataService([], codes));
            await explorer.refresh();

            const children = await explorer.getChildren();
            const definedItem = children.find(c => c.code === 'defined');
            const regularItem = children.find(c => c.code === 'regular');

            assert.strictEqual(definedItem.iconPath.id, 'symbol-key');
            assert.strictEqual(regularItem.iconPath.id, 'symbol-variable');
        });
    });
});

describe('path.basename correctness', () => {
    it('should extract filename from Windows path', () => {
        const windowsPath = 'd:\\GitHub\\project\\data\\file.syn';
        assert.strictEqual(path.basename(windowsPath), 'file.syn');
    });

    it('should extract filename from Unix path', () => {
        const unixPath = '/home/user/project/data/file.syn';
        assert.strictEqual(path.basename(unixPath), 'file.syn');
    });

    it('should handle path with only filename', () => {
        assert.strictEqual(path.basename('file.syn'), 'file.syn');
    });

    it('should demonstrate old bug with lastIndexOf on Windows paths', () => {
        const windowsPath = 'd:\\GitHub\\project\\data\\file.syn';
        // The old code: file.substring(file.lastIndexOf('/') + 1)
        // On Windows, '/' is not found, so lastIndexOf returns -1, and substring(0) returns the full path
        const oldResult = windowsPath.substring(windowsPath.lastIndexOf('/') + 1);
        assert.strictEqual(oldResult, windowsPath); // Bug: returns full path

        // The fix: path.basename always works
        const fixedResult = path.basename(windowsPath);
        assert.strictEqual(fixedResult, 'file.syn'); // Correct: returns just filename
    });
});
