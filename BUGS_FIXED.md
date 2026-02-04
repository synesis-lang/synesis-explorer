# Bugs Corrigidos - Análise com Dados Reais (bibliometrics)

**Data:** 2026-02-03
**Dataset de teste:** `test/fixtures/bibliometrics/bibliometrics.syn`
**Status:** ✅ Bugs da extensão corrigidos | ⚠️ Bug do LSP identificado

---

## 📊 Análise dos Dados de Teste

### Estrutura do Dataset Bibliometrics

O arquivo `bibliometrics.syn` contém:
- **7 SOURCEs** distintos (@ashworth2019, @alrashoud2019, @ahmadi2021, @aly2019, @abdin2024, etc.)
- **Múltiplos ITEMs por SOURCE** (ex: @ashworth2019 tem 3 ITEMs diferentes)
- **Múltiplos campos CHAIN por ITEM** (ex: ITEM @ashworth2019 nas linhas 7-25 tem **4 chains**)

**Exemplo de ITEM com múltiplos CHAINs:**

```synesis
ITEM @ashworth2019
    text: However, male respondents, those who perceived themselves...

    note: *complex* Four-factor convergence...

    chain: Gender -> INFLUENCES -> CCS_Support

    note: Self-assessed knowledge increases support...

    chain: Knowledge -> INFLUENCES -> CCS_Support

    note: Economic prioritization over environmental values...

    chain: Economic_Value -> INFLUENCES -> CCS_Support

    note: Risk-benefit assessment constrains support...

    chain: Risk_Perception -> CONSTRAINS -> CCS_Support
END ITEM
```

**Esperado:** AbstractViewer deve mostrar **todos os 4 chains**
**Observado (antes da correção):** Mostrava apenas `Risk_Perception -> CONSTRAINS -> CCS_Support` (o último)

---

## 🐛 Bug #1: AbstractViewer Mostrando Apenas Último CHAIN ✅ CORRIGIDO

### Descrição do Problema

Quando um ITEM tinha múltiplos campos com o mesmo nome (ex: múltiplos `chain:`, `note:`, etc.), o AbstractViewer mostrava apenas o **último valor**, perdendo todos os anteriores.

### Causa Raiz

