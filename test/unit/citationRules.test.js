/**
 * A trilha de auditoria vive no prompt: toda afirmação sobre o corpus deve
 * mostrar o trecho e a referência que a sustentam.
 *
 * O grafo já carregava a proveniência (`Item.citation` é o trecho literal
 * anotado, ligado por `FROM_SOURCE` à referência), mas nada mandava citar — as
 * três origens possíveis (trecho anotado, template, síntese do modelo) chegavam
 * ao pesquisador com o mesmo tom de confiança.
 *
 * Testar prompt tem limite honesto: garante que a INSTRUÇÃO está lá, não que o
 * modelo a obedeça. A obediência é verificada em teste manual, e é o que a
 * Etapa C (juiz de código) passa a checar de forma determinística.
 */

const assert = require('assert');
const { SYSTEM_PROMPT, CITATION_RULES, ARCADEDB_TOOL_NAMES } = require('../../src/chat/chatParticipant');

describe('Trilha de auditoria — regra de citação no prompt', () => {
    it('pede as propriedades de proveniência na mesma query', () => {
        // Sem isto o modelo consulta o conceito e volta sem o que o sustenta,
        // gastando uma rodada extra — ou pior, respondendo sem evidência.
        for (const prop of ['i.citation', 's.bibtex', 's.year']) {
            assert.ok(CITATION_RULES.includes(prop), `faltou pedir ${prop}`);
        }
    });

    it('pede a âncora até o arquivo .syn', () => {
        // Gravadas pelo synesis-graph a partir da Etapa A; é o que torna a
        // auditoria clicável (Etapa F) em vez de apenas textual.
        assert.ok(CITATION_RULES.includes('i.source_file'));
        assert.ok(CITATION_RULES.includes('i.source_line'));
    });

    it('exige a proveniência SEMPRE, sem alternativa de omitir', () => {
        // Observado ao vivo: a ressalva de compatibilidade ("podem não existir
        // em grafos antigos — siga sem eles") virou permissão. O modelo omitiu
        // source_file por antecipação, e sem ele no payload a âncora (Etapa G)
        // fica sem o que ancorar.
        assert.match(CITATION_RULES, /\*\*always\*\* return in the SAME query/);
        assert.match(CITATION_RULES, /without\s+exception/);
    });

    it('tolera grafo antigo como tratamento de ERRO, não como alternativa', () => {
        // A compatibilidade continua: um grafo anterior à Etapa A não tem
        // source_file. Mas é reação a uma consulta que falhou, não uma saída
        // oferecida de antemão.
        assert.match(CITATION_RULES, /Only if the query \*\*fails\*\*/);
        assert.match(CITATION_RULES, /Never omit them pre-emptively/);
    });

    it('impõe a ordem quote-first', () => {
        // O ponto da técnica: a citação vem da ferramenta, então gerá-la antes
        // é cópia, não geração. Escrevendo a conclusão primeiro, o modelo tende
        // a forjar uma citação que a valide.
        assert.match(CITATION_RULES, /Quote first, analyse second/i);
        assert.match(CITATION_RULES, /Never write the conclusion before the\s+evidence/i);
    });

    it('proíbe reescrever a citação com outras palavras', () => {
        // Uma citação parafraseada não é auditável: deixa de casar com o texto
        // do .syn, e é justamente o que o juiz de código (Etapa C) detecta.
        assert.match(CITATION_RULES, /never reword a quotation/i);
    });

    it('exige declarar a afirmação sem lastro em vez de afirmá-la igual', () => {
        // A parte que mais importa: sem ela o modelo cita o que tem e afirma o
        // resto no mesmo tom, o que é PIOR que não citar nada — dá aparência de
        // rigor ao conjunto todo.
        assert.match(CITATION_RULES, /has \*\*no\*\* excerpt supporting it/i);
    });

    it('nomeia as três origens que o pesquisador precisa distinguir', () => {
        assert.match(CITATION_RULES, /what is in the excerpts/i);
        assert.match(CITATION_RULES, /project.s template/i);
        assert.match(CITATION_RULES, /your own synthesis/i);
    });

    it('dispensa citação em pergunta de contagem ou estrutura', () => {
        // Citação onde não cabe é ruído, e ruído treina o pesquisador a ignorar
        // a trilha — o oposto do objetivo desta fase.
        assert.match(CITATION_RULES, /counts, labels/i);
        assert.match(CITATION_RULES, /do\s+\*\*not\*\* need an excerpt citation/i);
    });

    it('proíbe preencher lacuna com conhecimento geral', () => {
        // O modo de falha mais perigoso: o modelo sabe do tema por treino e
        // completa o que o corpus não tem, sem marcar a diferença.
        assert.match(CITATION_RULES, /general knowledge/i);
    });

    it('traz o formato de citação esperado', () => {
        assert.ok(CITATION_RULES.includes('— Author (year)'));
    });
});

