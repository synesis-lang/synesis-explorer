/**
 * abstractViewer.js - Webview para visualizacao de abstracts
 *
 * Proposito:
 *     Exibe o abstract BibTeX com trechos destacados.
 *     Lista excerpts com contexto (nota e chain).
 *
 * Componentes principais:
 *     - showAbstract: Fluxo principal de carregamento
 *     - highlightExcerpts: Insere marcacoes no abstract
 *
 * Dependencias criticas:
 *     - projectLoader: resolucao de bibliografia
 *     - bibtexParser: parsing de .bib
 *     - SynesisParser: parse de ITEMs
 */

const vscode = require('vscode');
const SynesisParser = require('../parsers/synesisParser');
const projectLoader = require('../core/projectLoader');
const bibtexParser = require('../parsers/bibtexParser');
const fuzzyMatcher = require('../utils/fuzzyMatcher');
const { buildItemCards } = require('./itemCardBuilder');

class AbstractViewer {
    constructor(workspaceScanner, templateManager, dataService) {
        this.scanner = workspaceScanner;
        this.templateManager = templateManager;
        this.dataService = dataService || null;
        this.parser = new SynesisParser();
        this.colors = [
            '#ffeb3b', '#ff9800', '#f44336', '#e91e63',
            '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
            '#00bcd4', '#009688'
        ];
    }

    async showAbstract() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const bibref = await this._findBibref(editor.document, editor.selection.active);
        if (!bibref) {
            vscode.window.showWarningMessage('No reference found. Position cursor inside a SOURCE or ITEM block.');
            return;
        }

        const projectUri = await this.scanner.findProjectFile();
        if (!projectUri) {
            vscode.window.showWarningMessage('No project file found. Create a .synp to enable abstracts.');
            return;
        }

        const project = await projectLoader.load(projectUri);
        if (!project.bibliographyPath) {
            vscode.window.showWarningMessage('Bibliography not found in project.');
            return;
        }

        const entries = await bibtexParser.parse(project.bibliographyPath);
        const entry = bibtexParser.findEntry(entries, bibref);
        if (!entry) {
            vscode.window.showErrorMessage(`Entry ${bibref} not found in bibliography.`);
            return;
        }

        const abstract = bibtexParser.getAbstract(entry);
        const extracted = await this._extractExcerpts(bibref, projectUri);
        const cards = extracted.cards;
        const display = extracted.display;
        const highlighted = abstract ? this.highlightExcerpts(abstract, cards) : '';
        const hasAbstract = Boolean(abstract);
        if (!hasAbstract) {
            vscode.window.showWarningMessage(`No abstract found for ${bibref}. Showing bibliographic info only.`);
        }

        const panel = vscode.window.createWebviewPanel(
            'synesisAbstract',
            `Abstract: ${bibref}`,
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );

        panel.webview.html = this.getHtmlContent(bibref, entry, highlighted, cards, hasAbstract, display);
    }

    highlightExcerpts(abstract, cards) {
        if (!abstract) {
            return '';
        }

        const matches = [];

        for (let index = 0; index < cards.length; index += 1) {
            const excerpt = cards[index].excerpt;
            if (!excerpt || !excerpt.value) {
                continue;
            }

            const match = fuzzyMatcher.findExcerpt(abstract, excerpt.value);
            if (!match) {
                continue;
            }

            matches.push({
                start: match.start,
                end: match.end,
                color: this.colors[index % this.colors.length]
            });
        }

        if (matches.length === 0) {
            return escapeHtml(abstract);
        }

        matches.sort((a, b) => a.start - b.start);

        let result = '';
        let cursor = 0;

        for (const match of matches) {
            if (match.start < cursor) {
                continue;
            }

            result += escapeHtml(abstract.slice(cursor, match.start));
            result += `<mark style="background-color: ${match.color};">`;
            result += escapeHtml(abstract.slice(match.start, match.end));
            result += '</mark>';
            cursor = match.end;
        }

        result += escapeHtml(abstract.slice(cursor));
        return result;
    }

    /**
     * Obtém os ITEMs de um bibref e monta um card por ITEM.
     *
     * Os dois caminhos (LSP e parser local) apenas NORMALIZAM seus dados; a
     * montagem é única, em itemCardBuilder. Antes, cada caminho tinha sua própria
     * cópia da lógica de montagem — divergir era questão de tempo.
     */
    async _extractExcerpts(bibref, projectUri) {
        const registry = await this.templateManager.loadTemplate(projectUri);

        // Try LSP first — eliminates all local I/O and regex parsing
        if (this.dataService) {
            try {
                const lspItems = await this.dataService.getExcerpts(bibref);
                if (lspItems && lspItems.length > 0) {
                    return this._buildResult(lspItems.map(normalizeLspItem), registry);
                }
            } catch (err) {
                console.warn('AbstractViewer._extractExcerpts: LSP getExcerpts failed, falling back to local:', err.message);
            }
        }

        // Fallback: local I/O + regex parsing (kept during transition)
        const localItems = await this._collectLocalItems(bibref, projectUri);
        return this._buildResult(localItems, registry);
    }

    _buildResult(normalizedItems, registry) {
        const { cards, display } = buildItemCards(normalizedItems, registry);
        return {
            cards,
            display: { ...display, relationSet: buildRelationSet(registry) }
        };
    }

    /**
     * Lê os .syn do workspace e devolve os ITEMs do bibref já normalizados.
     */
    async _collectLocalItems(bibref, projectUri) {
        const items = [];
        const synFiles = await this.scanner.findSynFiles(projectUri);

        for (const fileUri of synFiles) {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const parsed = this.parser.parseItems(content.toString(), fileUri.fsPath);

            for (const item of parsed) {
                if (item.bibref !== bibref) {
                    continue;
                }
                items.push(normalizeLocalItem(item, fileUri.fsPath));
            }
        }

        return items;
    }

    getHtmlContent(bibref, entry, abstractHtml, cards, hasAbstract, display) {
        const bibInfo = buildBibInfo(entry);

        // Um card por bloco ITEM. A cor indexa o ITEM, mantendo a correspondência
        // com o destaque no abstract.
        const cardsHtml = cards.map((card, index) => {
            const color = this.colors[index % this.colors.length];
            const excerptHtml = card.excerpt
                ? `<div class="card-excerpt">${escapeHtml(card.excerpt.value)}</div>`
                : '';

            const chainsHtml = card.chains.length > 0
                ? `<div class="card-section">
                     <div class="card-section-label">${card.chains.length === 1 ? 'Chain' : `Chains (${card.chains.length})`}</div>
                     ${card.chains.map(chain =>
                         `<div class="chain-line">${formatChain(chain, display.relationSet)}</div>`
                     ).join('')}
                   </div>`
                : '';

            const codesHtml = card.codes.length > 0
                ? `<div class="card-section">
                     <div class="card-section-label">Codes</div>
                     <div class="chain-line">${formatCodes(card.codes)}</div>
                   </div>`
                : '';

            const fieldsHtml = card.fields.length > 0
                ? `<div class="card-fields">
                     ${card.fields.map(field => renderField(field)).join('')}
                   </div>`
                : '';

            return `
        <div class="item-card">
          <div class="card-header">
            <span class="legend-color" style="background-color: ${color};"></span>
            <span class="card-title">ITEM ${index + 1}</span>
            ${card.line ? `<span class="card-location">line ${card.line}</span>` : ''}
          </div>
          ${excerptHtml}
          ${fieldsHtml}
          ${chainsHtml}
          ${codesHtml}
        </div>
      `;
        }).join('');

        const highlightedCount = cards.filter(card => card.excerpt && card.excerpt.value).length;
        const statsParts = [`<strong>${cards.length}</strong> ITEM${cards.length === 1 ? '' : 's'}`];
        if (display.chainCount > 0) {
            statsParts.push(`<strong>${display.chainCount}</strong> chain${display.chainCount === 1 ? '' : 's'}`);
        }
        if (hasAbstract) {
            statsParts.push(`<strong>${highlightedCount}</strong> excerpt${highlightedCount === 1 ? '' : 's'} in abstract`);
        }

        const bibInfoHtml = buildBibInfoHtml(bibInfo, bibref);
        const abstractSection = hasAbstract ? `
        <div class="abstract-container">
          <div class="abstract-text">
            ${abstractHtml}
          </div>
        </div>
        ` : '';

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Abstract: ${escapeHtml(bibref)}</title>
        <style>
          :root {
            --surface: var(--vscode-editorWidget-background);
            --surface-2: var(--vscode-editor-background);
            --border: var(--vscode-panel-border);
            --primary: var(--vscode-textLink-foreground);
            --primary-hover: var(--vscode-textLink-activeForeground);
            --text: var(--vscode-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --radius: 12px;
            --shadow: 0 4px 12px rgba(0,0,0,0.08);
            --transition: all 0.25s ease;
          }

          body {
            margin: 0;
            padding: 32px 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 15px;
            line-height: 1.7;
            background-color: var(--surface-2);
            color: var(--text);
          }

          .header, .abstract-container, .legend, .stats {
            margin-bottom: 24px;
            padding: 28px 32px;
            border-radius: var(--radius);
            background-color: var(--surface);
            border: 1px solid var(--border);
            box-shadow: var(--shadow);
            transition: var(--transition);
          }

          .header:hover, .abstract-container:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.12);
          }

          .header {
            padding: 32px 36px;
          }

          .doc-type {
            display: inline-block;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 4px 10px;
            border-radius: 20px;
            margin-bottom: 16px;
          }

          .bib-title {
            font-size: 22px;
            font-weight: 700;
            line-height: 1.35;
            margin-bottom: 16px;
            color: var(--text);
          }

          .bib-author-year {
            font-size: 15px;
            margin-bottom: 14px;
            color: var(--text-secondary);
            line-height: 1.5;
          }

          .bib-author {
            font-weight: 600;
          }

          .bib-year {
            font-weight: 600;
            margin-left: 6px;
          }

          .doi-line {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 18px;
            padding: 12px 14px 18px;
            border-bottom: 1px solid var(--border);
            background: var(--surface-2);
            border-radius: 10px;
            border: 1px solid var(--border);
          }

          .doi-line a {
            flex: 1;
            font-size: 13px;
            font-family: 'Consolas', 'Monaco', monospace;
            word-break: break-all;
          }

          .external-link {
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
            transition: var(--transition);
          }

          .external-link:hover {
            color: var(--primary-hover);
            text-decoration: underline;
          }

          .metadata-section {
            margin-top: 20px;
            padding: 18px 20px;
            border-radius: 10px;
            background: var(--surface-2);
            border: 1px solid var(--border);
          }

          .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
          }

          .metadata-item {
            font-size: 14px;
            line-height: 1.6;
          }

          .metadata-label {
            display: block;
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 4px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }

          .metadata-value {
            color: var(--text);
            font-weight: 500;
          }

          .abstract-text {
            text-align: justify;
            hyphens: auto;
            font-size: 15.5px;
            line-height: 1.75;
          }

          mark {
            font-weight: 500;
            border-radius: 4px;
            padding: 2px 5px;
            transition: var(--transition);
          }

          mark:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transform: translateY(-1px);
          }

          .legend h2 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 20px;
            color: var(--text);
          }

          .legend-item {
            padding: 16px 18px;
            margin-bottom: 14px;
            border-left: 4px solid #ccc;
            background: var(--surface-2);
            border-radius: 10px;
            border: 1px solid var(--border);
            transition: var(--transition);
          }

          .legend-item:hover {
            transform: translateX(4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }

          .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            margin-right: 12px;
            flex-shrink: 0;
            border: 1px solid rgba(0,0,0,0.1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }

          .legend-excerpt {
            font-weight: 600;
            font-size: 14.5px;
            line-height: 1.5;
          }

          .legend-description {
            margin-left: 32px;
            font-style: italic;
            color: var(--text-secondary);
            border-left: 3px solid var(--border);
            padding-left: 12px;
            margin-top: 8px;
            font-size: 13.5px;
            line-height: 1.6;
          }

          .note-line, .chain-line {
            margin-top: 4px;
          }

          .chain-line {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
          }

          .factor-chain {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-left: 6px;
          }

          .factor-tag {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 5px 12px;
            border-radius: 14px;
            font-size: 11.5px;
            font-weight: 600;
            transition: var(--transition);
          }

          .factor-tag:hover {
            transform: scale(1.05);
          }

          .factor-link {
            background: linear-gradient(135deg, #a8e6cf, #88d8b0);
            color: #2d5a45;
            padding: 5px 12px 5px 10px;
            font-size: 11px;
            font-weight: 700;
            clip-path: polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%);
            padding-right: 18px;
            transition: var(--transition);
          }

          .factor-link:hover {
            transform: translateX(3px);
          }

          .chain-empty {
            font-style: normal;
            background: var(--surface-2);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 2px 8px;
            color: var(--text-secondary);
          }

          .stats {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-secondary);
            padding: 16px 24px;
            text-align: center;
          }

          .stats strong {
            color: var(--primary);
            font-weight: 700;
            font-size: 15px;
          }

          /* ---- Card de ITEM: um card por bloco ITEM ---- */

          .item-card {
            padding: 18px 20px;
            margin-bottom: 16px;
            background: var(--surface-2);
            border: 1px solid var(--border);
            border-radius: 10px;
            transition: var(--transition);
          }

          .item-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }

          .card-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
          }

          .card-title {
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--text-secondary);
          }

          .card-location {
            font-size: 11.5px;
            color: var(--text-secondary);
            font-family: 'Consolas', 'Monaco', monospace;
            margin-left: auto;
          }

          .card-excerpt {
            font-size: 15px;
            line-height: 1.65;
            padding: 12px 14px;
            margin-bottom: 14px;
            background: var(--surface);
            border-left: 3px solid var(--primary);
            border-radius: 6px;
          }

          .card-fields {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 10px 18px;
            margin-bottom: 14px;
          }

          .card-field {
            font-size: 13.5px;
            line-height: 1.5;
          }

          .card-field-label {
            display: block;
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: var(--text-secondary);
            margin-bottom: 3px;
          }

          .card-field-value {
            color: var(--text);
          }

          /* Campos longos (MEMO/TEXT) ocupam a linha inteira do grid */
          .card-field.is-long {
            grid-column: 1 / -1;
          }

          .card-field.is-long .card-field-value {
            font-style: italic;
            color: var(--text-secondary);
          }

          .card-section {
            margin-top: 12px;
          }

          .card-section-label {
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: var(--text-secondary);
            margin-bottom: 6px;
          }

          .card-section .chain-line {
            margin-bottom: 6px;
          }

          .value-badge {
            display: inline-block;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2px 9px;
            font-size: 12.5px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${bibInfoHtml}
        </div>
        ${abstractSection}
        <div class="legend">
          <h2>Annotations</h2>
          ${cardsHtml || '<p class="chain-empty">No ITEM blocks found for this reference.</p>'}
        </div>
        <div class="stats">
          ${statsParts.join(' &middot; ')}
        </div>
      </body>
      </html>
    `;
    }
    async _findBibref(document, position) {
        const offset = document.offsetAt(position);
        const file = document.uri.fsPath;

        // Tenta via LSP (sem regex de gramática)
        if (this.dataService) {
            try {
                const blocks = await this.dataService.getBlocks(file);
                if (blocks && blocks.length > 0) {
                    return _bibrefFromBlocks(blocks, document, offset);
                }
            } catch (err) {
                console.warn('AbstractViewer._findBibref: LSP getBlocks failed, falling back to local parser:', err.message);
            }
        }

        // Fallback: parser local (transitório — removido quando getBlocks estiver estável)
        const text = document.getText();
        const items = this.parser.parseItems(text, file);
        const item = items.find(block => offset >= block.startOffset && offset <= block.endOffset);
        if (item) {
            return item.bibref;
        }

        const sources = this.parser.parseSourceBlocks(text, file);
        let last = null;
        for (const source of sources) {
            if (source.startOffset <= offset) {
                last = source.bibref;
            }
        }
        return last;
    }
}

function normalizeExcerpt(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

/**
 * Converte um item do synesis/getExcerpts no formato NormalizedItem.
 * Nomes de campo em minúsculas para lookup insensível a caixa.
 */
function normalizeLspItem(item) {
    const fields = {};
    for (const [key, value] of Object.entries(item.extra_fields || {})) {
        fields[String(key).toLowerCase()] = value;
    }

    return {
        fields,
        codes: Array.isArray(item.codes) ? item.codes : [],
        chains: Array.isArray(item.chains) ? item.chains : [],
        line: item.line || 0,
        file: item.file || ''
    };
}

/**
 * Converte um item do parser local (fallback) no formato NormalizedItem.
 * O parser local não separa codes/chains do resto — vêm todos em `fields`.
 */
function normalizeLocalItem(item, filePath) {
    const fields = {};
    for (const [key, value] of Object.entries(item.fields || {})) {
        fields[String(key).toLowerCase()] = value;
    }

    return {
        fields,
        codes: [],
        chains: [],
        line: item.line || 0,
        file: filePath || ''
    };
}

function formatChain(chainText, relationSet) {
    const cleaned = normalizeExcerpt(chainText || '');
    if (!cleaned) {
        return '<span class="chain-empty">No chain</span>';
    }

    const tokens = cleaned
        .split('->')
        .map(token => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        return '<span class="chain-empty">No chain</span>';
    }

    const html = tokens.map(token => {
        const cssClass = isRelationToken(token, relationSet) ? 'factor-link' : 'factor-tag';
        return `<span class="${cssClass}">${escapeHtml(token)}</span>`;
    }).join('');

    return `<span class="factor-chain">${html}</span>`;
}

/**
 * Renderiza um campo genérico do card.
 *
 * Tipos com valor discreto (ENUMERATED/ORDERED/SCALE) viram badge; texto longo
 * ocupa a linha inteira do grid. É o que faz ENUMERATED e SCALE aparecerem — a
 * versão anterior filtrava por 4 tipos e descartava todos os demais.
 */
function renderField(field) {
    const isBadgeType = ['ENUMERATED', 'ORDERED', 'SCALE', 'BOOLEAN'].includes(field.type);
    const joined = field.values.join(' · ');
    const isLong = !isBadgeType && joined.length > 90;

    const valueHtml = isBadgeType
        ? field.values.map(v => `<span class="value-badge">${escapeHtml(v)}</span>`).join(' ')
        : escapeHtml(joined);

    const title = field.description ? ` title="${escapeHtml(field.description)}"` : '';

    return `
      <div class="card-field${isLong ? ' is-long' : ''}"${title}>
        <span class="card-field-label">${escapeHtml(field.label)}</span>
        <span class="card-field-value">${valueHtml}</span>
      </div>`;
}

function formatCodes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) {
        return '<span class="chain-empty">No codes</span>';
    }

    const html = codes.map(code => {
        return `<span class="factor-tag">${escapeHtml(code)}</span>`;
    }).join('');

    return `<span class="factor-chain">${html}</span>`;
}

/**
 * Constrói o conjunto de relações CHAIN declaradas no template do projeto.
 *
 * Substitui uma lista fixa de nomes que pertencia a outro projeto: no face85 ela
 * acertava 2 das 11 relações declaradas, e as 9 restantes eram renderizadas como
 * conceito — indistinguíveis, na tela, dos termos que elas ligam. O README diz
 * que nada é hardcoded; esta view, cuja função é justamente explicar o template,
 * era a violação literal desse princípio.
 *
 * @param {Object} registry - Field registry (templateManager.buildFieldRegistry)
 * @returns {Set<string>} Nomes de relação em caixa alta
 */
function buildRelationSet(registry) {
    const relations = new Set();

    for (const def of Object.values(registry || {})) {
        if (!def || def.type !== 'CHAIN' || !def.relations) {
            continue;
        }

        // O LSP envia list[str]; o parser local pode enviar {nome: descrição}.
        const names = Array.isArray(def.relations)
            ? def.relations
            : Object.keys(def.relations);

        for (const name of names) {
            const normalized = String(name).trim().toUpperCase();
            if (normalized) {
                relations.add(normalized);
            }
        }
    }

    return relations;
}

/**
 * Decide se um token de chain é uma relação.
 *
 * Com o conjunto do template, a decisão é exata. Sem ele (template sem RELATIONS
 * declaradas, ou LSP antigo que não envia o campo), cai numa heurística
 * estrutural — nunca numa lista de nomes, que só voltaria a dessincronizar.
 *
 * @param {string} token
 * @param {Set<string>|null} relationSet
 * @returns {boolean}
 */
function isRelationToken(token, relationSet) {
    const normalized = String(token || '').trim().toUpperCase();
    if (!normalized) {
        return false;
    }

    if (relationSet && relationSet.size > 0) {
        return relationSet.has(normalized);
    }

    // Heurística de fallback: relações são escritas em CAIXA_ALTA sem espaços.
    return /^[A-Z][A-Z0-9_-]*$/.test(normalized) && normalized === String(token).trim();
}



function buildBibInfo(entry) {
    const tags = entry?.entryTags || {};
    return {
        type: entry?.entryType || '',
        title: sanitizeBibValue(tags.title),
        author: sanitizeBibValue(tags.author),
        year: sanitizeBibValue(tags.year),
        journal: sanitizeBibValue(tags.journal),
        booktitle: sanitizeBibValue(tags.booktitle),
        publisher: sanitizeBibValue(tags.publisher),
        doi: sanitizeBibValue(tags.doi),
        url: sanitizeBibValue(tags.url)
    };
}

function buildBibInfoHtml(info, bibref) {
    const items = [];

    if (info.type) {
        items.push(`<div class="doc-type">${escapeHtml(info.type.toUpperCase())}</div>`);
    }

    if (info.title) {
        items.push(`<div class="bib-title">${escapeHtml(info.title)}</div>`);
    }

    const authorYearParts = [];
    if (info.author) {
        authorYearParts.push(`<span class="bib-author">${escapeHtml(info.author)}</span>`);
    }
    if (info.year) {
        authorYearParts.push(`<span class="bib-year">(${escapeHtml(info.year)})</span>`);
    }
    if (authorYearParts.length > 0) {
        items.push(`<div class="bib-author-year">${authorYearParts.join(' ')}</div>`);
    }

    const venue = [info.journal, info.booktitle, info.publisher].filter(Boolean).join(' · ');
    if (venue) {
        items.push(`<div class="bib-author-year">${escapeHtml(venue)}</div>`);
    }

    const link = info.doi
        ? (info.doi.startsWith('http') ? info.doi : `https://doi.org/${info.doi}`)
        : info.url;

    if (link) {
        items.push(`
          <div class="doi-line">
            <a href="${escapeHtml(link)}" class="external-link">${escapeHtml(link)}</a>
          </div>
        `);
    }

    const metadataItems = [
        `<div class="metadata-item">
          <span class="metadata-label">Reference</span>
          <span class="metadata-value">${escapeHtml(bibref)}</span>
        </div>`
    ];

    items.push(`
      <div class="metadata-section">
        <div class="metadata-grid">
          ${metadataItems.join('\n')}
        </div>
      </div>
    `);

    return items.join('\n');
}

