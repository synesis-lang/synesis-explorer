/**
 * pathContainment.js — contenção de caminhos à raiz do workspace.
 *
 * **Por que existe.** As âncoras resolvem um caminho que veio do GRAFO, e o
 * grafo é dado não confiável: pode ter sido gerado por outra máquina,
 * compartilhado entre pesquisadores, ou servido por um ArcadeDB remoto. Um
 * `source_file` com `../../../` escaparia da raiz e abriria um arquivo qualquer
 * do disco; um caminho absoluto abriria o que ele apontasse.
 *
 * A regra é simples e vale para os dois casos: **o destino precisa estar dentro
 * de uma pasta aberta do workspace**, ou não há âncora.
 *
 * **Por que não reaproveitar `executableGuard.isWithin()`.** O sentido lá é o
 * INVERSO: um executável dentro do workspace é perigoso (um `.exe` embutido num
 * ZIP de projeto), e a função existe para recusá-lo. Aqui, estar dentro é a
 * única condição aceitável. Compartilhar a primitiva geométrica sem compartilhar
 * a política é o que este módulo faz — a comparação de caminho é a mesma, a
 * decisão é oposta.
 */

const path = require('path');

/**
 * `child` está dentro de `parent`?
 *
 * `path.relative` em vez de comparação de prefixo: `/proj-evil` começa com
 * `/proj` como string, mas não está dentro dele. E `path.resolve` antes, para
 * que `..` seja resolvido em vez de comparado literalmente — sem isso,
 * `raiz/../../etc/passwd` passaria por um teste de prefixo.
 *
 * A própria raiz conta como contida: um `source_file` que aponta para a pasta
 * não é âncora útil, mas também não é escape, e recusá-lo aqui misturaria duas
 * decisões.
 */
function isWithin(child, parent) {
    if (!child || !parent) {
        return false;
    }
    const from = path.resolve(parent);
    const to = path.resolve(child);
    if (from === to) {
        return true;
    }
    const rel = path.relative(from, to);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve um caminho vindo do grafo contra as raízes abertas.
 *
 * Devolve o caminho absoluto quando ele é seguro, `undefined` quando não é.
 *
 * A ordem das raízes importa em workspace multi-root: `preferredRoot` (a pasta
 * do editor ativo) é tentada primeiro. Antes, a primeira pasta do workspace era
 * a única tentada, e num multi-root a âncora simplesmente não abria — sem dizer
 * por quê.
 *
 * **Caminho absoluto é aceito só se cair dentro de uma raiz.** Um grafo exportado
 * na máquina de outro pesquisador traz caminhos absolutos que não existem aqui;
 * abri-los às cegas é o que a contenção evita.
 */
function resolveWithinRoots(sourceFile, roots, preferredRoot) {
    if (!sourceFile || typeof sourceFile !== 'string') {
        return undefined;
    }

    const ordered = orderedRoots(roots, preferredRoot);
    if (ordered.length === 0) {
        return undefined;
    }

    if (path.isAbsolute(sourceFile)) {
        const absolute = path.resolve(sourceFile);
        return ordered.some((root) => isWithin(absolute, root)) ? absolute : undefined;
    }

    for (const root of ordered) {
        const candidate = path.resolve(root, sourceFile);
        // A contenção é verificada DEPOIS de juntar: é o `..` embutido no
        // relativo que precisa ser barrado, e ele só aparece ao resolver.
        if (isWithin(candidate, root)) {
            return candidate;
        }
    }
    return undefined;
}

/** As raízes, com a preferida à frente e sem repetição. */
function orderedRoots(roots, preferredRoot) {
    const list = (roots || []).filter(Boolean).map((root) => String(root));
    if (!preferredRoot) {
        return list;
    }
    const preferred = String(preferredRoot);
    return [preferred, ...list.filter((root) => path.resolve(root) !== path.resolve(preferred))];
}

module.exports = { isWithin, resolveWithinRoots, orderedRoots };
