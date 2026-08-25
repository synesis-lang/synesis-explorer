/**
 * evidence.test.js — identidade de evidência (Etapa 3).
 *
 * O caso central: uma citação montada com um segmento da fonte A e outro da
 * fonte B, unidos por `(...)`, era **aprovada** pela verificação anterior —
 * porque cada segmento era procurado no texto combinado de todas as ferramentas.
 * Um recorte que atravessa duas fontes não é recorte, é montagem.
 */

const assert = require('assert');
const {
    parseEvidenceRecords,
    groupEvidence,
    citationMatchesRecord,
    findSupportingRecord
} = require('../../src/chat/evidence');

/** Duas fontes distintas, cada uma com metade da citação forjada. */
const FONTE_A = {
    citation: 'a aceitação social depende da confiança institucional',
    item_id: 'face85_c0001',
    bibtex: 'avelar2016',
    year: '2016',
    source_file: 'face85.syn',
    source_line: 10
};

const FONTE_B = {
    citation: 'o custo percebido supera o benefício declarado',
    item_id: 'face85_c0002',
    bibtex: 'ribeiro2020',
    year: '2020',
    source_file: 'face85.syn',
    source_line: 42
};

const PAYLOAD = JSON.stringify({ records: [FONTE_A, FONTE_B] });

describe('Evidência — leitura do payload', () => {
    it('normaliza os campos que o MCP devolve', () => {
        const [primeiro] = parseEvidenceRecords([PAYLOAD]);
        assert.strictEqual(primeiro.itemId, 'face85_c0001');
        assert.strictEqual(primeiro.sourceFile, 'face85.syn');
        assert.strictEqual(primeiro.sourceLine, 10);
        assert.strictEqual(primeiro.bibtex, 'avelar2016');
    });

    it('descarta linha que não é evidência', () => {
        // Contagem não é evidência de nada. Tratá-la como tal foi o que fez o
        // botão de auditoria aparecer em turnos sem trecho algum.
        const contagem = JSON.stringify({ records: [{ count: 20 }] });
        assert.deepStrictEqual(parseEvidenceRecords([contagem]), []);
    });

    it('sobrevive a payload que não é JSON', () => {
        // Recusa de acesso chega como texto cru; não pode derrubar a resposta.
        assert.deepStrictEqual(parseEvidenceRecords(['not authorized']), []);
        assert.deepStrictEqual(parseEvidenceRecords([undefined]), []);
    });
});

describe('Evidência — citação cabe num único registro', () => {
    it('RECUSA citação montada com segmentos de duas fontes', () => {
        // O defeito reproduzido pela revisão. Cada metade existe — em fontes
        // diferentes —, e a versão por `haystack` aprovava.
        const forjada =
            'a aceitação social depende da confiança institucional (...) o custo percebido supera o benefício declarado';
        const records = parseEvidenceRecords([PAYLOAD]);

        assert.strictEqual(findSupportingRecord(forjada, records), undefined);
    });

    it('aceita recorte legítimo dentro do MESMO registro', () => {
        const record = {
            citation: 'a aceitação social depende, em grande medida, da confiança institucional local'
        };
        assert.ok(
            citationMatchesRecord('a aceitação social depende (...) da confiança institucional', record.citation)
        );
    });

    it('exige a ORDEM original dos segmentos', () => {
        // Dois trechos reais do mesmo parágrafo, apresentados invertidos, mudam
        // o que o autor disse — e passavam pela verificação anterior.
        const citation = 'primeiro vem a confiança, depois vem a aceitação do projeto';
        assert.ok(citationMatchesRecord('primeiro vem a confiança (...) aceitação do projeto', citation));
        assert.ok(!citationMatchesRecord('aceitação do projeto (...) primeiro vem a confiança', citation));
    });

    it('encontra o registro que sustenta uma citação real', () => {
        const records = parseEvidenceRecords([PAYLOAD]);
        const record = findSupportingRecord('o custo percebido supera o benefício declarado', records);
        assert.ok(record);
        assert.strictEqual(record.bibtex, 'ribeiro2020');
    });

    it('tolera escape de LaTeX herdado do `.syn`', () => {
        // Falso alarme observado ao vivo em `43,08\%`: a barra não é conteúdo,
        // e chega DUPLICADA no payload JSON do MCP.
        assert.ok(citationMatchesRecord('43,08% da variação total', 'explica 43,08\\\\% da variação total'));
    });

    it('tolera aspas tipográficas DENTRO da citação', () => {
        // As aspas que DELIMITAM a citação são removidas por `extractQuotes`
        // antes de chegar aqui; as internas é que precisam normalizar.
        assert.ok(
            citationMatchesRecord(
                'o autor chama isso de “aceitação passiva” no capítulo',
                'o autor chama isso de "aceitação passiva" no capítulo final'
            )
        );
    });
});

describe('Evidência — agrupamento e identidade', () => {
    it('dá um evidenceId curto por origem', () => {
        const grupos = groupEvidence(parseEvidenceRecords([PAYLOAD]));
        assert.deepStrictEqual(grupos.map((g) => g.evidenceId), ['E1', 'E2']);
    });

    it('agrupa o bloco ITEM com várias chains numa entrada só', () => {
        // Um bloco `ITEM` com N chains gera N vértices `Item`, todos com a mesma
        // citação e origem. Repetir a citação N vezes é ruído.
        const quatroChains = JSON.stringify({
            records: [1, 2, 3, 4].map((n) => ({ ...FONTE_A, item_id: `id_${n}` }))
        });
        const grupos = groupEvidence(parseEvidenceRecords([quatroChains]));

        assert.strictEqual(grupos.length, 1);
        assert.strictEqual(grupos[0].count, 4);
        assert.strictEqual(grupos[0].itemIds.length, 4);
    });

    it('aceita tanto a linha crua quanto a normalizada', () => {
        // As duas formas circulam; exigir a normalização antes seria uma
        // pegadinha que devolve lista vazia sem erro.
        const daLinhaCrua = groupEvidence([FONTE_A]);
        const doParser = groupEvidence(parseEvidenceRecords([JSON.stringify({ records: [FONTE_A] })]));

        assert.strictEqual(daLinhaCrua[0].file, 'face85.syn');
        assert.strictEqual(daLinhaCrua[0].line, 10);
        assert.deepStrictEqual(daLinhaCrua[0].itemIds, doParser[0].itemIds);
    });
});
