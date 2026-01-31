/**
 * graphViewer.js - Webview para visualizacao de grafos de CHAIN
 *
 * Proposito:
 *     Exibe um grafo Mermaid com relacoes de CHAIN para uma referencia.
 *     Usa DataService para obter mermaidCode (LSP ou regex local).
 *
 * Componentes principais:
 *     - showGraph: Fluxo principal de exibicao
 *     - showGraphPanel: Renderiza webview com Mermaid.js
 *
 * Dependencias criticas:
 *     - DataService: Adapter LSP/local para mermaidCode
 *     - SynesisParser: apenas para _findBibref (identifica bibref sob cursor)
 */

const vscode = require('vscode');
const SynesisParser = require('../parsers/synesisParser');

class GraphViewer {
    constructor(dataService) {
        this.dataService = dataService;
        this.parser = new SynesisParser();
        this.panel = null;
    }

    async showGraph() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const bibref = this._findBibref(editor.document, editor.selection.active);
        if (!bibref) {
            vscode.window.showWarningMessage('No reference found. Position cursor inside a SOURCE or ITEM block.');
            return;
        }

        const result = await this.dataService.getRelationGraph(bibref);
        if (!result || !result.mermaidCode) {
            vscode.window.showWarningMessage(`No chain relations found for ${bibref}.`);
            return;
        }

        this.showGraphPanel(bibref, result.mermaidCode);
    }

    showGraphPanel(reference, mermaidCode) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'graphViewer',
                `Graph: ${reference}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.title = `Graph: ${reference}`;
        this.panel.webview.html = this.getWebviewContent(reference, mermaidCode);
    }

    getWebviewContent(reference, mermaidCode) {
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Graph: ${escapeHtml(reference)}</title>
    <link href="https://rsms.me/inter/inter.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        :root {
            --bg: #f8fafc;
            --surface: #ffffff;
            --surface-2: #f1f5f9;
            --border: #e2e8f0;
            --primary: #3b82f6;
            --primary-light: #dbeafe;
            --success: #16a34a;
            --danger: #dc2626;
            --text: #0f172a;
            --text-muted: #64748b;
            --radius: 12px;
            --shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .header {
            padding: 12px 24px;
            background: white;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .header-left h1 {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
            color: var(--text);
        }

        .header-left p {
            margin: 2px 0 0 0;
            font-size: 12px;
            font-weight: 400;
            color: var(--text-muted);
        }

        .zoom-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .zoom-btn {
            background: var(--surface);
            border: 1px solid var(--border);
            color: var(--text);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .zoom-btn:hover {
            background: var(--primary-light);
            border-color: var(--primary);
            color: var(--primary);
        }

        .zoom-btn:active {
            transform: scale(0.95);
        }

        .zoom-level {
            font-size: 12px;
            color: var(--text-muted);
            min-width: 50px;
            text-align: center;
            font-weight: 500;
        }

        .graph-container {
            flex: 1;
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            padding: 16px;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        .mermaid-wrapper {
            width: 100%;
            height: 100%;
            overflow: auto;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: white;
            border-radius: var(--radius);
            box-shadow: var(--shadow);
        }

        .mermaid {
            padding: 20px;
            transform-origin: center center;
            transition: transform 0.3s ease;
            min-width: min-content;
        }

        .mermaid svg {
            display: block;
            max-width: none !important;
            height: auto !important;
        }

        .error {
            color: var(--danger);
            padding: 20px;
            text-align: center;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <h1>Graph Viewer</h1>
            <p>Reference: <strong>${escapeHtml(reference)}</strong></p>
        </div>
        <div class="zoom-controls">
            <button class="zoom-btn" onclick="zoomOut()" title="Zoom out">
                <span>-</span>
            </button>
            <span class="zoom-level" id="zoomLevel">100%</span>
            <button class="zoom-btn" onclick="zoomIn()" title="Zoom in">
                <span>+</span>
            </button>
            <button class="zoom-btn" onclick="resetZoom()" title="Reset zoom">
                <span>Reset</span>
            </button>
        </div>
    </div>

    <div class="graph-container">
        <div class="mermaid-wrapper" id="mermaidWrapper">
            <div class="mermaid" id="mermaidContent">
${mermaidCode}
            </div>
        </div>
    </div>

    <script>
        let currentZoom = 1.0;
        const zoomStep = 0.15;
        const minZoom = 0.25;
        const maxZoom = 3.0;

        function updateZoom(newZoom) {
            currentZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
            const mermaidContent = document.getElementById('mermaidContent');
            mermaidContent.style.transform = 'scale(' + currentZoom + ')';
            document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
        }

        function zoomIn() {
            updateZoom(currentZoom + zoomStep);
        }

        function zoomOut() {
            updateZoom(currentZoom - zoomStep);
        }

        function resetZoom() {
            updateZoom(1.0);
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    resetZoom();
                }
            }
        });

        document.getElementById('mermaidWrapper').addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
                updateZoom(currentZoom + delta);
            }
        }, { passive: false });

        mermaid.initialize({
            startOnLoad: true,
            theme: 'base',
            themeVariables: {
                fontFamily: 'Inter, system-ui',
                fontSize: '14px'
            },
            flowchart: {
                useMaxWidth: false,
                htmlLabels: true,
                curve: 'cardinal'
            }
        });

        setTimeout(() => {
            const wrapper = document.getElementById('mermaidWrapper');
            const content = document.getElementById('mermaidContent');
            const svg = content.querySelector('svg');

            if (svg && wrapper) {
                const wrapperWidth = wrapper.clientWidth - 40;
                const wrapperHeight = wrapper.clientHeight - 40;
                const svgWidth = svg.getBBox().width;
                const svgHeight = svg.getBBox().height;

                const scaleX = wrapperWidth / svgWidth;
                const scaleY = wrapperHeight / svgHeight;
                const initialScale = Math.min(scaleX, scaleY, 1.0);

                if (initialScale < 1.0) {
                    updateZoom(initialScale);
                }
            }
        }, 100);
    </script>
</body>
</html>`;
    }

    _findBibref(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const filePath = document.uri.fsPath;

        const items = this.parser.parseItems(text, filePath);
        const item = items.find(block => offset >= block.startOffset && offset <= block.endOffset);
        if (item) {
            return item.bibref;
        }

        const sources = this.parser.parseSourceBlocks(text, filePath);
        let last = null;

        for (const source of sources) {
            if (source.startOffset <= offset) {
                last = source.bibref;
            }
        }

        return last;
    }
}

function escapeHtml(value) {
    if (!value) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = GraphViewer;
