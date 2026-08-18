const assert = require('assert');
const { hashReferences } = require('../../src/explorers/reference/referenceHash');

/**
 * referenceExplorer — hash de cache das referências.
 *
 * O hash decide se `refresh()` reconstrói a árvore ou aborta. A versão anterior
 * resumia o estado em três números (quantidade de refs, nome da primeira, total
 * de ocorrências) e NÃO incluía a localização. Qualquer edição que deslocasse
 * blocos sem alterar contagens — inserir comentários, linhas em branco,
 * reescrever a prosa de um `note` — produzia o mesmo hash, o refresh abortava e
 * a árvore continuava servindo linhas obsoletas. Clicar levava ao bloco errado,
 * tipicamente ao meio do ITEM anterior.
 *
 * O caso 'detecta deslocamento de linha' é o teste que prova a correção.
 */

function ref(bibref, occurrences, itemCount = 0) {
    return { bibref, itemCount, occurrences };
}

describe('referenceHash', () => {
    describe('sensibilidade à localização', () => {
        it('detecta deslocamento de linha com as mesmas contagens', () => {
            // Cenário real: 5 linhas de comentário inseridas no topo de a.syn.
            // Mesmas refs, mesmo total de ocorrências — só as linhas mudaram.
            const antes = [
                ref('ref1', [{ file: 'a.syn', line: 0 }]),
                ref('ref2', [{ file: 'b.syn', line: 0 }])
            ];
            const depois = [
                ref('ref1', [{ file: 'a.syn', line: 5 }]),
                ref('ref2', [{ file: 'b.syn', line: 0 }])
            ];

            assert.notStrictEqual(hashReferences(antes), hashReferences(depois));
        });

        it('detecta mudança de arquivo com as mesmas contagens', () => {
            const antes = [ref('ref1', [{ file: 'a.syn', line: 3 }])];
            const depois = [ref('ref1', [{ file: 'b.syn', line: 3 }])];

            assert.notStrictEqual(hashReferences(antes), hashReferences(depois));
        });

        it('detecta mudança de itemCount', () => {
            const antes = [ref('ref1', [{ file: 'a.syn', line: 0 }], 2)];
            const depois = [ref('ref1', [{ file: 'a.syn', line: 0 }], 3)];

            assert.notStrictEqual(hashReferences(antes), hashReferences(depois));
        });
    });

    describe('estabilidade — o cache continua funcionando', () => {
        it('produz o mesmo hash para payloads idênticos', () => {
            const build = () => [
                ref('ref1', [{ file: 'a.syn', line: 0 }, { file: 'c.syn', line: 9 }], 2),
                ref('ref2', [{ file: 'b.syn', line: 4 }], 1)
            ];

            assert.strictEqual(hashReferences(build()), hashReferences(build()));
        });

        it('é estável entre chamadas repetidas sobre o mesmo objeto', () => {
            const refs = [ref('ref1', [{ file: 'a.syn', line: 7 }], 1)];

            assert.strictEqual(hashReferences(refs), hashReferences(refs));
        });
    });

    describe('robustez', () => {
        it('retorna "empty" para lista vazia', () => {
            assert.strictEqual(hashReferences([]), 'empty');
        });

        it('retorna "empty" para null/undefined', () => {
            assert.strictEqual(hashReferences(null), 'empty');
            assert.strictEqual(hashReferences(undefined), 'empty');
        });

        it('não lança quando occurrences está ausente', () => {
            const refs = [{ bibref: 'ref1', itemCount: 1 }];

            assert.doesNotThrow(() => hashReferences(refs));
            assert.notStrictEqual(hashReferences(refs), 'empty');
        });

        it('não lança quando occurrences é null', () => {
            const refs = [{ bibref: 'ref1', itemCount: 1, occurrences: null }];

            assert.doesNotThrow(() => hashReferences(refs));
        });

        it('distingue ausência de ocorrências de uma ocorrência na linha 0', () => {
            const semOcc = [{ bibref: 'ref1', itemCount: 1, occurrences: [] }];
            const comOcc = [ref('ref1', [{ file: 'a.syn', line: 0 }], 1)];

            assert.notStrictEqual(hashReferences(semOcc), hashReferences(comOcc));
        });
    });

    describe('formato', () => {
        it('devolve string', () => {
            const refs = [ref('ref1', [{ file: 'a.syn', line: 0 }], 1)];

            assert.strictEqual(typeof hashReferences(refs), 'string');
        });

        it('tem tamanho limitado, independente do volume de dados', () => {
            // O hash não pode crescer com o projeto — é comparado a cada refresh.
            const grande = [];
            for (let i = 0; i < 500; i += 1) {
                grande.push(ref(`ref${i}`, [{ file: `f${i}.syn`, line: i }], 1));
            }

            assert.ok(hashReferences(grande).length < 64);
        });
    });
});
