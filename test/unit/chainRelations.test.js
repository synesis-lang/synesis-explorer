require('../helpers/vscodeMock').install();

const assert = require('assert');
const { buildRelationSet, isRelationToken, formatChain } = require('../../src/viewers/abstractViewer');

// As 11 relações declaradas em case-studies/ufmg/face85/face85.synt.
// A lista hardcoded anterior acertava 2 delas (CAUSES, ENABLES) e carregava 9
// nomes de outro projeto.
const FACE85_RELATIONS = [
    'MEASURES', 'PART_OF', 'APPLIES', 'USES', 'INHIBITS', 'CAUSES',
    'ENABLES', 'PREDICTS', 'CONTRASTS_WITH', 'ASSOCIATED_WITH', 'RELATES_TO'
];

const FACE85_REGISTRY = {
    text: { type: 'QUOTATION', scope: 'ITEM' },
    chain: { type: 'CHAIN', scope: 'ITEM', relations: FACE85_RELATIONS }
};

describe('relações CHAIN vindas do template', () => {
    describe('buildRelationSet', () => {
        it('extrai as relações declaradas no campo CHAIN', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            assert.strictEqual(set.size, 11);
            for (const rel of FACE85_RELATIONS) {
                assert.ok(set.has(rel), `${rel} deve estar no conjunto`);
            }
        });

        it('aceita relations como dict {nome: descrição} (parser local)', () => {
            const set = buildRelationSet({
                chain: { type: 'CHAIN', relations: { CAUSES: 'produz efeito', USES: 'emprega' } }
            });
            assert.deepStrictEqual([...set].sort(), ['CAUSES', 'USES']);
        });

        it('normaliza para caixa alta', () => {
            const set = buildRelationSet({ chain: { type: 'CHAIN', relations: ['causes'] } });
            assert.ok(set.has('CAUSES'));
        });

        it('ignora campos que não são CHAIN', () => {
            const set = buildRelationSet({
                code: { type: 'CODE', relations: ['NAO_E_RELACAO'] }
            });
            assert.strictEqual(set.size, 0);
        });

        it('tolera template sem RELATIONS declaradas', () => {
            const set = buildRelationSet({ chain: { type: 'CHAIN', relations: null } });
            assert.strictEqual(set.size, 0);
        });

        it('tolera registry vazio ou nulo', () => {
            assert.strictEqual(buildRelationSet({}).size, 0);
            assert.strictEqual(buildRelationSet(null).size, 0);
        });
    });

    describe('isRelationToken', () => {
        it('reconhece as 11 relações do face85 — regressão do defeito 2/11', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            for (const rel of FACE85_RELATIONS) {
                assert.ok(isRelationToken(rel, set), `${rel} deve ser reconhecida como relação`);
            }
        });

        it('não reconhece conceitos como relação', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            assert.strictEqual(isRelationToken('Trust', set), false);
            assert.strictEqual(isRelationToken('Social_Acceptance', set), false);
        });

        it('não reconhece relações de OUTRO projeto', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            // Estavam na lista hardcoded, mas não existem no face85
            assert.strictEqual(isRelationToken('INFLUENCES', set), false);
            assert.strictEqual(isRelationToken('CONTESTED-BY', set), false);
        });

        it('distingue RELATES_TO de RELATES-TO (separador importa)', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            assert.ok(isRelationToken('RELATES_TO', set), 'underscore está no template');
            assert.strictEqual(isRelationToken('RELATES-TO', set), false, 'hífen não está');
        });

        describe('fallback sem template', () => {
            it('trata CAIXA_ALTA sem espaços como relação', () => {
                assert.ok(isRelationToken('CAUSES', null));
                assert.ok(isRelationToken('PART_OF', new Set()));
            });

            it('não trata conceito capitalizado como relação', () => {
                assert.strictEqual(isRelationToken('Trust', null), false);
                assert.strictEqual(isRelationToken('Social Acceptance', null), false);
            });
        });
    });

    describe('formatChain', () => {
        it('marca relação como factor-link e conceito como factor-tag', () => {
            const set = buildRelationSet(FACE85_REGISTRY);
            const html = formatChain('Indicator -> MEASURES -> Construct', set);

            assert.ok(html.includes('class="factor-link">MEASURES'), 'MEASURES é relação');
            assert.ok(html.includes('class="factor-tag">Indicator'), 'Indicator é conceito');
            assert.ok(html.includes('class="factor-tag">Construct'), 'Construct é conceito');
        });

        it('sem o conjunto, MEASURES cairia como conceito na versão antiga', () => {
            // Documenta o defeito: com a lista hardcoded, MEASURES virava factor-tag.
            const listaAntiga = new Set(['INFLUENCES', 'ENABLES', 'CAUSES']);
            const html = formatChain('A -> MEASURES -> B', listaAntiga);
            assert.ok(html.includes('class="factor-tag">MEASURES'),
                'confirma o comportamento defeituoso que a correção elimina');
        });

        it('devolve marcador de vazio para chain ausente', () => {
            assert.ok(formatChain('', new Set()).includes('chain-empty'));
            assert.ok(formatChain(null, new Set()).includes('chain-empty'));
        });

        it('escapa HTML nos tokens', () => {
            const html = formatChain('<script> -> CAUSES -> B', buildRelationSet(FACE85_REGISTRY));
            assert.ok(!html.includes('<script>'));
            assert.ok(html.includes('&lt;script&gt;'));
        });
    });
});
