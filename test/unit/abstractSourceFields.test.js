'use strict';

require('../helpers/vscodeMock').install();

const assert = require('assert');
const { buildSourceFields } = require('../../src/viewers/abstractViewer');

/**
 * Campos do bloco SOURCE no abstractViewer (F4.b).
 *
 * O cabeçalho do viewer é montado 100% do BibTeX; os campos que o pesquisador
 * escreve no bloco SOURCE do .syn (`description`, `method`, ...) não tinham por
 * onde chegar à tela. `get_excerpts` passou a devolvê-los na chave `source`.
 *
 * Compatibilidade nas duas direções:
 *   - LSP novo + extensão antiga → chave desconhecida, ignorada;
 *   - LSP antigo + extensão nova → `source` ausente, seção omitida (aqui).
 */

const REGISTRY = {
    description: { type: 'TEXT', scope: 'SOURCE', description: 'Resumo da fonte' },
    method: { type: 'TEXT', scope: 'SOURCE' },
    citation: { type: 'QUOTATION', scope: 'ITEM' }
};

describe('abstractViewer — campos do SOURCE', () => {
    describe('render', () => {
        it('constrói campos a partir do payload do LSP', () => {
            const fields = buildSourceFields(
                { description: 'Um estudo', method: 'Entrevistas' },
                REGISTRY
            );

            assert.strictEqual(fields.length, 2);
            assert.deepStrictEqual(fields.map(f => f.name), ['description', 'method']);
        });

        it('usa a description do template como rótulo', () => {
            const fields = buildSourceFields({ description: 'Um estudo' }, REGISTRY);

            assert.strictEqual(fields[0].label, 'Resumo da fonte');
        });

        it('cai no nome do campo quando o template não tem description', () => {
            const fields = buildSourceFields({ method: 'Entrevistas' }, REGISTRY);

            assert.strictEqual(fields[0].label, 'method');
        });

        it('segue a ordem de declaração do template, não a do payload', () => {
            const fields = buildSourceFields(
                { method: 'Entrevistas', description: 'Um estudo' },
                REGISTRY
            );

            assert.deepStrictEqual(fields.map(f => f.name), ['description', 'method']);
        });

        it('preserva o tipo do campo para o render decidir o formato', () => {
            const fields = buildSourceFields({ description: 'x' }, REGISTRY);

            assert.strictEqual(fields[0].type, 'TEXT');
        });

        it('normaliza espaços do valor', () => {
            const fields = buildSourceFields({ description: '  muito   espaço ' }, REGISTRY);

            assert.deepStrictEqual(fields[0].values, ['muito espaço']);
        });

        it('aceita valores múltiplos', () => {
            const fields = buildSourceFields({ method: ['um', 'dois'] }, REGISTRY);

            assert.deepStrictEqual(fields[0].values, ['um', 'dois']);
            assert.strictEqual(fields[0].isMultiple, true);
        });

        it('mantém campo do payload ausente do registry', () => {
            const fields = buildSourceFields({ campo_novo: 'valor' }, REGISTRY);

            assert.strictEqual(fields.length, 1);
            assert.strictEqual(fields[0].name, 'campo_novo');
        });

        it('casa o campo do template com caixa diferente no payload', () => {
            const fields = buildSourceFields({ DESCRIPTION: 'Um estudo' }, REGISTRY);

            assert.strictEqual(fields.length, 1);
            assert.strictEqual(fields[0].label, 'Resumo da fonte');
        });
    });

    describe('compatibilidade — a seção não pode quebrar nem aparecer vazia', () => {
        it('devolve [] quando source está ausente (LSP antigo)', () => {
            assert.deepStrictEqual(buildSourceFields(undefined, REGISTRY), []);
            assert.deepStrictEqual(buildSourceFields(null, REGISTRY), []);
        });

        it('devolve [] para source vazio', () => {
            assert.deepStrictEqual(buildSourceFields({}, REGISTRY), []);
        });

        it('devolve [] quando todos os valores são vazios', () => {
            const fields = buildSourceFields({ description: '', method: '   ' }, REGISTRY);

            assert.deepStrictEqual(fields, []);
        });

        it('não lança com registry ausente', () => {
            assert.doesNotThrow(() => buildSourceFields({ x: 'v' }, null));
            assert.strictEqual(buildSourceFields({ x: 'v' }, null).length, 1);
        });

        it('não lança para source de tipo inesperado', () => {
            assert.deepStrictEqual(buildSourceFields('texto', REGISTRY), []);
            assert.deepStrictEqual(buildSourceFields(42, REGISTRY), []);
        });
    });
});
