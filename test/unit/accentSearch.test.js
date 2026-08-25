/**
 * Busca por nome de conceito em corpus português.
 *
 * Observado ao vivo (2026-08-24): o modelo procurou
 * `fatores_sociais_e_psicologicos`, não achou, e afirmou ao pesquisador que o
 * conceito **não existe no corpus**. Ele existe — como
 * `fatores_sociais_e_psicológicos`.
 *
 * O erro é mais grave do que parece: "não foi anotado" é uma afirmação sobre o
 * material do pesquisador, e ele pode tomá-la como lacuna da própria pesquisa.
 * Ausência de resultado virou ausência de dado — exatamente o que a trilha de
 * auditoria existe para impedir, só que uma camada abaixo.
 *
 * Verificado contra o face85: `CONTAINS 'psicologicos'` devolve 0;
 * `CONTAINS 'psicol'` devolve os dois conceitos.
 */

const assert = require('assert');
const { SYSTEM_PROMPT } = require('../../src/chat/chatParticipant');

describe('Busca acentuada — instrução no prompt', () => {
    it('avisa que a comparação do banco é sensível a acento', () => {
        // "diacritic" e não "accent" (Etapa 2): a regra vale para qualquer
        // alfabeto com diacrítico, não só para as vogais do português.
        assert.match(SYSTEM_PROMPT, /diacritic-sensitive/i);
    });

    it('dá o exemplo concreto que falhou', () => {
        // O exemplo real vale mais que a regra abstrata: é o par que o modelo
        // efetivamente errou.
        assert.ok(SYSTEM_PROMPT.includes('psicologicos'));
        assert.ok(SYSTEM_PROMPT.includes('psicológicos'));
    });

    it('ensina a cortar ANTES do primeiro caractere com diacrítico', () => {
        // Verificado contra o banco: `psicol` acha os dois conceitos, enquanto
        // nem `name`, nem `search_name`, nem `LIKE` acham sem acento.
        //
        // A formulação deixou de citar "vogal acentuada" (Etapa 2): dizia a
        // regra do português como se fosse universal. O critério — maior prefixo
        // sem diacrítico — é o mesmo, e vale em qualquer idioma.
        assert.match(SYSTEM_PROMPT, /longest prefix of the term that carries no\s+diacritic/i);
        assert.ok(SYSTEM_PROMPT.includes("CONTAINS 'psicol'"));
    });

    it('cobre o caso em que o acento está dentro do radical', () => {
        // `distanc` e `criac` NÃO funcionam: em `distância` e `criação` o acento
        // vem antes do fim do radical. Verificado contra o face85 — só `dist` e
        // `cria` acham. Sem este exemplo a regra pareceria valer sempre.
        assert.ok(SYSTEM_PROMPT.includes("CONTAINS 'dist'"));
        assert.ok(SYSTEM_PROMPT.includes("CONTAINS 'cria'"));
        assert.match(SYSTEM_PROMPT, /Including the\s+accented character, or anything after it, fails/i);
    });

    it('põe o acento como primeira suspeita em consulta vazia', () => {
        // Antes a regra mandava suspeitar da direção da seta e do rótulo; o
        // acento é mais frequente num corpus em português.
        assert.match(SYSTEM_PROMPT, /suspect the accent or/i);
    });

    it('proíbe afirmar ausência sem tentar sem acento', () => {
        // A parte que protege a interpretação do pesquisador.
        assert.match(SYSTEM_PROMPT, /Never\s+state that a concept does not exist/i);
        assert.match(SYSTEM_PROMPT, /unaccented stem/i);
    });

    it('explica por que a afirmação de ausência é forte', () => {
        // Sem o porquê, a regra vira ritual: o modelo precisa entender que
        // "não foi anotado" fala do material do pesquisador.
        assert.match(SYSTEM_PROMPT, /gap in\s+their own material/i);
    });

    it('não perde as suspeitas anteriores', () => {
        // Regressão: direção da seta e rótulo continuam valendo, agora depois
        // do acento na ordem de suspeita.
        assert.match(SYSTEM_PROMPT, /arrow direction or the label/i);
    });
});

/**
 * A heurística vira fallback (Etapa 6).
 *
 * Cortar o termo antes do diacrítico dependia do idioma, da posição do acento e
 * de o modelo executar a transformação de cabeça. Com índice full-text
 * declarado, `SEARCH_INDEX` resolve deterministicamente — e o prompt precisa
 * dizer qual dos dois preferir.
 */
describe('Busca acentuada — precedência do full-text', () => {
    it('a regra de prefixo é declarada como sendo do `CONTAINS`', () => {
        assert.match(SYSTEM_PROMPT, /Comparison with `CONTAINS` is diacritic-sensitive/i);
    });

    it('manda preferir SEARCH_INDEX quando o grafo o declara', () => {
        assert.match(SYSTEM_PROMPT, /prefer `SEARCH_INDEX` over the\s+rule below/is);
    });

    it('mantém a regra de prefixo para grafo sem índice', () => {
        // Grafo antigo ou backend Neo4j continua precisando dela.
        assert.match(SYSTEM_PROMPT, /longest prefix of the term that carries no\s+diacritic/i);
    });
});
