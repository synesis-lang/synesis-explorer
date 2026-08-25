/**
 * textNormalize.js — normalização para comparação literal de citações.
 *
 * Extraído de `citationGuard.js` na Etapa 3, quando o guarda, o parser de
 * evidência e as âncoras passaram a compartilhar a mesma leitura do payload.
 * Dois normalizadores divergentes fariam a mesma citação conferir num caminho e
 * falhar no outro — o tipo de inconsistência que produz falso alarme
 * intermitente, o defeito mais caro deste subsistema.
 *
 * Sem isto, `includes()` cru falha em texto que está correto. Modelos reescrevem
 * aspas tipográficas (`"` `"` `'`) como retas, colapsam quebras de linha em
 * espaço, e o payload JSON traz `\n` escapado onde a resposta traz espaço. Nada
 * disso muda o conteúdo da citação — mas quebra a comparação literal, e um falso
 * alarme corrói a confiança no aviso tanto quanto um alarme perdido.
 *
 * Deliberadamente NÃO removemos pontuação nem acento: são significativos, e
 * afrouxar demais faria o guarda aprovar citação adulterada.
 */
function normalizeForComparison(text) {
    return String(text || '')
        // Aspas e apóstrofos tipográficos → retas.
        .replace(/[‘’‚‛′]/g, "'")
        .replace(/[“”„‟″]/g, '"')
        // Travessões e hífens longos → hífen simples.
        .replace(/[‐-―]/g, '-')
        // Reticências tipográficas → três pontos.
        .replace(/…/g, '...')
        // Escapes de LaTeX herdados do texto original (`43,08\%`, `R\$`, `50\&`).
        // O `.syn` os carrega porque o abstract veio de fonte em LaTeX; o modelo,
        // ao citar em prosa, escreve o caractere limpo — e a comparação literal
        // falhava por causa de uma barra que NÃO é conteúdo. Terceiro falso
        // alarme observado ao vivo (2026-08-24), em `43,08\% da variação`.
        //
        // `\\+` e não `\\`: a barra chega DUPLICADA no payload JSON do MCP
        // (verificado byte a byte contra o face85), porque a barra do `.syn` é
        // ela própria escapada na serialização. Tratar só uma deixaria a outra.
        .replace(/\\+([%$&#_{}])/g, '$1')
        // Espaços não-quebráveis → espaço comum. Escritos como escape de
        // propósito: literais aqui seriam invisíveis na revisão, e o lint os
        // recusa com razão (no-irregular-whitespace).
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

module.exports = { normalizeForComparison };