describe('Trilha de auditoria — few-shot de abstenção', () => {
    it('mostra um exemplo de recusa com ferramenta vazia', () => {
        // Instrução negativa é a que modelos menores mais ignoram; padrão bate
        // melhor que regra. Precedente local: um modelo fraco marcou como OK um
        // registro com ZERO ITEMs, sintaticamente válido.
        assert.ok(CITATION_RULES.includes('{"records": []}'));
        assert.match(CITATION_RULES, /no annotated excerpts/i);
    });

    it('a recusa distingue ausência de anotação de irrelevância do tema', () => {
        // Distinção que protege a interpretação do pesquisador: o corpus não
        // ter o tema não é evidência de que o tema não importe.
        assert.match(CITATION_RULES, /does not mean the topic is irrelevant/i);
    });

    it('mostra um exemplo de resposta COM lastro, marcando a síntese', () => {
        // Só o exemplo de recusa ensinaria a recusar; o par mostra a forma certa
        // de responder quando há evidência.
        assert.ok(CITATION_RULES.includes('ashworth2019'));
        assert.match(CITATION_RULES, /My synthesis/i);
    });
});

describe('Trilha de auditoria — integração no prompt de sistema', () => {
    it('as regras de citação entram no SYSTEM_PROMPT', () => {
        assert.ok(SYSTEM_PROMPT.includes(CITATION_RULES));
    });

    it('a estrutura do Item anuncia a trilha até o .syn', () => {
        // O modelo não pode pedir o que não sabe que existe.
        assert.match(SYSTEM_PROMPT, /source_file.*source_line/s);
        assert.match(SYSTEM_PROMPT, /audit trail/i);
    });

    it('o exemplo de navegação já devolve a evidência', () => {
        // Um MATCH sem RETURN de citação ensinaria o padrão errado pelo exemplo,
        // que é mais forte que a regra em prosa.
        assert.match(SYSTEM_PROMPT, /RETURN i\.citation/);
    });

    it('não contradiz a regra de escrita bloqueada', () => {
        // Regressão: o prompt já teve duas ordens contraditórias sobre
        // list_databases. Citar não pode reintroduzir permissão de escrita.
        //
        // A garantia mudou de mecanismo na Etapa 1 e ficou mais forte: antes o
        // prompt PEDIA que o modelo não usasse `execute_command`, com a
        // ferramenta na mão; agora ela não é mais entregue (ver
        // `ARCADEDB_TOOL_NAMES`). Mínimo privilégio não depende de o modelo
        // obedecer — e o corpus que entra no contexto é conteúdo não confiável.
        assert.match(SYSTEM_PROMPT, /read-only/i);
        assert.ok(
            !/execute_command/.test(SYSTEM_PROMPT),
            'o prompt não deve mencionar uma ferramenta de escrita que o modelo não recebe'
        );
        assert.ok(
            !ARCADEDB_TOOL_NAMES.includes('execute_command'),
            'nenhuma ferramenta de escrita pode ser entregue ao modelo do chat'
        );
    });
});
