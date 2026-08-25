/**
 * pathContainment.test.js — contenção de caminhos (Etapa 5).
 *
 * O caminho que a âncora abre vem do GRAFO, e o grafo é dado não confiável: pode
 * ter sido gerado noutra máquina, compartilhado entre pesquisadores, ou servido
 * por um ArcadeDB remoto. Sem contenção, um `source_file` com `../../../` abre
 * um arquivo qualquer do disco.
 */

const assert = require('assert');
const path = require('path');
const { isWithin, resolveWithinRoots, orderedRoots } = require('../../src/core/pathContainment');

const ROOT = path.join('D:', 'GitHub', 'face85');
const OUTRO = path.join('D:', 'GitHub', 'outro-projeto');

describe('Contenção — isWithin', () => {
    it('aceita filho direto e aninhado', () => {
        assert.ok(isWithin(path.join(ROOT, 'face85.syn'), ROOT));
        assert.ok(isWithin(path.join(ROOT, 'dados', 'anotacoes.syn'), ROOT));
    });

    it('aceita a própria raiz', () => {
        // Não é âncora útil, mas também não é escape; recusar aqui misturaria
        // duas decisões.
        assert.ok(isWithin(ROOT, ROOT));
    });

    it('recusa irmão com prefixo textual igual', () => {
        // `D:/GitHub/face85-evil` começa com `D:/GitHub/face85` como STRING mas
        // não está dentro dele. É por isso que a comparação é por componente de
        // caminho, não por prefixo.
        assert.ok(!isWithin(path.join('D:', 'GitHub', 'face85-evil', 'x.syn'), ROOT));
    });

    it('recusa escape por `..`', () => {
        assert.ok(!isWithin(path.join(ROOT, '..', '..', 'Windows', 'system32'), ROOT));
    });

    it('tolera entrada ausente', () => {
        assert.ok(!isWithin(undefined, ROOT));
        assert.ok(!isWithin(ROOT, undefined));
    });
});

describe('Contenção — resolveWithinRoots', () => {
    it('resolve relativo contra a raiz', () => {
        assert.strictEqual(
            resolveWithinRoots('face85.syn', [ROOT]),
            path.join(ROOT, 'face85.syn')
        );
    });

    it('RECUSA relativo que escapa por `..`', () => {
        // O caso que a contenção existe para barrar: o grafo pede um arquivo
        // fora da raiz, e o `..` só aparece depois de resolver.
        assert.strictEqual(
            resolveWithinRoots(path.join('..', '..', 'Windows', 'win.ini'), [ROOT]),
            undefined
        );
    });

    it('aceita absoluto DENTRO de uma raiz', () => {
        const absolute = path.join(ROOT, 'face85.syn');
        assert.strictEqual(resolveWithinRoots(absolute, [ROOT]), absolute);
    });

    it('RECUSA absoluto fora de toda raiz', () => {
        // Grafo exportado na máquina de outro pesquisador: o caminho existe lá,
        // não aqui. Abri-lo às cegas é o que se evita.
        assert.strictEqual(
            resolveWithinRoots(path.join('C:', 'Users', 'outro', 'segredo.syn'), [ROOT]),
            undefined
        );
    });

    it('tenta TODAS as raízes abertas — multi-root', () => {
        // O defeito corrigido: só a primeira pasta era tentada, e num multi-root
        // a âncora não abria, com erro mudo.
        assert.strictEqual(
            resolveWithinRoots('anotacoes.syn', [ROOT, OUTRO], OUTRO),
            path.join(OUTRO, 'anotacoes.syn')
        );
    });

    it('tenta a raiz preferida primeiro', () => {
        // Com o mesmo nome relativo em duas raízes, ganha a do editor ativo.
        assert.strictEqual(
            resolveWithinRoots('face85.syn', [ROOT, OUTRO], OUTRO),
            path.join(OUTRO, 'face85.syn')
        );
    });

    it('devolve undefined sem raiz alguma', () => {
        assert.strictEqual(resolveWithinRoots('face85.syn', []), undefined);
        assert.strictEqual(resolveWithinRoots('face85.syn', [undefined]), undefined);
    });

    it('tolera entrada não-string', () => {
        assert.strictEqual(resolveWithinRoots(undefined, [ROOT]), undefined);
        assert.strictEqual(resolveWithinRoots(42, [ROOT]), undefined);
    });
});

describe('Contenção — orderedRoots', () => {
    it('põe a preferida à frente sem duplicar', () => {
        assert.deepStrictEqual(orderedRoots([ROOT, OUTRO], OUTRO), [OUTRO, ROOT]);
    });

    it('preserva a ordem quando não há preferida', () => {
        assert.deepStrictEqual(orderedRoots([ROOT, OUTRO]), [ROOT, OUTRO]);
    });
});
