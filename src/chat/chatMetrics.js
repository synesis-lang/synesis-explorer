/**
 * chatMetrics.js — mede a qualidade da recuperação **sem juiz LLM**.
 *
 * Serve a uma pergunta concreta do pesquisador: *este modelo é confiável para o
 * meu corpus?* Comparar modelos exige um número, e a objeção usual às métricas
 * de RAG é que exigiriam um gabarito que ninguém tem.
 *
 * As três métricas daqui não exigem: são aritmética sobre o que já aconteceu no
 * turno. `faithfulness` com juiz LLM continua fora de escopo — é cara, ruidosa e
 * favorece respostas no estilo do próprio juiz.
 *
 * **Em comparação, não em valor absoluto.** Uma cobertura de 0,8 não significa
 * nada sozinha; 0,8 contra 0,5 no mesmo corpus, com as mesmas perguntas, é sinal.
 * É o desenho registrado em `nemotron_robustness_case_study`: medir diferença.
 */

const { extractQuotes, verifyCitations } = require('./citationGuard');

/**
 * Frases que denunciam recusa explícita — **sinal secundário**.
 *
 * Só valem quando o sinal estrutural não decide (ver `detectAbstention`). São
 * bilíngues porque um corpus pode estar em qualquer idioma: o `face85` é em
 * português, o `social_acceptance` em inglês, e uma lista só em português
 * contava 0 recusas num corpus inglês — número errado com aparência de medição.
 */
const ABSTENTION_MARKERS = [
    // Português
    'não tem trechos',
    'não há trechos',
    'não contém trechos',
    'não encontrei trechos',
    'não sustentam',
    'não sustenta',
    'corpus não',
    'não foi anotado',
    'não há registro',
    'fora do escopo',
    // Inglês
    'no annotated',
    'no excerpts',
    'does not contain',
    'do not support',
    'does not support',
    'could not find',
    'outside the scope',
    'not annotated',
    'no record of',
    'corpus has no'
];

/**
 * Compara sem acento: o marcador é heurística de forma, não de conteúdo.
 *
 * Aqui o afrouxamento é seguro — e no `citationGuard` seria perigoso, onde
 * acento distingue afirmações. A diferença é o que está em jogo: lá, aprovar
 * citação adulterada; aqui, deixar de contar uma recusa porque o modelo (ou uma
 * tradução) escreveu "nao" em vez de "não".
 */
function foldAccents(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

function looksLikeAbstention(answer) {
    const text = foldAccents(answer);
    return ABSTENTION_MARKERS.some((marker) => text.includes(foldAccents(marker)));
}

/**
 * As consultas do turno voltaram todas sem linhas?
 *
 * O MCP do ArcadeDB devolve `{"records": [...]}`; vazio é `[]` ou `count: 0`.
 * Uma resposta que não é JSON (recusa de acesso, erro) não conta como consulta
 * vazia — é outra coisa, e tratá-la como ausência de dados seria mentir sobre o
 * corpus.
 */
/**
 * Classifica um payload de ferramenta.
 *
 * **O defeito corrigido (Etapa 7).** A versão anterior media `rows.length`, o
 * que faz `{"records":[{"count":0}]}` — uma agregação que não encontrou nada —
 * contar como resultado, porque a linha existe. O próprio comentário do código
 * dizia que `count: 0` deve valer como vazio, e o comportamento contradizia.
 *
 * As cinco categorias são distintas e nenhuma delas é "vazio" no mesmo sentido:
 * uma consulta sem linhas não achou; uma agregação zerada achou e o total é
 * zero; um erro nem chegou a medir.
 */
const PayloadKind = {
    NO_ROWS: 'no_rows',
    ZERO_AGGREGATE: 'zero_aggregate',
    ROWS: 'rows',
    NOT_JSON: 'not_json',
    ERROR: 'error'
};

/** Toda propriedade da linha é numérica e vale zero? */
function isZeroAggregateRow(row) {
    if (!row || typeof row !== 'object') {
        return false;
    }
    const values = Object.values(row);
    if (values.length === 0) {
        return false;
    }
    return values.every((value) => typeof value === 'number' && value === 0);
}

function classifyPayload(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Recusa de acesso e erro de servidor chegam como texto cru. Não é
        // ausência de dado — é ausência de medição, e tratar como vazio mentiria
        // sobre o corpus.
        return PayloadKind.NOT_JSON;
    }
    const rows = Array.isArray(parsed) ? parsed : parsed && parsed.records;
    if (!Array.isArray(rows)) {
        return PayloadKind.NOT_JSON;
    }
    if (rows.length === 0) {
        return PayloadKind.NO_ROWS;
    }
    if (rows.every(isZeroAggregateRow)) {
        return PayloadKind.ZERO_AGGREGATE;
    }
    return PayloadKind.ROWS;
}

