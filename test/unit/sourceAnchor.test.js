/**
 * A âncora fecha a trilha: do conceito ao texto que o pesquisador escreveu.
 *
 * É o que separa "confie na citação" de "clique e veja". Só existe porque o
 * `synesis-graph` grava `source_file`/`source_line` no vértice `Item` (Etapa A),
 * com caminho relativo à raiz do projeto.
 */

const assert = require('assert');
const path = require('path');
const {
    buildSourceLocation,
    anchorTitle,
    streamSourceAnchors
} = require('../../src/chat/sourceAnchor');
const { extractOriginRecords, groupByOrigin } = require('../../src/chat/auditTrail');

// Absoluta em qualquer plataforma — ver a nota em pathContainment.test.js.
const ROOT = path.resolve(path.sep, 'GitHub', 'case-studies', 'ufmg', 'face85');

describe('Âncora — construção da Location', () => {
    it('converte a linha do grafo (1-based) para Position (0-based)', () => {
        // O detalhe que decide se o clique acerta. O grafo guarda a linha como o
        // editor a mostra; `vscode.Position` é 0-based. Sem o -1 o clique cai
        // uma linha adiante, e abrir o arquivo QUASE certo parece funcionar.
        const location = buildSourceLocation('face85.syn', 7, ROOT);

        assert.strictEqual(location.range.line, 6);
        assert.strictEqual(location.range.character, 0);
    });

    it('resolve o caminho relativo contra a raiz do workspace', () => {
        // O grafo grava relativo de propósito: absoluto vazaria a estrutura de
        // diretórios de quem exportou e não abriria na máquina de quem lê.
        const location = buildSourceLocation('face85.syn', 7, ROOT);

        assert.strictEqual(location.uri.fsPath, path.join(ROOT, 'face85.syn'));
    });

    it('resolve caminho aninhado', () => {
        const location = buildSourceLocation(path.join('dados', 'anotacoes.syn'), 12, ROOT);

        assert.strictEqual(location.uri.fsPath, path.join(ROOT, 'dados', 'anotacoes.syn'));
    });

    it('aceita caminho absoluto que cai DENTRO da raiz', () => {
        const absolute = path.join(ROOT, 'face85.syn');
        assert.strictEqual(buildSourceLocation(absolute, 7, ROOT).uri.fsPath, absolute);
    });

    it('recusa caminho absoluto sem raiz que o contenha', () => {
        // MUDANÇA (Etapa 5): antes, um absoluto era aceito sem workspace algum.
        // O caminho vem do grafo — dado não confiável, possivelmente gerado
        // noutra máquina — e abri-lo às cegas é o que a contenção evita.
        const absolute = path.join(ROOT, 'face85.syn');
        assert.strictEqual(buildSourceLocation(absolute, 7), undefined);
        assert.strictEqual(buildSourceLocation(absolute, 7, path.resolve(path.sep, 'outro')), undefined);
    });

    it('ancora no topo quando a linha falta ou é inválida', () => {
        // Abrir o arquivo no início é melhor que não oferecer link nenhum.
        assert.strictEqual(buildSourceLocation('face85.syn', undefined, ROOT).range.line, 0);
        assert.strictEqual(buildSourceLocation('face85.syn', 0, ROOT).range.line, 0);
        assert.strictEqual(buildSourceLocation('face85.syn', 'x', ROOT).range.line, 0);
    });

    it('não ancora sem arquivo', () => {
        // Grafo anterior à Etapa A. Uma âncora que não abre nada é pior que
        // nenhuma: promete verificação e entrega erro.
        assert.strictEqual(buildSourceLocation(undefined, 7, ROOT), undefined);
        assert.strictEqual(buildSourceLocation('', 7, ROOT), undefined);
    });

    it('não ancora caminho relativo sem workspace', () => {
        assert.strictEqual(buildSourceLocation('face85.syn', 7, undefined), undefined);
    });
});

