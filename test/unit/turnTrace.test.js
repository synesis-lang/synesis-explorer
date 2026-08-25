/**
 * turnTrace.test.js — o registro estruturado do turno (Etapa 1).
 *
 * O que estes testes protegem é a diferença entre **reproduzir** o turno e
 * **reconstruí-lo**: o botão antigo pedia a um novo ciclo do LLM que refizesse a
 * trilha, e a segunda execução podia contradizer a primeira sem estar certa.
 *
 * Os dois critérios de aceite da etapa estão aqui:
 * - reconstruir, sem LLM, qual query produziu cada payload e em qual banco;
 * - dois turnos diferentes continuarem endereçáveis depois de novas perguntas.
 */

const assert = require('assert');
const {
    TurnKind,
    createTurnTrace,
    recordToolCall,
    traceToolTexts,
    classifyTurn,
    parseRows,
    rowHasEvidence,
    TurnTraceStore
} = require('../../src/chat/turnTrace');

/** Payload com trecho anotado: é o que caracteriza evidência de corpus. */
const EVIDENCE_PAYLOAD = JSON.stringify({
    records: [
        {
            citation: 'male respondents were more likely to support CCS',
            item_id: 'face85_c0004',
            source_file: 'face85.syn',
            source_line: 187,
            bibtex: 'ashworth2019',
            year: 2019
        }
    ]
});

/** Contagem: linha real, mas sem trecho — outra unidade, outra promessa. */
const AGGREGATE_PAYLOAD = JSON.stringify({ records: [{ count: 20 }] });

const EMPTY_PAYLOAD = JSON.stringify({ records: [] });

function traceWith(calls) {
    const trace = createTurnTrace({ turnId: 't1', question: 'q', database: 'face85' });
    for (const call of calls) {
        recordToolCall(trace, call);
    }
    return trace;
}

