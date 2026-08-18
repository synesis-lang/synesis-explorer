'use strict';

require('../helpers/vscodeMock').install();

const assert = require('assert');
const AbstractViewer = require('../../src/viewers/abstractViewer');

/**
 * highlightExcerpts — sobreposição e contador (F6).
 *
 * Dois defeitos, uma causa comum: o render descartava silenciosamente qualquer
 * destaque que se sobrepusesse a um anterior (`if (match.start < cursor) continue`).
 *
 *   - O card sumia do abstract mas continuava na legenda, com sua cor — a cor
 *     prometia uma marcação inexistente.
 *   - O rodapé contava cards COM excerpt, não destaques desenhados, afirmando
 *     "3 excerpts in abstract" quando havia 2.
 *
 * Excerpts sobrepostos são normais em codificação qualitativa: dois ITEMs podem
 * codificar trechos que compartilham palavras.
 */

function viewer() {
    return new AbstractViewer({}, {}, null);
}

function card(value) {
    return { excerpt: value ? { value } : null, chains: [], codes: [], fields: [], line: 0, file: '' };
}

function marks(html) {
    return [...html.matchAll(/<mark[^>]*>(.*?)<\/mark>/gs)].map(m => m[1]);
}

const ABSTRACT = 'Social acceptance of wind energy depends on local participation and trust.';

describe('highlightExcerpts', () => {
    describe('sobreposição', () => {
        it('sinaliza o card sobreposto em vez de descartá-lo em silêncio', () => {
            const cards = [
                card('Social acceptance of wind energy'),
                card('wind energy depends on local participation'), // cruza o 1º
                card('trust')
            ];

            const { highlighted, skipped } = viewer().highlightExcerpts(ABSTRACT, cards);

            assert.ok(!highlighted.has(1), 'o card 1 não foi destacado');
            assert.deepStrictEqual(
                skipped.find(s => s.index === 1),
                { index: 1, reason: 'overlapped' }
            );
        });

        it('destaca os demais normalmente', () => {
            const cards = [
                card('Social acceptance of wind energy'),
                card('wind energy depends on local participation'),
                card('trust')
            ];

            const { html, highlighted } = viewer().highlightExcerpts(ABSTRACT, cards);

            assert.deepStrictEqual(marks(html), ['Social acceptance of wind energy', 'trust']);
            assert.deepStrictEqual([...highlighted].sort(), [0, 2]);
        });

        it('em empate de início, vence o trecho mais longo', () => {
            const cards = [card('Social acceptance'), card('Social acceptance of wind energy')];

            const { html, highlighted } = viewer().highlightExcerpts(ABSTRACT, cards);

            assert.deepStrictEqual(marks(html), ['Social acceptance of wind energy']);
            assert.ok(highlighted.has(1));
        });

        it('distingue trecho não localizado de trecho sobreposto', () => {
            const cards = [
                card('Social acceptance of wind energy'),
                card('wind energy depends on local participation'), // sobreposto
                card('texto que não existe no abstract')            // não localizado
            ];

            const { skipped } = viewer().highlightExcerpts(ABSTRACT, cards);
            const byIndex = new Map(skipped.map(s => [s.index, s.reason]));

            assert.strictEqual(byIndex.get(1), 'overlapped');
            assert.strictEqual(byIndex.get(2), 'notFound');
        });
    });

    describe('contador honesto', () => {
        it('conta destaques desenhados, não cards com excerpt', () => {
            const cards = [
                card('Social acceptance of wind energy'),
                card('wind energy depends on local participation'),
                card('trust')
            ];

            const { html, highlighted } = viewer().highlightExcerpts(ABSTRACT, cards);

            assert.strictEqual(highlighted.size, 2, 'o rodapé deve dizer 2, não 3');
            assert.strictEqual(marks(html).length, highlighted.size);
        });

        it('conta zero quando nada é localizado', () => {
            const { highlighted } = viewer().highlightExcerpts(ABSTRACT, [card('inexistente')]);

            assert.strictEqual(highlighted.size, 0);
        });
    });

    describe('não-regressão — caminho comum', () => {
        it('destaca todos quando não há sobreposição', () => {
            const cards = [card('Social acceptance'), card('local participation'), card('trust')];

            const { html, highlighted } = viewer().highlightExcerpts(ABSTRACT, cards);

            assert.strictEqual(highlighted.size, 3);
            assert.deepStrictEqual(marks(html), ['Social acceptance', 'local participation', 'trust']);
        });

        it('preserva o texto do abstract fora dos destaques', () => {
            const { html } = viewer().highlightExcerpts(ABSTRACT, [card('trust')]);
            const semTags = html.replace(/<[^>]+>/g, '');

            assert.strictEqual(semTags, ABSTRACT);
        });

        it('devolve o abstract escapado quando não há match', () => {
            const { html } = viewer().highlightExcerpts(ABSTRACT, [card('inexistente')]);

            assert.strictEqual(html, ABSTRACT);
            assert.strictEqual(marks(html).length, 0);
        });

        it('escapa HTML presente no abstract', () => {
            const abstract = 'Um <script>alert(1)</script> no texto.';
            const { html } = viewer().highlightExcerpts(abstract, [card('no texto')]);

            assert.ok(!html.includes('<script>'));
            assert.ok(html.includes('&lt;script&gt;'));
        });
    });

    describe('robustez', () => {
        it('devolve estrutura vazia para abstract ausente', () => {
            const r = viewer().highlightExcerpts('', [card('x')]);

            assert.strictEqual(r.html, '');
            assert.strictEqual(r.highlighted.size, 0);
        });

        it('não lança para lista de cards vazia ou nula', () => {
            assert.doesNotThrow(() => viewer().highlightExcerpts(ABSTRACT, []));
            assert.doesNotThrow(() => viewer().highlightExcerpts(ABSTRACT, null));
        });

        it('ignora cards sem excerpt sem registrá-los como pulados', () => {
            const { skipped, highlighted } = viewer().highlightExcerpts(
                ABSTRACT, [card(null), card('trust')]
            );

            assert.strictEqual(skipped.length, 0);
            assert.deepStrictEqual([...highlighted], [1]);
        });
    });
});