describe('Âncora — rótulo', () => {
    const REGISTRO = {
        bibtex: 'avelar2016',
        year: '2016',
        citation: 'Salienta-se, ainda, que duas variáveis independentes se mostraram significativas.'
    };

    it('identifica pela referência, não pelo arquivo', () => {
        // `face85.syn:171` não diz de quem é o trecho. Numa resposta com 31
        // âncoras o arquivo é sempre o mesmo, e a linha não liga o botão a
        // citação nenhuma. O que identifica evidência em pesquisa é a
        // referência bibliográfica.
        const title = anchorTitle('face85.syn', 187, REGISTRO);

        assert.ok(title.startsWith('avelar2016 (2016)'));
    });

    it('mostra o início da citação para ligar o botão ao parágrafo', () => {
        // Com vários trechos da mesma fonte, só a referência não distingue.
        const title = anchorTitle('face85.syn', 187, REGISTRO);

        assert.ok(title.includes('Salienta-se'));
    });

    it('trunca a citação longa', () => {
        const title = anchorTitle('face85.syn', 187, REGISTRO);

        assert.ok(title.length < 90, `rótulo longo demais: ${title.length}`);
        assert.ok(title.includes('…'));
    });

    it('usa só a referência quando não há citação', () => {
        assert.strictEqual(
            anchorTitle('face85.syn', 7, { bibtex: 'avelar2016', year: '2016' }),
            'avelar2016 (2016)'
        );
    });

    it('cai para arquivo:linha quando não há referência nem trecho', () => {
        // Pior rótulo, mas melhor que botão sem texto.
        assert.strictEqual(anchorTitle('face85.syn', 7), 'face85.syn:7');
        assert.strictEqual(anchorTitle('face85.syn', 7, {}), 'face85.syn:7');
    });

    it('reduz caminho aninhado ao nome do arquivo no fallback', () => {
        assert.strictEqual(anchorTitle(path.join('dados', 'anotacoes.syn'), 12), 'anotacoes.syn:12');
    });

    it('omite a linha quando não há, no fallback', () => {
        assert.strictEqual(anchorTitle('face85.syn', undefined), 'face85.syn');
    });
});

describe('Âncora — extração das origens do payload', () => {
    it('lê os registros com origem do payload do MCP', () => {
        // Do payload cru, não do texto da resposta: reparsear a prosa do modelo
        // seria confiar justamente no que a âncora existe para verificar.
        const payload = JSON.stringify({
            records: [
                { citation: 'trecho', source_file: 'face85.syn', source_line: 7, bibtex: 'a2024' }
            ]
        });

        assert.strictEqual(extractOriginRecords([payload]).length, 1);
    });

    it('ignora registros sem origem', () => {
        const payload = JSON.stringify({ records: [{ citation: 'trecho', bibtex: 'a2024' }] });
        assert.deepStrictEqual(extractOriginRecords([payload]), []);
    });

    it('ignora payload que não é JSON', () => {
        // Recusa de acesso chega como texto cru; não pode derrubar a resposta.
        assert.deepStrictEqual(extractOriginRecords(['not authorized']), []);
        assert.deepStrictEqual(extractOriginRecords([undefined]), []);
    });

    it('aceita array puro além de {records}', () => {
        const payload = JSON.stringify([{ source_file: 'face85.syn', source_line: 3 }]);
        assert.strictEqual(extractOriginRecords([payload]).length, 1);
    });
});

describe('Âncora — emissão no stream', () => {
    function fakeStream() {
        const anchors = [];
        return { anchors, anchor: (loc, title) => anchors.push({ loc, title }) };
    }

    it('emite uma âncora por origem', () => {
        const stream = fakeStream();
        const groups = groupByOrigin([
            { source_file: 'face85.syn', source_line: 7, citation: 'a', bibtex: 'avelar2016', year: '2016' },
            { source_file: 'face85.syn', source_line: 15, citation: 'b', bibtex: 'correa2012', year: '2012' }
        ]);

        assert.strictEqual(streamSourceAnchors(stream, groups, ROOT), 2);
        // Rotuladas pela referência: é o que distingue duas âncoras do mesmo
        // arquivo, que é o caso normal num projeto de um `.syn` só.
        assert.deepStrictEqual(
            stream.anchors.map((a) => a.title),
            ['avelar2016 (2016): "a"', 'correa2012 (2012): "b"']
        );
    });

    it('NÃO repete a âncora do mesmo bloco ITEM', () => {
        // Um bloco com N chains gera N vértices Item, mesma origem. N links
        // idênticos é o ruído que o agrupamento da Etapa F evita.
        const stream = fakeStream();
        const records = [1, 2, 3, 4].map((n) => ({
            item_id: `x_n000${n}`,
            source_file: 'face85.syn',
            source_line: 7,
            citation: 'mesmo trecho'
        }));

        assert.strictEqual(streamSourceAnchors(stream, groupByOrigin(records), ROOT), 1);
    });

    it('pula origens que não dão para ancorar', () => {
        // Grafo antigo misturado com grafo novo: ancora o que dá, ignora o resto.
        const stream = fakeStream();
        const groups = groupByOrigin([
            { citation: 'sem origem' },
            { source_file: 'face85.syn', source_line: 7, citation: 'com origem' }
        ]);

        assert.strictEqual(streamSourceAnchors(stream, groups, ROOT), 1);
    });

    it('não emite nada quando não há origens', () => {
        const stream = fakeStream();

        assert.strictEqual(streamSourceAnchors(stream, [], ROOT), 0);
        assert.strictEqual(streamSourceAnchors(stream, undefined, ROOT), 0);
        assert.strictEqual(stream.anchors.length, 0);
    });
});

