'use strict';

const { assert } = require('chai');
const { findExcerpt } = require('../../src/utils/fuzzyMatcher');

describe('fuzzyMatcher', () => {

    describe('findExcerpt — exact match', () => {
        it('finds an exact substring at the start', () => {
            const result = findExcerpt('Hello world', 'Hello');
            assert.deepEqual(result, { start: 0, end: 5 });
        });

        it('finds an exact substring in the middle', () => {
            const result = findExcerpt('The quick brown fox', 'quick');
            assert.deepEqual(result, { start: 4, end: 9 });
        });

        it('finds case-insensitive match', () => {
            const result = findExcerpt('Hello World', 'hello');
            assert.isNotNull(result);
            assert.equal(result.start, 0);
        });
    });

    describe('findExcerpt — normalized match', () => {
        it('finds excerpt with extra whitespace', () => {
            const abstract = 'The quick   brown fox';
            const excerpt = 'quick brown';
            const result = findExcerpt(abstract, excerpt);
            assert.isNotNull(result);
            assert.isTrue(result.start >= 4);
        });

        it('finds excerpt across different punctuation', () => {
            const abstract = 'knowledge: synthesis method';
            const excerpt = 'knowledge synthesis';
            const result = findExcerpt(abstract, excerpt);
            assert.isNotNull(result);
        });

        it('returns null when excerpt is not present', () => {
            assert.isNull(findExcerpt('Hello world', 'foobar'));
        });
    });

    describe('findExcerpt — edge cases', () => {
        it('returns null for empty abstract', () => {
            assert.isNull(findExcerpt('', 'hello'));
        });

        it('returns null for empty excerpt', () => {
            assert.isNull(findExcerpt('hello world', ''));
        });

        it('returns null when both are null/undefined', () => {
            assert.isNull(findExcerpt(null, null));
        });

        it('finds single-word excerpt', () => {
            const result = findExcerpt('The cat sat on the mat', 'cat');
            assert.isNotNull(result);
            assert.equal(result.start, 4);
            assert.equal(result.end, 7);
        });

        it('returned range covers the correct text', () => {
            const abstract = 'Synthesis is the key concept here';
            const excerpt = 'key concept';
            const result = findExcerpt(abstract, excerpt);
            assert.isNotNull(result);
            assert.equal(abstract.slice(result.start, result.end), 'key concept');
        });
    });

    /**
     * Normalização Unicode e hifenização (F5).
     *
     * Duas causas de "às vezes não localiza, sem motivo":
     *   - abstract e excerpt em formas Unicode diferentes (NFC × NFD). Crítico
     *     em português: `ç` e `ã` são um caractere ou dois conforme a origem.
     *   - abstract extraído de PDF traz `socio-\neconomic`; o excerpt digitado é
     *     `socioeconomic`.
     *
     * Os testes de offset não são cosméticos: um match encontrado na posição
     * errada destaca o trecho errado — pior que não encontrar.
     */
    describe('findExcerpt — normalização Unicode', () => {
        const NFC = 'A aceitação social é central para a transição.';

        it('localiza excerpt NFD em abstract NFC', () => {
            const result = findExcerpt(NFC, 'aceitação'.normalize('NFD'));
            assert.isNotNull(result);
        });

        it('localiza excerpt NFC em abstract NFD', () => {
            const result = findExcerpt(NFC.normalize('NFD'), 'aceitação');
            assert.isNotNull(result);
        });

        it('devolve offsets corretos apesar da normalização', () => {
            const result = findExcerpt(NFC, 'aceitação'.normalize('NFD'));
            assert.equal(NFC.slice(result.start, result.end), 'aceitação');
        });

        it('preserva os acentos do texto original no trecho devolvido', () => {
            const result = findExcerpt(NFC, 'aceitação social');
            assert.equal(NFC.slice(result.start, result.end), 'aceitação social');
        });

        it('localiza mesmo com acentuação divergente entre os lados', () => {
            // Efeito colateral aceito: a busca fica insensível a acentos.
            const abstract = 'O cenario foi critico naquele ano.';
            const result = findExcerpt(abstract, 'crítico');
            assert.isNotNull(result);
            assert.equal(abstract.slice(result.start, result.end), 'critico');
        });
    });

    describe('findExcerpt — hifenização de PDF', () => {
        it('localiza palavra quebrada por hífen + LF', () => {
            const abstract = 'We studied the socio-\neconomic impacts of wind.';
            const result = findExcerpt(abstract, 'socioeconomic impacts');
            assert.isNotNull(result);
        });

        it('localiza palavra quebrada por hífen + CRLF', () => {
            // .bib gravado no Windows.
            const abstract = 'We studied the socio-\r\neconomic impacts of wind.';
            const result = findExcerpt(abstract, 'socioeconomic impacts');
            assert.isNotNull(result);
        });

        it('devolve offsets que cobrem as duas metades e a quebra', () => {
            const abstract = 'We studied the socio-\neconomic impacts of wind.';
            const result = findExcerpt(abstract, 'socioeconomic impacts');
            assert.equal(
                abstract.slice(result.start, result.end),
                'socio-\neconomic impacts'
            );
        });

        it('hífen comum continua sendo descartado, como antes da mudança', () => {
            // Comportamento PRÉ-EXISTENTE, verificado contra a versão anterior:
            // o hífen não é alfanumérico nem espaço, então some da normalização
            // e 'socio-economic' compara como 'socioeconomic'. A de-hifenização
            // de quebra de linha não alterou isto.
            const abstract = 'The socio-economic impact was large.';

            assert.isNotNull(findExcerpt(abstract, 'socioeconomic impact'));
            assert.isNotNull(findExcerpt(abstract, 'socio-economic impact'));
            // O espaço no lugar do hífen NÃO casa — o hífen vira nada, não espaço.
            assert.isNull(findExcerpt(abstract, 'socio economic impact'));
        });
    });

    describe('findExcerpt — não-regressão da normalização', () => {
        it('mantém match direto sem passar pela normalização', () => {
            const abstract = 'Exact match here';
            const result = findExcerpt(abstract, 'match');
            assert.equal(result.start, 6);
            assert.equal(result.end, 11);
        });

        it('continua devolvendo null para excerpt inexistente', () => {
            assert.isNull(findExcerpt('Hello world', 'foobar'));
        });

        it('não lança para texto com emoji fora do BMP', () => {
            assert.doesNotThrow(() => findExcerpt('estudo 𝐀 sobre vento', 'sobre vento'));
        });

        it('localiza corretamente após caractere fora do BMP', () => {
            const abstract = 'estudo 𝐀 sobre vento';
            const result = findExcerpt(abstract, 'sobre vento');
            assert.isNotNull(result);
            assert.equal(abstract.slice(result.start, result.end), 'sobre vento');
        });
    });
});