function sanitizeBibValue(value) {
    if (!value) {
        return '';
    }

    return String(value)
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}


function escapeHtml(text) {
    if (!text) {
        return '';
    }

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Resolve bibref a partir de blocos LSP e posição do cursor.
 * Espelha a lógica de coderService._detectBibref mas sobre ranges LSP.
 *
 * @param {Array<{kind,bibref,range}>} blocks
 * @param {vscode.TextDocument} document
 * @param {number} cursorOffset
 * @returns {string|null}
 */
function _bibrefFromBlocks(blocks, document, cursorOffset) {
    let lastBefore = null;

    for (const block of blocks) {
        const startOffset = document.offsetAt(
            new vscode.Position(block.range.start.line, block.range.start.character)
        );
        const endOffset = document.offsetAt(
            new vscode.Position(block.range.end.line, block.range.end.character)
        );

        if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
            return block.bibref || null;
        }

        if (startOffset <= cursorOffset) {
            lastBefore = block.bibref || null;
        }
    }

    return lastBefore;
}

module.exports = AbstractViewer;

// Expostos para teste unitário. A classe continua sendo o export default —
// requerer `vscode` inviabiliza testar a formatação de chain isoladamente.
module.exports.buildRelationSet = buildRelationSet;
module.exports.isRelationToken = isRelationToken;
module.exports.formatChain = formatChain;