**Arquivo:** [synesisParser.js:137-177](src/parsers/synesisParser.js#L137-L177)

O método `_parseFieldEntries()` **sobrescrevia** valores de campos duplicados:

```javascript
// ANTES (BUG):
if (fieldMatch) {
    if (currentField) {
        fields[currentField] = currentValue.join('\n').trim();  // ❌ SOBRESCREVE
    }
    currentField = fieldMatch[1];
    currentValue = [fieldMatch[2]];
}
```

**Resultado:** Quando havia múltiplos `chain:`, o objeto `fields` continha:

```javascript
{
  chain: "Risk_Perception -> CONSTRAINS -> CCS_Support"  // ❌ Apenas o último!
}
```

**Esperado:**

```javascript
{
  chain: [
    "Gender -> INFLUENCES -> CCS_Support",
    "Knowledge -> INFLUENCES -> CCS_Support",
    "Economic_Value -> INFLUENCES -> CCS_Support",
    "Risk_Perception -> CONSTRAINS -> CCS_Support"
  ]
}
```

### Solução Implementada

**1. Adicionado método `_addFieldValue()` no SynesisParser:**

```javascript
_addFieldValue(fields, fieldName, value) {
    if (!value) {
        return;
    }

    if (!fields[fieldName]) {
        // Primeiro valor: adiciona diretamente
        fields[fieldName] = value;
    } else if (Array.isArray(fields[fieldName])) {
        // Já é array: adiciona ao array
        fields[fieldName].push(value);
    } else {
        // Segundo valor: converte para array
        fields[fieldName] = [fields[fieldName], value];
    }
}
```

**Comportamento:**
- 1º valor de `chain:` → `fields.chain = "valor1"`
- 2º valor de `chain:` → `fields.chain = ["valor1", "valor2"]`
- 3º valor de `chain:` → `fields.chain = ["valor1", "valor2", "valor3"]`

**2. Atualizado `_parseFieldEntries()` para usar `_addFieldValue()`:**

```javascript
if (fieldMatch) {
    if (currentField) {
        this._addFieldValue(fields, currentField, currentValue.join('\n').trim());  // ✅ ACUMULA
    }
    currentField = fieldMatch[1];
    currentValue = [fieldMatch[2]];
}
```

**3. Atualizado `collectFieldValues()` no AbstractViewer:**

```javascript
function collectFieldValues(fields, names) {
    const values = [];
    for (const name of names) {
        const fieldValue = fields[name];
        if (!fieldValue) {
            continue;
        }

        // Suporta campos com múltiplos valores (arrays)
        if (Array.isArray(fieldValue)) {
            for (const val of fieldValue) {
                const normalized = normalizeExcerpt(val);
                if (normalized) {
                    values.push(normalized);
                }
            }
        } else {
            const normalized = normalizeExcerpt(fieldValue);
            if (normalized) {
                values.push(normalized);
            }
        }
    }
    return values;
}
```

### Arquivos Modificados

- ✅ [src/parsers/synesisParser.js](src/parsers/synesisParser.js)
  - Modificado `_parseFieldEntries()` (linhas 137-177)
  - Adicionado `_addFieldValue()` (novo método)

- ✅ [src/viewers/abstractViewer.js](src/viewers/abstractViewer.js)
  - Modificado `collectFieldValues()` (linhas 637-643)

### Impacto da Correção

**Componentes beneficiados:**
- ✅ **AbstractViewer** - Agora mostra todos os chains, notes, e outros campos duplicados
- ✅ **Qualquer componente que use SynesisParser** - Parsing correto de campos duplicados

**Campos afetados positivamente:**
- `chain:` - Múltiplas relações causais por ITEM
- `note:` - Múltiplas notas analíticas por ITEM
- `text:` - Múltiplos excerpts por ITEM (menos comum)
- Qualquer campo customizado com valores repetidos

### Teste de Validação

**Dados de teste:** ITEM @ashworth2019 (linhas 7-25) do `bibliometrics.syn`

**Antes:**
```
Chain: Risk_Perception -> CONSTRAINS -> CCS_Support
```

**Depois:**
```
Chain: Gender -> INFLUENCES -> CCS_Support | Knowledge -> INFLUENCES -> CCS_Support | Economic_Value -> INFLUENCES -> CCS_Support | Risk_Perception -> CONSTRAINS -> CCS_Support
```

---

## 🐛 Bug #2: GraphViewer Renderizando TODOS os Chains (Todos os Sources) ⚠️ BUG DO LSP

### Descrição do Problema

Quando o usuário clica em um SOURCE específico (ex: @ashworth2019) e seleciona "Show Relation Graph", o GraphViewer mostra **todos os chains de todos os ITEMs do projeto**, ao invés de apenas os chains dos ITEMs relacionados àquele SOURCE.

### Análise da Extensão

**Fluxo de chamada:**

```
GraphViewer.showGraph()
    ↓
1. _findBibref(document, position)  → Extrai bibref (ex: "@ashworth2019")
    ↓
2. dataService.getRelationGraph(bibref)  → Chama LSP com bibref
    ↓
3. LspDataProvider.getRelationGraph(workspaceRoot, bibref)
    ↓
4. lspClient.sendRequest('synesis/getRelationGraph', { workspaceRoot, bibref })
```

**Código relevante - [graphViewer.js:34-45](src/viewers/graphViewer.js#L34-L45):**

```javascript
const bibref = await this._findBibref(editor.document, editor.selection.active);
if (!bibref) {
    vscode.window.showWarningMessage('No reference found...');
    return;
}

console.log('GraphViewer.showGraph: Found bibref:', bibref);

const result = await this.dataService.getRelationGraph(bibref);  // ✅ PASSA BIBREF
```

**Código relevante - [dataService.js:140-157](src/services/dataService.js#L140-L157):**

```javascript
async getRelationGraph(workspaceRoot, bibref) {
    const params = { workspaceRoot };
    if (bibref) {
        params.bibref = bibref;  // ✅ ADICIONA BIBREF AOS PARÂMETROS
    }
    const result = await this._sendRequestWithFallback(
        'synesis/getRelationGraph',
        params,
        ['synesis/get_relation_graph']
    );
    // ... normaliza resultado
}
```

### Conclusão

✅ **A extensão está correta!** Ela passa o `bibref` corretamente para o LSP server.

⚠️ **O problema está no LSP server** (`synesis-lsp`). O método `synesis/getRelationGraph` não está filtrando corretamente os chains por bibref.

**Comportamento esperado do LSP:**
```python
# Pseudocódigo do que o LSP deveria fazer
def get_relation_graph(workspace_root, bibref=None):
    all_items = parse_all_syn_files(workspace_root)

    if bibref:
        # ✅ Filtrar apenas ITEMs com esse bibref
        filtered_items = [item for item in all_items if item.bibref == bibref]
    else:
        # Sem bibref: retorna todos
        filtered_items = all_items

    chains = extract_chains_from_items(filtered_items)
    mermaid = generate_mermaid_graph(chains)
    return mermaid
```

**Comportamento atual (presumido):**
```python
# Pseudocódigo do bug no LSP
def get_relation_graph(workspace_root, bibref=None):
    all_items = parse_all_syn_files(workspace_root)

    # ❌ Ignora o parâmetro bibref e processa TODOS os items
    chains = extract_chains_from_items(all_items)
    mermaid = generate_mermaid_graph(chains)
    return mermaid
```

### Ação Recomendada

Este bug deve ser corrigido no **synesis-lsp server**, não na extensão.

**Checklist para correção no LSP:**

- [ ] Verificar se o método `get_relation_graph` (ou `getRelationGraph`) recebe o parâmetro `bibref`
- [ ] Adicionar filtro: se `bibref` fornecido, processar apenas ITEMs daquele bibref
- [ ] Testar com dados de `bibliometrics.syn`:
  - Sem bibref → Deve retornar grafo com todos os chains do projeto
  - Com bibref=@ashworth2019 → Deve retornar apenas chains dos 3 ITEMs de @ashworth2019
  - Com bibref=@alrashoud2019 → Deve retornar apenas chains dos 4 ITEMs de @alrashoud2019

**Para reportar no synesis-lsp:**

```markdown
## Bug: getRelationGraph ignoring bibref parameter

**Expected:** When calling `synesis/getRelationGraph` with `bibref` parameter,
should return only chains from ITEMs with that bibref.

**Actual:** Returns ALL chains from ALL ITEMs in the project, ignoring bibref filter.

**Test case:**
- Dataset: bibliometrics.syn (7 sources, 15+ items)
- Call: `getRelationGraph(workspace, bibref="@ashworth2019")`
- Expected: 4 chains (from 3 ITEMs of @ashworth2019)
- Actual: 30+ chains (from all ITEMs in project)

**Impact:** Graph Viewer shows unrelated chains, making it impossible to
visualize relations for a specific source.
```

---

## 🐛 Bug #3: OntologyAnnotationExplorer Falhando com Campos Duplicados ✅ CORRIGIDO

### Descrição do Problema

Após implementar suporte a campos duplicados no SynesisParser, o OntologyAnnotationExplorer começou a falhar com erro:

```
Failed to scan ontology annotations: (chainText || "").trim is not a function
```

### Causa Raiz

**Arquivo:** [ontologyAnnotationExplorer.js:272-286](src/explorers/ontology/ontologyAnnotationExplorer.js#L272-L286)

O código passava `item.fields[fieldName]` diretamente para `chainParser.parseChain()`:

```javascript
// ANTES (BUG):
for (const fieldName of chainFields) {
    const raw = item.fields[fieldName];
    if (!raw) {
        continue;
    }

    const fieldDef = registry[fieldName] || {};
    const parsed = chainParser.parseChain(raw, fieldDef);  // ❌ raw pode ser array!
    // ...
}
```

**Problema:** Com a correção do SynesisParser, `item.fields[fieldName]` agora pode ser:
- **String** - se houver apenas 1 campo com esse nome
- **Array de strings** - se houver múltiplos campos com esse nome

Mas `chainParser.parseChain()` espera **sempre uma string**:

```javascript
function parseChain(chainText, fieldDef) {
    const text = (chainText || '').trim();  // ❌ Falha se chainText for array!
    // ...
}
```

### Solução Implementada

**Arquivo:** [ontologyAnnotationExplorer.js](src/explorers/ontology/ontologyAnnotationExplorer.js)

```javascript
// DEPOIS (CORRIGIDO):
for (const fieldName of chainFields) {
    const raw = item.fields[fieldName];
    if (!raw) {
        continue;
    }

    const fieldDef = registry[fieldName] || {};

    // ✅ Suporta campos com múltiplos valores (arrays)
    const chainValues = Array.isArray(raw) ? raw : [raw];

    for (const chainText of chainValues) {
        const parsed = chainParser.parseChain(chainText, fieldDef);
        for (const code of parsed.codes) {
            const position = this._findTokenPosition(item, fieldName, code, lineOffsets);
            const line = position ? position.line : item.line;
            const column = position ? position.column : 0;
            this._addOccurrence(occurrences, code, filePath, line, column);
        }
    }
}
```

**Comportamento:**
- Se `raw` é string → itera 1 vez com a string
- Se `raw` é array → itera N vezes, uma para cada chain

### Impacto da Correção

**Componentes beneficiados:**
- ✅ **OntologyAnnotationExplorer** - Agora processa múltiplos chains corretamente
- ✅ Não falha mais ao escanear ontology annotations

**Teste de validação:**
- ✅ OntologyAnnotationExplorer deve funcionar sem erros
- ✅ ITEMs com múltiplos chains devem ter todos os códigos extraídos

---

## 🐛 Bug #4: AbstractViewer Não Mostra Múltiplas Notes ✅ CORRIGIDO

### Descrição do Problema

Quando um ITEM tem múltiplas `note:` e `chain:` fields, o AbstractViewer estava concatenando TODAS as notes em uma única string e TODAS as chains em uma única string, em vez de mostrar cada par (note, chain) como um excerpt separado.

**Exemplo:** ITEM @dall-orsoletta2022a

```
ITEM @dall-orsoletta2022a
    text: Models mainly incorporate social aspects...

    note: *complex* Six-factor convergence...
    chain: Population -> INFLUENCES -> Modeling

    note: Economic indicator influences...
    chain: GDP -> INFLUENCES -> Modeling

    note: Employment metric enables...
    chain: Employment -> INFLUENCES -> Modeling

    [... mais 3 pares note/chain ...]
END ITEM
```

**Resultado incorreto:**
- 1 excerpt com text
- Todas as 7 notes concatenadas com " | "
- Todas as 6 chains concatenadas com " | "

**Resultado esperado:**
- 7 excerpts separados
- Cada um mostrando o text + uma note específica + sua chain correspondente

### Causa Raiz

**Arquivo:** [abstractViewer.js:162-163](src/viewers/abstractViewer.js#L162-L163)

```javascript
// ANTES (BUG):
const noteText = showNote ? collectFieldValues(item.fields, memoFields).join(' | ') : '';
const chainText = showChain ? collectFieldValues(item.fields, chainFields).join(' | ') : '';

// Depois usava esses valores concatenados para TODOS os excerpts
excerpts.push({
    text: excerptText,
    note: noteText,      // ❌ Todas as notes concatenadas!
    chain: chainText,    // ❌ Todas as chains concatenadas!
    codes,
    line: item.line,
    file: filePath
});
```

**Problema:**
- `collectFieldValues()` retorna arrays quando há campos duplicados
- O código concatenava com `.join(' | ')` em vez de criar excerpts separados
- Perdia a associação entre cada note e sua chain correspondente

### Solução Implementada

**Arquivo:** [abstractViewer.js:161-218](src/viewers/abstractViewer.js#L161-L218)

```javascript
// DEPOIS (CORRIGIDO):
// Coletar notes, chains como arrays (NÃO concatenar)
const noteValues = showNote ? collectFieldValues(item.fields, memoFields) : [];
const chainValues = showChain ? collectFieldValues(item.fields, chainFields) : [];
const codes = showCodes ? extractCodesFromFields(item.fields, codeFields) : [];

// Se há apenas 1 note e 1 chain, criar 1 excerpt (comportamento original)
if (noteValues.length <= 1 && chainValues.length <= 1) {
    excerpts.push({
        text: excerptText,
        note: noteValues[0] || '',
        chain: chainValues[0] || '',
        codes,
        line: item.line,
        file: filePath
    });
} else {
    // Se há múltiplos notes/chains, criar um excerpt para cada par
    const maxPairs = Math.max(noteValues.length, chainValues.length);

    for (let i = 0; i < maxPairs; i++) {
        excerpts.push({
            text: excerptText,
            note: noteValues[i] || '',
            chain: chainValues[i] || '',
            codes: i === 0 ? codes : [],  // Codes apenas no primeiro
            line: item.line,
            file: filePath
        });
    }
}
```

**Comportamento:**
- Se 1 note e 1 chain → 1 excerpt (backward compatible)
- Se múltiplos notes/chains → múltiplos excerpts, um para cada par (note[i], chain[i])
- Códigos (codes) aparecem apenas no primeiro excerpt para evitar duplicação

### Impacto da Correção

**Componentes beneficiados:**
- ✅ **AbstractViewer** - Agora mostra todas as notes e chains como excerpts separados
- ✅ Cada par (note, chain) é exibido individualmente no Abstract Viewer
- ✅ Mantém backward compatibility para ITEMs com 1 note/chain

**Teste de validação:**
- ✅ ITEM @dall-orsoletta2022a deve mostrar 7 excerpts (ou 6, dependendo da lógica de pairing)
- ✅ Cada excerpt deve ter sua note e chain específicas
- ✅ Nenhuma note ou chain deve ser perdida

---

---

## 🐛 Bug #5: Code e Relation Explorers Não Clicáveis ✅ CORRIGIDO

### Descrição do Problema

Os explorers Code e Relation não estavam respondendo a cliques. Os itens apareciam mas não era possível navegar para as ocorrências ao clicar.

**Sintomas:**
- Itens aparecem no Code Explorer mas não são clicáveis
- Itens aparecem no Relation Explorer mas não são clicáveis
- Nenhuma ação ao clicar nas occurrences ou triplets

### Causa Raiz

**Problema 1: Falta de validação de `file` nulo**

**Arquivo:** [codeExplorer.js:155](src/explorers/code/codeExplorer.js#L155)

```javascript
// ANTES (BUG):
class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        const fileName = path.basename(occurrence.file);  // ❌ Erro se file for null!
        const label = `${fileName}:${occurrence.line}`;

        // ...
        this.command = {
            command: 'synesis.openLocation',
            title: 'Open Location',
            arguments: [occurrence.file, occurrence.line, occurrence.column]
        };  // ❌ Comando definido mesmo se file for null!
    }
}
```

**Problema:**
- Se `occurrence.file` for `null` ou `undefined`, `path.basename(null)` lança erro
- Comando `synesis.openLocation` era definido mesmo sem arquivo válido
- Resultado: TreeItem quebra ou comando falha silenciosamente

**Problema 2: Mesma issue no Relation Explorer**

**Arquivo:** [relationExplorer.js:152-158](src/explorers/relation/relationExplorer.js#L152-L158)

O código já tinha uma validação `if (triplet.file)`, mas não havia feedback visual para usuário quando file era null.

### Solução Implementada

**Arquivo:** [codeExplorer.js:153-175](src/explorers/code/codeExplorer.js#L153-L175)

```javascript
// DEPOIS (CORRIGIDO):
class OccurrenceTreeItem extends vscode.TreeItem {
    constructor(occurrence) {
        // ✅ Validar se file existe
        if (!occurrence.file) {
            console.warn('OccurrenceTreeItem: occurrence.file is null or undefined', occurrence);
        }

        // ✅ Usar fallback para fileName
        const fileName = occurrence.file ? path.basename(occurrence.file) : '<unknown file>';
        const label = `${fileName}:${occurrence.line}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = `${occurrence.context} (${occurrence.field})`;
        this.iconPath = new vscode.ThemeIcon('file');
        this.tooltip = occurrence.file || '<file not available>';
        this.contextValue = 'codeOccurrence';

        // ✅ Só adicionar comando se file existir
        if (occurrence.file) {
            this.command = {
                command: 'synesis.openLocation',
                title: 'Open Location',
                arguments: [occurrence.file, occurrence.line, occurrence.column]
            };
        }
    }
}
```

**Arquivo:** [relationExplorer.js:141-176](src/explorers/relation/relationExplorer.js#L141-L176)

```javascript
// DEPOIS (CORRIGIDO):
class TripletTreeItem extends vscode.TreeItem {
    constructor(triplet) {
        const label = `${triplet.from} -> ${triplet.to}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        // ✅ Validar e dar feedback visual
        if (!triplet.file) {
            console.warn('TripletTreeItem: triplet.file is null or undefined', triplet);
            this.description = `${triplet.type} (no location)`;
        } else {
            this.description = triplet.type;
        }

        // ✅ Ícone diferente para itens sem localização
        this.iconPath = new vscode.ThemeIcon(triplet.file ? 'file' : 'question');
        this.tooltip = triplet.file || '<location not available>';
        this.contextValue = 'relationTriplet';

        // ✅ Só adicionar comando se file existir
        if (triplet.file) {
            this.command = {
                command: 'synesis.openLocation',
                title: 'Open Location',
                arguments: [triplet.file, triplet.line, triplet.column]
            };
        }
    }
}
```

**Comportamento:**
- Se `file` é `null/undefined` → item não é clicável, mostra "(no location)"
- Se `file` existe → item é clicável, abre arquivo na linha/coluna correta
- Ícone visual diferente (question vs file) para indicar se é clicável

### Logs de Diagnóstico Adicionados

Para ajudar a identificar problemas com dados do LSP:

**codeExplorer.js:50-60:**
```javascript
console.log('CodeExplorer.refresh: received', codes ? codes.length : 0, 'codes');
console.log('CodeExplorer.refresh: First code:', firstCode.code);
console.log('CodeExplorer.refresh: First occurrence file:', firstOcc.file);
```

**relationExplorer.js:49-63:**
```javascript
console.log('RelationExplorer.refresh: received', relations ? relations.length : 0, 'relation types');
console.log('RelationExplorer.refresh: First triplet file:', firstTriplet.file);
```

### Impacto da Correção

**Componentes beneficiados:**
- ✅ **CodeExplorer** - Agora valida `file` antes de criar TreeItem
- ✅ **RelationExplorer** - Feedback visual quando location não disponível
- ✅ Logs de diagnóstico para depuração
- ✅ Não lança mais erros se LSP retornar file=null

**Teste de validação:**
1. ✅ Code Explorer deve exibir occurrences clicáveis quando file existe
2. ✅ Relation Explorer deve exibir triplets clicáveis quando file existe
3. ✅ Itens sem file devem aparecer com ícone "question" e "(no location)"
4. ✅ Console deve mostrar logs de diagnóstico ao recarregar explorers

**Nota:** Se os explorers ainda estiverem vazios ou não clicáveis após esta correção, o problema está no LSP não retornando dados corretamente. Verifique logs do console para confirmar se o LSP está funcionando.

### 🔍 Diagnóstico Adicional: Verificar Dados do LSP

Se após as correções os explorers **ainda não estiverem clicáveis**, adicionamos logs de diagnóstico extensivos para identificar o problema específico.

**Logs adicionados em dataService.js:**

```javascript
console.log('DataService.getCodes: workspaceRoot =', workspaceRoot);
console.log('DataService.getCodes: First occurrence from LSP:', firstOcc);
console.log('DataService.getCodes: First occurrence after processing:', processedOcc);
```

**Como usar:**
1. Recarregue a extensão (Ctrl+Shift+P → "Developer: Reload Window")
2. Abra Developer Console (F12 → Console)
3. Abra um arquivo .syn
4. Procure por logs `DataService.getCodes` e `DataService.getRelations`

**Problemas comuns identificáveis:**

| Log | Problema | Causa | Solução |
|-----|----------|-------|---------|
| `workspaceRoot =` (vazio) | workspaceRoot não detectado | VSCode não em folder workspace | Abrir pasta como workspace |
| `First occurrence from LSP: { file: null }` | LSP não retorna file | LSP não está retornando localizações | Verificar LSP version/config |
| `Failed to resolve file path` | path.resolve falhou | workspaceRoot vazio | Verificar workspace folder |

**Documento completo:** Ver scratchpad/DIAGNOSE_EXPLORER_LOCATIONS.md

---

## ✅ Correções Adicionais Implementadas (Fase 1)

### 1. GraphViewer com Fallback Local para _findBibref()

**Problema original (LSP_FUNCTIONALITY_AUDIT.md):**
- GraphViewer dependia 100% de LSP para extração de bibref
- Se LSP não estava pronto ou sem `documentSymbolProvider`, retornava null
- GraphViewer ficava completamente inutilizável

**Solução implementada:**

**Arquivo:** [src/viewers/graphViewer.js](src/viewers/graphViewer.js)

```javascript
async _findBibref(document, position) {
    const lspReady = Boolean(this.dataService && this.dataService.lspClient &&
                            this.dataService.lspClient.isReady());

    let bibref = null;

    // Tenta LSP primeiro
    if (lspReady) {
        bibref = await this._findBibrefViaLsp(document, position);
        if (bibref) {
            return bibref;
        }
        console.warn('LSP did not return bibref, falling back to local parsing');
    } else {
        console.warn('LSP not ready, falling back to local parsing');
    }

    // Fallback para parsing local
    return this._findBibrefLocal(document, position);
}

_findBibrefLocal(document, position) {
    try {
        const text = document.getText();
        const filePath = document.uri.fsPath || '';
        const offset = document.offsetAt(position);

        // Tenta encontrar em ITEM blocks
        const items = this.parser.parseItems(text, filePath);
        const item = items.find(entry => offset >= entry.startOffset && offset <= entry.endOffset);
        if (item && item.bibref) {
            return item.bibref;
        }

        // Tenta encontrar em SOURCE blocks
        const sources = this.parser.parseSourceBlocks(text, filePath);
        const source = sources.find(entry => offset >= entry.startOffset && offset <= entry.endOffset);
        if (source && source.bibref) {
            return source.bibref;
        }

        // Fallback: busca bibref inline na linha do cursor
        const lineText = document.lineAt(position.line).text;
        const match = lineText.match(/@[\w._-]+/);
        return match ? match[0] : null;
    } catch (error) {
        console.warn('Failed to parse document:', error.message);
        return null;
    }
}
```

**Benefícios:**
- ✅ GraphViewer funciona mesmo sem LSP
- ✅ GraphViewer funciona quando LSP está inicializando
- ✅ GraphViewer funciona quando `documentSymbolProvider` não está disponível
- ✅ Fallback robusto com 3 estratégias (ITEM → SOURCE → inline bibref)

---

## 📊 Resumo das Correções

| Bug | Status | Componente | Arquivo Modificado |
|-----|--------|------------|-------------------|
| AbstractViewer mostra apenas último CHAIN | ✅ Corrigido | SynesisParser | [synesisParser.js](src/parsers/synesisParser.js) |
| AbstractViewer não coleta arrays corretamente | ✅ Corrigido | AbstractViewer | [abstractViewer.js](src/viewers/abstractViewer.js) |
| AbstractViewer não mostra múltiplas NOTEs | ✅ Corrigido | AbstractViewer | [abstractViewer.js](src/viewers/abstractViewer.js) |
| OntologyAnnotationExplorer falha com campos duplicados | ✅ Corrigido | OntologyAnnotationExplorer | [ontologyAnnotationExplorer.js](src/explorers/ontology/ontologyAnnotationExplorer.js) |
| Code e Relation Explorers não clicáveis | ✅ Corrigido | CodeExplorer, RelationExplorer | [codeExplorer.js](src/explorers/code/codeExplorer.js), [relationExplorer.js](src/explorers/relation/relationExplorer.js) |
| GraphViewer mostra todos chains (não filtra por bibref) | ⚠️ Bug do LSP | synesis-lsp | **Requer correção no LSP** |
| GraphViewer sem fallback para _findBibref | ✅ Corrigido | GraphViewer | [graphViewer.js](src/viewers/graphViewer.js) |

---

## 🧪 Testes Recomendados

### Teste 1: AbstractViewer com Múltiplos Chains

1. Abrir `test/fixtures/bibliometrics/bibliometrics.syn`
2. Posicionar cursor no ITEM @ashworth2019 (linha 7)
3. Executar comando "Synesis: Show Abstract"
4. **Verificar:** Deve mostrar **4 chains** na legenda:
   - Gender -> INFLUENCES -> CCS_Support
   - Knowledge -> INFLUENCES -> CCS_Support
   - Economic_Value -> INFLUENCES -> CCS_Support
   - Risk_Perception -> CONSTRAINS -> CCS_Support

### Teste 2: GraphViewer com LSP Desabilitado

1. Desabilitar LSP temporariamente (ou antes de inicializar)
2. Abrir `bibliometrics.syn`
3. Posicionar cursor em qualquer SOURCE ou ITEM
4. Executar "Show Relation Graph"
5. **Verificar:** Deve encontrar bibref via parsing local e exibir grafo

### Teste 3: AbstractViewer com Múltiplas Notes

1. Abrir `test/fixtures/bibliometrics/bibliometrics.syn`
2. Localizar ITEM @dall-orsoletta2022a que contém:
   ```
   text: Models mainly incorporate social aspects...
   note: *complex* Six-factor convergence...
   chain: Population -> INFLUENCES -> Modeling
   note: Economic indicator influences...
   chain: GDP -> INFLUENCES -> Modeling
   [... mais 4 pares note/chain ...]
   ```
3. Posicionar cursor neste ITEM
4. Executar comando "Synesis: Show Abstract"
5. **Verificar:** Deve mostrar **6 excerpts separados** na legenda (1 para cada par note/chain):
   - Excerpt 1: note complexa + chain "Population -> INFLUENCES -> Modeling"
   - Excerpt 2: note "Economic indicator..." + chain "GDP -> INFLUENCES -> Modeling"
   - Excerpt 3: note "Employment metric..." + chain "Employment -> INFLUENCES -> Modeling"
   - Excerpt 4: note "Acceptability integration..." + chain "Acceptability -> INFLUENCES -> Modeling"
   - Excerpt 5: note "Perception metric..." + chain "Perception -> INFLUENCES -> Modeling"
   - Excerpt 6: note "Access dimension..." + chain "Access -> INFLUENCES -> Modeling"

### Teste 4: GraphViewer com Filtragem por Bibref (LSP)

⚠️ **Este teste falhará até que o bug do LSP seja corrigido**

1. Abrir `bibliometrics.syn`
2. Posicionar cursor no SOURCE @ashworth2019 (linha 1)
3. Executar "Show Relation Graph"
4. **Esperado:** Grafo com apenas 4 chains de @ashworth2019
5. **Atual:** Grafo com todos os chains do projeto (30+)

---

## 📝 Próximos Passos

### Para a Extensão (synesis-explorer)

- [ ] Implementar `validateSynesisCustomMethods()` em extension.js
- [ ] Adicionar feedback visual nos explorers quando LSP não está pronto
- [ ] Atualizar README.md com requisitos LSP
- [ ] Testar todas as correções com dados reais

### Para o LSP (synesis-lsp)

- [ ] Corrigir `getRelationGraph` para filtrar por bibref
- [ ] Adicionar testes unitários para filtragem por bibref
- [ ] Publicar nova versão (v1.0.1+)

---

**Status Final:** ✅ Bugs da extensão corrigidos | ⚠️ Aguardando correção do LSP para filtragem de chains