describe('turnTrace', () => {
    describe('createTurnTrace', () => {
        it('achata o modelo, que não sobrevive fora do turno', () => {
            const trace = createTurnTrace({
                turnId: 't1',
                question: 'quais conceitos?',
                database: 'face85',
                model: { id: 'claude-x', name: 'Claude', vendor: 'anthropic', version: '1' }
            });
            assert.strictEqual(trace.model.vendor, 'anthropic');
            assert.strictEqual(trace.model.name, 'Claude');
            assert.strictEqual(trace.database, 'face85');
        });

        it('tolera turno sem modelo', () => {
            const trace = createTurnTrace({ turnId: 't1', question: 'q' });
            assert.strictEqual(trace.model, undefined);
        });
    });

    describe('recordToolCall', () => {
        it('preserva a query que produziu cada payload — o critério de aceite', () => {
            const trace = traceWith([
                {
                    round: 1,
                    callId: 'c1',
                    toolName: 'mcp_arcadedb_query',
                    input: { database: 'face85', language: 'cypher', query: 'MATCH (i:Item) RETURN i' },
                    texts: [EVIDENCE_PAYLOAD]
                }
            ]);

            // Sem LLM: a query, o banco e o payload saem do registro.
            const call = trace.toolCalls[0];
            assert.match(call.input.query, /MATCH \(i:Item\)/);
            assert.strictEqual(call.input.database, 'face85');
            assert.strictEqual(call.texts[0], EVIDENCE_PAYLOAD);
            assert.strictEqual(call.round, 1);
        });

        it('registra a falha, não só o que deu certo', () => {
            const trace = traceWith([
                { round: 1, toolName: 'q', status: 'error', error: 'not authorized' }
            ]);
            assert.strictEqual(trace.toolCalls[0].status, 'error');
            assert.match(trace.toolCalls[0].error, /not authorized/);
        });

        it('ignora trace ausente sem quebrar o caminho de chamada', () => {
            assert.doesNotThrow(() => recordToolCall(undefined, { toolName: 'q' }));
        });
    });

    describe('traceToolTexts', () => {
        it('exclui o prefetch por padrão', () => {
            const trace = traceWith([
                { toolName: 'schema', prefetch: true, texts: ['{"types":[]}'] },
                { toolName: 'query', texts: [EVIDENCE_PAYLOAD] }
            ]);
            assert.deepStrictEqual(traceToolTexts(trace), [EVIDENCE_PAYLOAD]);
            assert.strictEqual(traceToolTexts(trace, { includePrefetch: true }).length, 2);
        });
    });

    describe('classifyTurn', () => {
        it('evidence quando há trecho anotado', () => {
            const trace = traceWith([{ toolName: 'query', texts: [EVIDENCE_PAYLOAD] }]);
            assert.strictEqual(classifyTurn(trace), TurnKind.EVIDENCE);
        });

        it('aggregate para contagem: linha real, mas sem trecho a auditar', () => {
            const trace = traceWith([{ toolName: 'query', texts: [AGGREGATE_PAYLOAD] }]);
            assert.strictEqual(classifyTurn(trace), TurnKind.AGGREGATE);
        });

        it('empty quando a consulta é válida e não retorna linha', () => {
            const trace = traceWith([{ toolName: 'query', texts: [EMPTY_PAYLOAD] }]);
            assert.strictEqual(classifyTurn(trace), TurnKind.EMPTY);
        });

        // O defeito que motivou o enum: `consultedCorpus` era
        // `toolTexts.length > 0`, então um payload de schema oferecia trilha de
        // evidência onde não havia evidência nenhuma.
        it('template quando só houve prefetch de schema/contexto', () => {
            const trace = traceWith([
                { toolName: 'get_schema', prefetch: true, texts: ['{"types":[{"name":"Item"}]}'] }
            ]);
            assert.strictEqual(classifyTurn(trace), TurnKind.TEMPLATE);
        });

        it('error quando só houve falha', () => {
            const trace = traceWith([{ toolName: 'query', status: 'error', error: 'boom' }]);
            assert.strictEqual(classifyTurn(trace), TurnKind.ERROR);
        });

        it('none sem chamada alguma', () => {
            assert.strictEqual(classifyTurn(createTurnTrace({ turnId: 't', question: 'q' })), TurnKind.NONE);
            assert.strictEqual(classifyTurn(undefined), TurnKind.NONE);
        });

        it('evidência em qualquer chamada vence agregação nas demais', () => {
            const trace = traceWith([
                { toolName: 'query', texts: [AGGREGATE_PAYLOAD] },
                { toolName: 'query', texts: [EVIDENCE_PAYLOAD] }
            ]);
            assert.strictEqual(classifyTurn(trace), TurnKind.EVIDENCE);
        });
    });

    describe('parseRows / rowHasEvidence', () => {
        it('devolve undefined para payload não-JSON, sem lançar', () => {
            assert.strictEqual(parseRows('Not authorized'), undefined);
        });

        it('aceita array cru além de {records}', () => {
            assert.deepStrictEqual(parseRows('[{"a":1}]'), [{ a: 1 }]);
        });

        it('citation ou item_id caracterizam evidência; contagem não', () => {
            assert.ok(rowHasEvidence({ citation: 'x' }));
            assert.ok(rowHasEvidence({ item_id: 'face85_c1' }));
            assert.ok(!rowHasEvidence({ count: 20 }));
            assert.ok(!rowHasEvidence(null));
        });
    });

    describe('TurnTraceStore', () => {
        it('endereça cada turno pelo seu ID — o defeito de identidade', () => {
            const store = new TurnTraceStore();
            const first = createTurnTrace({ turnId: store.nextId(), question: 'primeira', database: 'face85' });
            store.save(first);
            const second = createTurnTrace({
                turnId: store.nextId(),
                question: 'segunda',
                database: 'social_acceptance'
            });
            store.save(second);

            // O botão da resposta antiga continua abrindo o turno dela, mesmo
            // depois de nova pergunta e de troca de banco.
            assert.strictEqual(store.get(first.turnId).question, 'primeira');
            assert.strictEqual(store.get(first.turnId).database, 'face85');
            assert.strictEqual(store.get(second.turnId).question, 'segunda');
            assert.notStrictEqual(first.turnId, second.turnId);
        });

        it('descarta os mais antigos ao passar do limite', () => {
            const store = new TurnTraceStore(2);
            const ids = [1, 2, 3].map(() => {
                const trace = createTurnTrace({ turnId: store.nextId(), question: 'q' });
                store.save(trace);
                return trace.turnId;
            });
            assert.strictEqual(store.size, 2);
            assert.strictEqual(store.get(ids[0]), undefined);
            assert.ok(store.get(ids[2]));
        });

        it('ignora trace sem ID', () => {
            const store = new TurnTraceStore();
            store.save(undefined);
            store.save({ question: 'sem id' });
            assert.strictEqual(store.size, 0);
        });
    });
});