/**
 * Todas as consultas do turno voltaram sem dado?
 *
 * "Sem dado" cobre a consulta sem linhas E a agregação zerada — as duas
 * significam que o corpus não sustenta a afirmação. Payload não-JSON não conta:
 * não sabemos o que houve.
 */
function allQueriesEmpty(toolTexts) {
    const kinds = (toolTexts || [])
        .map(classifyPayload)
        .filter((kind) => kind !== PayloadKind.NOT_JSON);

    return (
        kinds.length > 0 &&
        kinds.every((kind) => kind === PayloadKind.NO_ROWS || kind === PayloadKind.ZERO_AGGREGATE)
    );
}

/**
 * O turno foi uma abstenção?
 *
 * **O sinal estrutural decide; a frase é desempate.** É a diferença entre medir
 * fato e adivinhar prosa: se todas as consultas voltaram vazias e a resposta não
 * apresentou citação nenhuma, o modelo não tinha o que afirmar — **em qualquer
 * idioma**, sem depender de reconhecer como ele redigiu a recusa.
 *
 * Casar frases era o desenho anterior, e falhava em silêncio num corpus inglês:
 * três recusas corretas eram contadas como zero, e o pesquisador concluiria que
 * o modelo inventa. Número errado com aparência de medição é pior que métrica
 * ausente.
 *
 * A frase ainda serve num caso que a estrutura não cobre: o modelo recusa
 * **sem consultar** (reconhece de saída que a pergunta está fora do corpus).
 * Aí não há payload a inspecionar.
 */
function detectAbstention({ answerText, toolTexts, quotes }) {
    if (allQueriesEmpty(toolTexts)) {
        // Consultas vazias e nenhuma citação: recusa, em qualquer idioma.
        return !quotes;
    }

    // Houve dado, mas a resposta **não citou nada**: pode ser recusa legítima —
    // a consulta trouxe linhas sobre outra coisa e o modelo reconheceu que o
    // tema perguntado não está lá. Aqui a frase é o único sinal disponível.
    //
    // Com citação, ao contrário, o turno apresentou evidência: uma negação
    // parcial na prosa ("o corpus não trata de X, mas trata de Y") não o torna
    // uma abstenção, e deixar a heurística decidir inflaria a métrica.
    if (quotes) {
        return false;
    }
    return looksLikeAbstention(answerText);
}

/**
 * Métricas de um turno.
 *
 * - `rounds` — consultas encadeadas até responder. É o número que mostra se a
 *   busca semântica eliminou o tateio (Etapa D): a mesma pergunta antes e depois
 *   dela deve gastar menos rodadas.
 * - `quotes` / `verifiedQuotes` — quantas citações a resposta trouxe e quantas
 *   existem no payload. A razão é a **cobertura de citação**: aritmética, não
 *   julgamento.
 * - `abstained` — reconheceu não ter lastro.
 */
function measureTurn({ answerText, toolTexts, rounds, trace }) {
    const quotes = extractQuotes(answerText);
    const { verified } = verifyCitations(answerText, toolTexts);

    // **Contagens do trace, não do texto (Etapa 7).** `toolCalls` era
    // `toolTexts.length` — o número de PAYLOADS coletados, não de chamadas: uma
    // ferramenta que devolve duas partes de texto contava como duas, e uma que
    // falhou contava como zero. O trace sabe o que de fato foi invocado.
    const calls = (trace && trace.toolCalls) || [];
    const modelCalls = calls.filter((call) => !call.prefetch);

    return {
        // Rodadas de modelo — `sendRequest()`, não chamadas de ferramenta: uma
        // rodada pode conter várias.
        rounds: Number(rounds) || 0,
        modelRequests: trace ? trace.modelRequests : Number(rounds) || 0,
        toolCalls: calls.length ? modelCalls.length : (toolTexts || []).length,
        // O prefetch de schema e contexto custa consulta real; separá-lo mantém
        // o custo honesto sem confundir com o que o modelo pediu.
        prefetchCalls: calls.filter((call) => call.prefetch).length,
        failedToolCalls: calls.filter((call) => call.status === 'error').length,
        emptyQueries: modelCalls.filter((call) =>
            (call.texts || []).some((text) => {
                const kind = classifyPayload(text);
                return kind === PayloadKind.NO_ROWS || kind === PayloadKind.ZERO_AGGREGATE;
            })
        ).length,
        quotes: quotes.length,
        verifiedQuotes: verified.length,
        abstained: detectAbstention({ answerText, toolTexts, quotes: quotes.length })
    };
}

