'use strict';

const assert = require('assert');
const { resolveBibref, isNeutralLine } = require('../../src/viewers/bibrefResolver');

/**
 * bibrefResolver — a qual referência pertence a linha do cursor.
 *
 * Depois da F2, blocos terminam no `END` real, então comentários entre blocos
 * ficam num gap sem dono. Antes desta fase, esse gap caía no `lastBefore`:
 *
 *   - comentário no topo do arquivo → null ("No reference found"), porque não
 *     havia bloco anterior;
 *   - comentário rotulando a 2ª fonte → devolvia a 1ª (o abstract errado).
 *
 * A regra: gap formado só de comentários/linhas em branco pertence ao bloco
 * SEGUINTE — é como o pesquisador lê um comentário escrito acima de um bloco.
 */

function block(bibref, startLine, endLine) {
    return {
        kind: 'SOURCE',
        bibref,
        range: {
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: 0 }
        }
    };
}

// Documento de referência (ranges já no formato pós-F2).
const DOC = [
    '# cabecalho do arquivo',   // 0
    '# revisao pendente',       // 1
    'SOURCE @a2019',            // 2
    '    title: Primeiro',      // 3
    'END SOURCE',               // 4
    'ITEM @a2019',              // 5
    '    quote: um',            // 6
    'END ITEM',                 // 7
    '',                         // 8
    '# Estudo de Silva 2020',   // 9
    'SOURCE @b2020',            // 10
    '    title: Segundo',       // 11
    'END SOURCE'                // 12
];

const BLOCKS = [
    block('a2019', 2, 4),
    block('a2019', 5, 7),
    block('b2020', 10, 12)
];

describe('bibrefResolver', () => {
    describe('gap de comentários → bloco seguinte', () => {
        it('resolve comentário no topo do arquivo para o primeiro bloco', () => {
            // Antes: null — não havia bloco anterior para o lastBefore.
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 0), 'a2019');
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 1), 'a2019');
        });

        it('resolve o comentário que rotula a 2ª fonte para a 2ª fonte', () => {
            // Antes: 'a2019' — o abstract do artigo errado.
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 9), 'b2020');
        });

        it('resolve linha em branco entre blocos para o bloco seguinte', () => {
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 8), 'b2020');
        });
    });

    describe('cobertura exata — inalterada', () => {
        it('resolve o cursor dentro de um bloco', () => {
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 3), 'a2019');
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 11), 'b2020');
        });

        it('resolve o cursor na primeira e na última linha do bloco', () => {
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 10), 'b2020');
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 12), 'b2020');
        });

        it('prefere cobertura exata mesmo havendo bloco seguinte', () => {
            assert.strictEqual(resolveBibref(BLOCKS, DOC, 7), 'a2019');
        });
    });

    describe('sobre-correção — o gap não pode sequestrar', () => {
        it('cai no lastBefore quando há código entre o cursor e o próximo bloco', () => {
            const lines = [
                'SOURCE @a',      // 0
                'END SOURCE',     // 1
                '',               // 2  <- cursor aqui
                'texto solto',    // 3  <- conteúdo real: quebra o gap
                'SOURCE @b',      // 4
                'END SOURCE'      // 5
            ];
            const blocks = [block('a', 0, 1), block('b', 4, 5)];

            assert.strictEqual(resolveBibref(blocks, lines, 2), 'a');
        });

        it('cai no lastBefore quando o gap tem campo de bloco malformado', () => {
            const lines = [
                'SOURCE @a',        // 0
                'END SOURCE',       // 1
                '    code: X',      // 2  <- conteúdo real
                'SOURCE @b',        // 3
                'END SOURCE'        // 4
            ];
            const blocks = [block('a', 0, 1), block('b', 3, 4)];

            assert.strictEqual(resolveBibref(blocks, lines, 2), 'a');
        });
    });

    describe('lastBefore — último recurso', () => {
        it('resolve cursor após o último bloco', () => {
            const lines = DOC.concat(['', '# nota final']);
            assert.strictEqual(resolveBibref(BLOCKS, lines, 14), 'b2020');
        });
    });

    describe('robustez', () => {
        it('devolve null quando não há blocos', () => {
            assert.strictEqual(resolveBibref([], DOC, 0), null);
        });

        it('devolve null para blocks null/undefined', () => {
            assert.strictEqual(resolveBibref(null, DOC, 0), null);
            assert.strictEqual(resolveBibref(undefined, DOC, 0), null);
        });

        it('não lança quando lines está vazio ou ausente', () => {
            assert.doesNotThrow(() => resolveBibref(BLOCKS, [], 9));
            assert.doesNotThrow(() => resolveBibref(BLOCKS, null, 9));
        });

        it('ignora blocos com range malformado', () => {
            const blocks = [{ bibref: 'quebrado' }, block('ok', 0, 2)];

            assert.strictEqual(resolveBibref(blocks, ['SOURCE @ok'], 0), 'ok');
        });

        it('ordena blocos fora de ordem antes de resolver', () => {
            const foraDeOrdem = [block('b2020', 10, 12), block('a2019', 2, 4)];

            assert.strictEqual(resolveBibref(foraDeOrdem, DOC, 9), 'b2020');
            assert.strictEqual(resolveBibref(foraDeOrdem, DOC, 3), 'a2019');
        });
    });

    describe('isNeutralLine', () => {
        it('reconhece comentários e linhas em branco', () => {
            assert.strictEqual(isNeutralLine('# comentario'), true);
            assert.strictEqual(isNeutralLine('   # indentado'), true);
            assert.strictEqual(isNeutralLine(''), true);
            assert.strictEqual(isNeutralLine('   '), true);
        });

        it('não considera neutro conteúdo real', () => {
            assert.strictEqual(isNeutralLine('SOURCE @a'), false);
            assert.strictEqual(isNeutralLine('    code: X'), false);
        });

        it('não lança para null/undefined', () => {
            assert.strictEqual(isNeutralLine(null), true);
            assert.strictEqual(isNeutralLine(undefined), true);
        });
    });
});
