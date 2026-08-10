const assert = require('assert');
const { buildItemCards, buildDisplayPlan, orderedFieldNames } = require('../../src/viewers/itemCardBuilder');

// Template no formato do registry (templateManager.buildFieldRegistry)
const REGISTRY = {
    text: { type: 'QUOTATION', scope: 'ITEM' },
    note: { type: 'MEMO', scope: 'ITEM' },
    zone: { type: 'ENUMERATED', scope: 'ITEM', description: 'Zona retórica do trecho' },
    confidence: { type: 'SCALE', scope: 'ITEM' },
    chain: { type: 'CHAIN', scope: 'ITEM', relations: ['CAUSES', 'ENABLES'] },
    code: { type: 'CODE', scope: 'ITEM' }
};

function item(fields, extra = {}) {
    return { fields, codes: [], chains: [], line: 1, file: 'a.syn', ...extra };
}

describe('itemCardBuilder', () => {
    describe('buildItemCards — um ITEM = um card', () => {
        it('não fragmenta um ITEM com múltiplas chains', () => {
            const { cards } = buildItemCards([
                item({
                    text: 'trecho',
                    chain: ['A -> CAUSES -> B', 'C -> ENABLES -> D', 'E -> CAUSES -> F']
                })
            ], REGISTRY);

            assert.strictEqual(cards.length, 1, 'um ITEM deve gerar exatamente um card');
            assert.strictEqual(cards[0].chains.length, 3);
        });

        it('não fragmenta um ITEM com múltiplas notes', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', note: ['nota 1', 'nota 2'] })
            ], REGISTRY);

            assert.strictEqual(cards.length, 1);
            const noteField = cards[0].fields.find(f => f.name === 'note');
            assert.deepStrictEqual(noteField.values, ['nota 1', 'nota 2']);
        });

        it('conta ITEMs, não pares — o contador é conferível contra o .syn', () => {
            const { cards, display } = buildItemCards([
                item({ text: 't1', chain: ['A -> CAUSES -> B', 'C -> CAUSES -> D'] }),
                item({ text: 't2', chain: ['E -> ENABLES -> F'] })
            ], REGISTRY);

            assert.strictEqual(cards.length, 2, '2 blocos ITEM = 2 cards');
            assert.strictEqual(display.chainCount, 3, 'chains somadas separadamente');
        });

        it('descarta ITEM sem conteúdo algum', () => {
            const { cards } = buildItemCards([item({})], REGISTRY);
            assert.strictEqual(cards.length, 0);
        });
    });

    describe('buildItemCards — todos os campos', () => {
        it('inclui ENUMERATED e SCALE, que antes eram descartados', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', zone: 'Result', confidence: '4' })
            ], REGISTRY);

            const names = cards[0].fields.map(f => f.name);
            assert.ok(names.includes('zone'), 'ENUMERATED deve aparecer');
            assert.ok(names.includes('confidence'), 'SCALE deve aparecer');
        });

        it('usa a description do template como rótulo legível', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', zone: 'Result' })
            ], REGISTRY);

            const zone = cards[0].fields.find(f => f.name === 'zone');
            assert.strictEqual(zone.label, 'Zona retórica do trecho');
        });

        it('cai no nome do campo quando não há description', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', confidence: '4' })
            ], REGISTRY);

            const conf = cards[0].fields.find(f => f.name === 'confidence');
            assert.strictEqual(conf.label, 'confidence');
        });

        it('não repete o campo de excerpt na lista de campos', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', zone: 'Result' })
            ], REGISTRY);

            assert.strictEqual(cards[0].excerpt.value, 'trecho');
            assert.ok(!cards[0].fields.some(f => f.name === 'text'));
        });

        it('preserva a ordem de declaração do template', () => {
            const { cards } = buildItemCards([
                item({ text: 't', confidence: '4', zone: 'Result' })
            ], REGISTRY);

            const names = cards[0].fields.map(f => f.name);
            assert.deepStrictEqual(names, ['note', 'zone', 'confidence'].filter(n => names.includes(n)));
            assert.ok(names.indexOf('zone') < names.indexOf('confidence'),
                'zone é declarado antes de confidence no template');
        });

        it('mantém campos ausentes do template no fim, em vez de descartá-los', () => {
            const { cards } = buildItemCards([
                item({ text: 't', campo_novo: 'valor' })
            ], REGISTRY);

            const names = cards[0].fields.map(f => f.name);
            assert.strictEqual(names[names.length - 1], 'campo_novo');
        });
    });

    describe('campos MEMO — regressão do defeito de campos promovidos', () => {
        // O transformer do compilador promove note/notes/memo/memos para
        // item.notes, fora de extra_fields. O LSP agora os reinsere
        // (_reinsert_promoted_fields); daqui para frente é um campo comum.
        it('renderiza MEMO como campo do card', () => {
            const { cards } = buildItemCards([
                item({ text: 'trecho', memo: 'a memo do item' })
            ], { text: { type: 'QUOTATION' }, memo: { type: 'MEMO' } });

            const memo = cards[0].fields.find(f => f.name === 'memo');
            assert.ok(memo, 'MEMO deve aparecer no card');
            assert.deepStrictEqual(memo.values, ['a memo do item']);
        });

        it('aceita o nome que o template usar (memo, note, ...)', () => {
            for (const name of ['memo', 'note', 'observacao']) {
                const registry = { text: { type: 'QUOTATION' }, [name]: { type: 'MEMO' } };
                const { cards } = buildItemCards([
                    item({ text: 't', [name]: 'conteudo' })
                ], registry);
                assert.ok(cards[0].fields.some(f => f.name === name), `${name} deve aparecer`);
            }
        });

        it('agrupa múltiplas memos num único campo do mesmo card', () => {
            const { cards } = buildItemCards([
                item({ text: 't', memo: ['primeira', 'segunda'] })
            ], { text: { type: 'QUOTATION' }, memo: { type: 'MEMO' } });

            assert.strictEqual(cards.length, 1);
            const memo = cards[0].fields.find(f => f.name === 'memo');
            assert.deepStrictEqual(memo.values, ['primeira', 'segunda']);
            assert.strictEqual(memo.isMultiple, true);
        });
    });

    describe('buildItemCards — codes e chains', () => {
        it('mostra codes MESMO havendo chain no template', () => {
            const { cards } = buildItemCards([
                item({ text: 't', chain: ['A -> CAUSES -> B'], code: 'Trust, Risk' })
            ], REGISTRY);

            assert.deepStrictEqual(cards[0].codes, ['Trust', 'Risk']);
            assert.strictEqual(cards[0].chains.length, 1);
        });

        it('usa item.chains do LSP quando o campo do template está vazio', () => {
            const { cards } = buildItemCards([
                item({ text: 't' }, { chains: ['A -> CAUSES -> B'] })
            ], REGISTRY);

            assert.deepStrictEqual(cards[0].chains, ['A -> CAUSES -> B']);
        });

        it('usa item.codes do LSP quando o campo do template está vazio', () => {
            const { cards } = buildItemCards([
                item({ text: 't' }, { codes: ['Trust'] })
            ], REGISTRY);

            assert.deepStrictEqual(cards[0].codes, ['Trust']);
        });

        it('deduplica codes repetidos', () => {
            const { cards } = buildItemCards([
                item({ text: 't', code: 'Trust, Risk, Trust' })
            ], REGISTRY);

            assert.deepStrictEqual(cards[0].codes, ['Trust', 'Risk']);
        });
    });

    describe('buildDisplayPlan', () => {
        it('usa MEMO como excerpt quando não há QUOTATION', () => {
            const plan = buildDisplayPlan({ note: { type: 'MEMO' } });
            assert.deepStrictEqual(plan.excerptFields, ['note']);
            assert.deepStrictEqual(plan.memoFields, [], 'MEMO virou excerpt, não repete como campo');
        });

        it('mantém MEMO como campo quando há QUOTATION', () => {
            const plan = buildDisplayPlan(REGISTRY);
            assert.deepStrictEqual(plan.excerptFields, ['text']);
            assert.deepStrictEqual(plan.memoFields, ['note']);
        });

        it('não suprime codes quando há chain', () => {
            assert.strictEqual(buildDisplayPlan(REGISTRY).showCodes, true);
        });
    });

    describe('robustez', () => {
        it('tolera registry vazio', () => {
            const { cards } = buildItemCards([item({ qualquer: 'valor' })], {});
            assert.strictEqual(cards.length, 1);
            assert.strictEqual(cards[0].fields[0].name, 'qualquer');
        });

        it('tolera lista de items vazia ou nula', () => {
            assert.strictEqual(buildItemCards([], REGISTRY).cards.length, 0);
            assert.strictEqual(buildItemCards(null, REGISTRY).cards.length, 0);
        });

        it('ignora valores vazios e normaliza espaços', () => {
            const { cards } = buildItemCards([
                item({ text: '  muito   espaço  ', zone: '   ' })
            ], REGISTRY);

            assert.strictEqual(cards[0].excerpt.value, 'muito espaço');
            assert.ok(!cards[0].fields.some(f => f.name === 'zone'));
        });

        it('orderedFieldNames não duplica campos presentes nos dois lados', () => {
            const names = orderedFieldNames({ zone: {} }, { zone: 'x' });
            assert.deepStrictEqual(names, ['zone']);
        });
    });
});