/**
 * Agrega os turnos de uma bateria.
 *
 * **`citationCoverage` foi renomeada e passou a admitir `null` (Etapa 7).** Dois
 * defeitos no mesmo número:
 *
 * - **Valia `1` sem citação nenhuma.** Cobertura perfeita e nada medido saíam
 *   idênticos no relatório. O caso correto é *não aplicável* — `null` aqui,
 *   `N/A` no relatório —, porque um modelo que nunca cita não deve pontuar como
 *   um que cita e acerta.
 * - **O nome dizia mais do que o número entrega.** Ela divide citações
 *   conferidas por citações extraídas: é a **precisão literal das citações
 *   detectadas**, não a cobertura das afirmações. Uma afirmação sem citação
 *   alguma é invisível a ela — e é justamente o caso que "cobertura" sugeriria
 *   estar medindo.
 *
 * Medir cobertura de afirmação exige saber quais afirmações existem, o que pede
 * o protocolo `[E#]` por afirmação e uma bateria com gabarito. Enquanto não
 * houver, o honesto é não prometer.
 */
function summarize(turns) {
    const rows = turns || [];
    if (rows.length === 0) {
        return {
            turns: 0,
            avgRounds: 0,
            avgModelRequests: 0,
            totalQuotes: 0,
            verifiedQuotes: 0,
            literalQuotePrecision: null,
            claimCitationCoverage: null,
            toolCalls: 0,
            prefetchCalls: 0,
            failedToolCalls: 0,
            emptyQueries: 0,
            abstentions: 0
        };
    }

    const sum = (key) => rows.reduce((total, turn) => total + (turn[key] || 0), 0);
    const totalQuotes = sum('quotes');
    const verifiedQuotes = sum('verifiedQuotes');

    return {
        turns: rows.length,
        avgRounds: Number((sum('rounds') / rows.length).toFixed(2)),
        avgModelRequests: Number((sum('modelRequests') / rows.length).toFixed(2)),
        totalQuotes,
        verifiedQuotes,
        // `null`, não `1`: sem citação não há o que medir.
        literalQuotePrecision:
            totalQuotes === 0 ? null : Number((verifiedQuotes / totalQuotes).toFixed(3)),
        // Só existe com protocolo de evidência por afirmação, que ainda não há.
        claimCitationCoverage: null,
        toolCalls: sum('toolCalls'),
        prefetchCalls: sum('prefetchCalls'),
        failedToolCalls: sum('failedToolCalls'),
        emptyQueries: sum('emptyQueries'),
        abstentions: rows.filter((t) => t.abstained).length
    };
}

/**
 * Perguntas-armadilha: a resposta sabidamente **não** está no corpus.
 *
 * A métrica mais barata e mais defensável que existe aqui — binária, sem juiz.
 * Um modelo que responde a estas está inventando, e não há discussão possível
 * sobre o critério.
 *
 * O texto é deliberadamente plausível para a área: perguntar sobre algo
 * absurdo mediria a capacidade de reconhecer absurdo, não de reconhecer que o
 * corpus não cobre o tema.
 */
const TRAP_QUESTIONS = [
    // Português
    'O que o corpus diz sobre política monetária no Japão?',
    'Quais trechos tratam de manejo de solos em plantações de café?',
    'Que conceitos o corpus traz sobre protocolos de rede TCP/IP?',
    // Inglês — o corpus pode estar em qualquer idioma (`social_acceptance` é em
    // inglês), e a armadilha precisa ser feita na língua do material, senão
    // mede a capacidade de traduzir em vez da de reconhecer ausência.
    'What does the corpus say about monetary policy in Japan?',
    'Which excerpts deal with soil management in coffee plantations?',
    'What concepts does the corpus offer about TCP/IP network protocols?'
];

/**
 * Um valor que pode não existir.
 *
 * `N/A` e não `1`: o relatório precisa distinguir "medido e perfeito" de "não
 * havia o que medir". Sair igual foi o defeito da versão anterior — um modelo
 * que nunca cita aparecia com cobertura perfeita.
 */
function orNA(value) {
    return value === null || value === undefined ? 'N/A' : String(value);
}

/**
 * O cabeçalho experimental.
 *
 * **Sem isto o relatório não é reproduzível.** Comparar dois modelos exige que a
 * unidade experimental esteja congelada: `{modelo, provedor, banco, snapshot,
 * prompt, conjunto de perguntas}`. A versão anterior imprimia médias sem
 * registrar nenhum deles, então dois relatórios podiam diferir por troca de
 * banco no meio da sessão e parecer diferença entre modelos.
 *
 * Quando a sessão MISTUROU modelos ou bancos, isso é dito — em vez de agregar
 * silenciosamente coisas que não são comparáveis.
 */