/**
 * Âncoras só da evidência efetivamente citada (Etapa 3).
 *
 * O fluxo anterior emitia uma âncora para CADA registro com origem devolvido no
 * turno, incluindo os resultados exploratórios que o modelo consultou e
 * descartou. Uma resposta podia terminar com dezenas de links sem indicar qual
 * sustentava qual frase — ruído com aparência de rigor.
 */
describe('Âncora — vínculo com a evidência usada', () => {
    const { originKey } = require('../../src/chat/sourceAnchor');

    const USADA = { file: 'face85.syn', line: 10, bibtex: 'avelar2016', citation: 'trecho usado' };
    const EXPLORATORIA = {
        file: 'face85.syn',
        line: 99,
        bibtex: 'outro2020',
        citation: 'trecho consultado e descartado'
    };

    function fake() {
        const anchors = [];
        return {
            anchors,
            stream: { anchor: (loc, title) => anchors.push(title) }
        };
    }

    it('emite só as origens que sustentam uma citação', () => {
        const f = fake();
        const cited = new Set([originKey('face85.syn', 10)]);

        streamSourceAnchors(f.stream, [USADA, EXPLORATORIA], '/w', { citedOnly: cited });

        assert.strictEqual(f.anchors.length, 1);
        assert.match(f.anchors[0], /avelar2016/);
    });

    it('sem citação conferida, oferece as origens consultadas', () => {
        // Degradação deliberada: melhor oferecer o que foi consultado do que
        // deixar o pesquisador sem nenhum caminho até o `.syn`.
        const f = fake();
        streamSourceAnchors(f.stream, [USADA, EXPLORATORIA], '/w', { citedOnly: new Set() });
        assert.strictEqual(f.anchors.length, 2);
    });

    it('mantém o comportamento antigo quando não recebe o conjunto', () => {
        const f = fake();
        streamSourceAnchors(f.stream, [USADA, EXPLORATORIA], '/w');
        assert.strictEqual(f.anchors.length, 2);
    });

    it('a chave de origem casa com a que o agrupamento produz', () => {
        // Se as duas formas divergirem, o filtro silenciosamente não casa nada.
        const { groupEvidence } = require('../../src/chat/evidence');
        const [grupo] = groupEvidence([
            { source_file: 'face85.syn', source_line: 10, citation: 'x', item_id: 'i1' }
        ]);
        assert.strictEqual(originKey(grupo.file, grupo.line), originKey('face85.syn', 10));
    });
});

/**
 * Contenção e multi-root na emissão (Etapa 5).
 *
 * O caminho vem do grafo, que é dado não confiável. Antes, ele era resolvido
 * contra a primeira pasta do workspace com `path.join` e sem verificação: um
 * `../../..` escapava, e num multi-root a âncora simplesmente não abria.
 */
describe('Âncora — contenção do caminho', () => {
    function fake() {
        const anchors = [];
        return { anchors, stream: { anchor: (loc, title) => anchors.push({ loc, title }) } };
    }

    const FORA = { file: path.join('..', '..', 'Windows', 'win.ini'), line: 1, bibtex: 'x' };
    const DENTRO = { file: 'face85.syn', line: 7, bibtex: 'avelar2016' };

    it('não emite âncora para caminho que escapa da raiz', () => {
        const f = fake();
        const emitted = streamSourceAnchors(f.stream, [FORA], ROOT);

        assert.strictEqual(emitted, 0);
        assert.strictEqual(f.anchors.length, 0);
    });

    it('emite as contidas e recusa as que escapam, no mesmo turno', () => {
        const f = fake();
        assert.strictEqual(streamSourceAnchors(f.stream, [DENTRO, FORA], ROOT), 1);
        assert.match(f.anchors[0].title, /avelar2016/);
    });

    it('reporta as origens recusadas em vez de silenciá-las', () => {
        // Um caminho fora da raiz costuma significar workspace errado ou grafo
        // de outra máquina — e nenhum dos dois se descobre pelo silêncio.
        const f = fake();
        let skipped;
        streamSourceAnchors(f.stream, [DENTRO, FORA], ROOT, {
            onSkipped: (groups) => {
                skipped = groups;
            }
        });

        assert.strictEqual(skipped.length, 1);
        assert.strictEqual(skipped[0].bibtex, 'x');
    });

    it('resolve contra qualquer raiz aberta — multi-root', () => {
        const OUTRO = path.resolve(path.sep, 'GitHub', 'outro');
        const f = fake();
        const emitted = streamSourceAnchors(f.stream, [{ file: 'notas.syn', line: 3 }], ROOT, {
            roots: [ROOT, OUTRO],
            preferredRoot: OUTRO
        });

        assert.strictEqual(emitted, 1);
        assert.strictEqual(f.anchors[0].loc.uri.fsPath, path.join(OUTRO, 'notas.syn'));
    });
});
