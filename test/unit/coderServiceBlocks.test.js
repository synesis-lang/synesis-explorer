'use strict';

require('../helpers/vscodeMock').install();

const assert = require('assert');
const CoderService = require('../../src/services/coderService');

/**
 * coderService × ranges do getBlocks (não-regressão da F2).
 *
 * `getBlocks` tem dois consumidores, não um: o abstractViewer (leitura) e o
 * coderService. Neste último, `_findInsertionPoint` converte `range.end` em
 * posição de ESCRITA — é onde o ITEM gerado pelo synesis-coder é inserido no
 * arquivo do usuário.
 *
 * A F2 mudou `range.end`: antes apontava para a linha anterior ao próximo bloco
 * (engolindo comentários e linhas em branco), agora aponta para o `END` real.
 * Estes testes fixam o comportamento resultante.
 *
 * Os payloads abaixo são os que `synesis_lsp/blocks.py` produz DEPOIS da F2 —
 * conferidos contra a implementação, não inventados.
 */

// ---------------------------------------------------------------- fixtures

const DOC = [
    'SOURCE @a2019',            // 0
    '    title: Primeiro',      // 1
    'END SOURCE',               // 2
    'ITEM @a2019',              // 3
    '    quote: um',            // 4
    'END ITEM',                 // 5
    '',                         // 6
    '# Estudo de Silva 2020',   // 7
    'SOURCE @b2020',            // 8
    '    title: Segundo',       // 9
    'END SOURCE'                // 10
].join('\n');

// Ranges como blocks.py os devolve após a F2 (fim = o END real).
const BLOCKS_DEPOIS_F2 = [
    block('SOURCE', 'a2019', 0, 0, 2, 'END SOURCE'.length),
    block('ITEM', 'a2019', 3, 0, 5, 'END ITEM'.length),
    block('SOURCE', 'b2020', 8, 0, 10, 'END SOURCE'.length)
];

function block(kind, bibref, startLine, startChar, endLine, endChar) {
    return {
        kind,
        bibref,
        range: {
            start: { line: startLine, character: startChar },
            end: { line: endLine, character: endChar }
        }
    };
}

/** Documento de teste com a aritmética de offset real do VS Code. */
function fakeDocument(text) {
    const lines = text.split('\n');
    const lineStart = [];
    let acc = 0;
    for (const line of lines) {
        lineStart.push(acc);
        acc += line.length + 1; // +1 pelo \n
    }

    return {
        uri: { fsPath: '/ws/a.syn' },
        getText: () => text,
        offsetAt: (pos) => lineStart[pos.line] + pos.character,
        positionAt: (offset) => {
            let line = 0;
            while (line + 1 < lineStart.length && lineStart[line + 1] <= offset) {
                line += 1;
            }
            return { line, character: offset - lineStart[line] };
        }
    };
}

function editorAt(text, line, character = 0) {
    const document = fakeDocument(text);
    const pos = { line, character };
    return { document, selection: { start: pos, active: pos } };
}

function makeService(blocks) {
    return new CoderService({
        getBlocks: async () => blocks
    });
}

// ------------------------------------------------------------------- testes

describe('coderService × ranges do getBlocks (F2)', () => {
    describe('_detectBibref — não-regressão', () => {
        it('resolve o bibref com o cursor dentro de um bloco', async () => {
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const bibref = await svc._detectBibref(editorAt(DOC, 4)); // '    quote: um'

            assert.strictEqual(bibref, 'a2019');
        });

        it('resolve o bibref na primeira linha do bloco', async () => {
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const bibref = await svc._detectBibref(editorAt(DOC, 8)); // 'SOURCE @b2020'

            assert.strictEqual(bibref, 'b2020');
        });

        it('resolve o bibref na linha do END', async () => {
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const bibref = await svc._detectBibref(editorAt(DOC, 5)); // 'END ITEM'

            assert.strictEqual(bibref, 'a2019');
        });
    });

    describe('_findInsertionPoint — onde o ITEM gerado é escrito', () => {
        it('insere logo após END ITEM, não após o comentário da fonte seguinte', async () => {
            // O comportamento que a F2 corrige: antes, o range do ITEM @a2019
            // ia até a linha 7 ('# Estudo de Silva 2020') e o texto novo caía
            // no território visual do @b2020.
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const editor = editorAt(DOC, 4);
            const pos = await svc._findInsertionPoint(editor, BLOCKS_DEPOIS_F2);

            assert.strictEqual(pos.line, 5, 'deve inserir na linha do END ITEM');
            assert.strictEqual(pos.character, 'END ITEM'.length);
        });

        it('insere no fim do bloco quando o cursor está no último bloco', async () => {
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const editor = editorAt(DOC, 9);
            const pos = await svc._findInsertionPoint(editor, BLOCKS_DEPOIS_F2);

            assert.strictEqual(pos.line, 10);
            assert.strictEqual(pos.character, 'END SOURCE'.length);
        });

        it('insere no fim do SOURCE quando o cursor está nele', async () => {
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const editor = editorAt(DOC, 1);
            const pos = await svc._findInsertionPoint(editor, BLOCKS_DEPOIS_F2);

            assert.strictEqual(pos.line, 2);
        });

        it('não escreve dentro do bloco seguinte', async () => {
            // Invariante que protege o arquivo do usuário: o ponto de inserção
            // nunca pode cair depois do início do próximo bloco.
            const svc = makeService(BLOCKS_DEPOIS_F2);
            const editor = editorAt(DOC, 4);
            const pos = await svc._findInsertionPoint(editor, BLOCKS_DEPOIS_F2);

            const proximoInicio = BLOCKS_DEPOIS_F2[2].range.start.line;
            assert.ok(
                pos.line < proximoInicio,
                `inserção na linha ${pos.line} invade o bloco que começa em ${proximoInicio}`
            );
        });
    });

    describe('robustez', () => {
        it('não lança quando o LSP devolve lista vazia', async () => {
            const svc = makeService([]);
            const editor = editorAt(DOC, 4);

            await assert.doesNotReject(() => svc._findInsertionPoint(editor, []));
        });

        it('não lança quando o LSP devolve null', async () => {
            const svc = makeService(null);
            const editor = editorAt(DOC, 4);

            await assert.doesNotReject(() => svc._detectBibref(editor));
        });
    });
});