function renderExperimentHeader(context = {}) {
    const models = [...new Set((context.models || []).filter(Boolean))];
    const databases = [...new Set((context.databases || []).filter(Boolean))];

    const lines = ['### Condições da medição', ''];
    lines.push(`- Modelo: ${models.length ? models.join(', ') : 'não registrado'}`);
    lines.push(`- Banco: ${databases.length ? databases.join(', ') : 'não registrado'}`);
    if (context.snapshot) {
        lines.push(`- Snapshot do grafo: ${context.snapshot}`);
    }
    lines.push(`- Relatório gerado em: ${new Date().toISOString()}`);

    if (models.length > 1 || databases.length > 1) {
        lines.push('');
        lines.push(
            '⚠️ **Esta sessão misturou ' +
                [models.length > 1 && 'modelos', databases.length > 1 && 'bancos']
                    .filter(Boolean)
                    .join(' e ') +
                '.** Os números agregados abaixo não são comparáveis com os de outra ' +
                'sessão: comece uma série nova para comparar.'
        );
    }

    lines.push('');
    return lines;
}

/**
 * Relatório em Markdown.
 *
 * Números com o que cada um significa: um relatório que exige decorar a
 * definição de cada métrica não é usado — e, pior, é lido como se medisse mais
 * do que mede.
 */
function renderReport(label, summary, trapSummary, context = {}) {
    const lines = [`## Métricas — ${label}`, ''];
    lines.push(...renderExperimentHeader(context));

    lines.push('| Métrica | Valor | O que significa |');
    lines.push('|---|---|---|');
    lines.push(`| Perguntas | ${summary.turns} | turnos medidos |`);
    lines.push(
        `| Rodadas de modelo (média) | ${orNA(summary.avgModelRequests || summary.avgRounds)} | ` +
            'chamadas ao modelo até responder — não é o número de consultas |'
    );
    lines.push(
        `| Consultas do modelo | ${orNA(summary.toolCalls)} | ferramentas que o modelo invocou |`
    );
    lines.push(
        `| Consultas da extensão | ${orNA(summary.prefetchCalls)} | schema e contexto, lidos antes do modelo |`
    );
    lines.push(
        `| Consultas sem dado | ${orNA(summary.emptyQueries)} | sem linhas, ou agregação zerada |`
    );
    lines.push(`| Falhas de ferramenta | ${orNA(summary.failedToolCalls)} | erros de chamada |`);
    lines.push(`| Citações | ${summary.totalQuotes} | trechos que a resposta apresentou |`);
    lines.push(
        `| Precisão literal | ${orNA(summary.literalQuotePrecision)} | ` +
            'fração das citações detectadas que existe num registro do banco |'
    );
    lines.push(
        `| Cobertura das afirmações | ${orNA(summary.claimCitationCoverage)} | ` +
            'exige protocolo de evidência por afirmação — ainda não medida |'
    );

    if (trapSummary) {
        const total = trapSummary.turns;
        lines.push(
            `| Abstenção | ${trapSummary.abstentions}/${total} | ` +
                'perguntas-armadilha recusadas — deve ser o total |'
        );
    }

    lines.push('');
    lines.push(
        '**Nenhuma destas métricas usa juiz LLM.** Precisão literal é comparação de ' +
            'strings contra o registro que o banco devolveu; abstenção é resposta a ' +
            'perguntas cuja resposta sabidamente não está no corpus.'
    );
    lines.push('');
    // O parágrafo mais importante do relatório: o que estes números NÃO são.
    lines.push(
        '**O que estes números não medem.** Precisão literal diz que o trecho existe, ' +
            'não que ele sustenta a afirmação que o acompanha — isso é entailment, e não ' +
            'está medido aqui. Afirmações sem citação alguma são invisíveis a ela. E nada ' +
            'disto mede se a resposta é *útil*: uma resposta que só repete citações pontua ' +
            'alto e ajuda pouco.'
    );
    lines.push('');
    lines.push(
        '**Compare, não leia em absoluto.** Um valor sozinho diz pouco; o mesmo conjunto ' +
            'de perguntas, no mesmo banco e snapshot, em dois modelos diz muito. As ' +
            'perguntas-armadilha abaixo são genéricas: um corpus que trate legitimamente ' +
            'de política monetária ou de solos precisa da sua própria bateria.'
    );

    return lines.join('\n');
}

module.exports = {
    PayloadKind,
    classifyPayload,
    looksLikeAbstention,
    allQueriesEmpty,
    detectAbstention,
    measureTurn,
    summarize,
    renderReport,
    TRAP_QUESTIONS,
    ABSTENTION_MARKERS
};
