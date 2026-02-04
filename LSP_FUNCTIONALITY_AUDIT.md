# Auditoria de Funcionalidades LSP - Synesis Explorer v0.5.0+

**Data:** 2026-02-02
**Versão Analisada:** 0.5.0+ (LSP Strict Mode por padrão)
**Status:** ⚠️ CRÍTICO - Múltiplas funcionalidades quebradas após remoção do regex fallback

---

## 📋 Sumário Executivo

A análise completa do código da extensão Synesis Explorer identificou que:

1. ✅ **Arquitetura bem estruturada** com padrão Adapter LSP/Local implementado
2. ⚠️ **Fallback regex AINDA PRESENTE** no código (LocalRegexProvider completo)
3. ❌ **Múltiplas funcionalidades quebradas** quando LSP falha ou retorna dados vazios
4. ❌ **Validação de capabilities incompleta** - não verifica métodos customizados Synesis
5. ❌ **GraphViewer 100% dependente de LSP** sem fallback para extração de bibref

---

## 🔍 Análise Detalhada

### 1. Fallbacks Regex Remanescentes

#### 1.1 LocalRegexProvider (dataService.js:204-532)

O `LocalRegexProvider` **AINDA ESTÁ IMPLEMENTADO** com parsing regex completo para:

| Método | Implementação | Status | Linhas |
|--------|---------------|--------|--------|
| `getReferences()` | Usa `SynesisParser.parseSourceBlocks()` | ✓ Funcional | 211-242 |
| `getCodes()` | Usa `SynesisParser.parseItems()` + `chainParser` | ✓ Funcional | 244-298 |
| `getRelations()` | Usa `chainParser.parseChain()` | ✓ Funcional | 300-362 |
| `getRelationGraph()` | Usa `generateMermaidGraph()` local | ✓ Funcional | 364-427 |
| `getOntologyTopics()` | Stub vazio (deprecated) | ❌ Não funcional | 521-527 |
| `getOntologyAnnotations()` | Stub vazio (deprecated) | ❌ Não funcional | 528-531 |

**Código Crítico - dataService.js:636-637:**
```javascript
console.warn(`DataService.${method}: Falling back to LocalRegexProvider (DEPRECATED)`);
return this.localProvider[method](...args);
```

**Impacto:** Quando `lspStrict=false`, o fallback regex AINDA É EXECUTADO.

---

### 2. Fluxo de Decisão LSP vs Regex

#### 2.1 Método `_tryLspThenLocal()` (dataService.js:584-638)

**Fluxo atual:**

```
┌─────────────────────────────────────┐
│ DataService.getCodes()              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ _tryLspThenLocal('getCodes')        │
│                                     │
│ lspRequired = _isLspRequired()      │
│ lspReady = lspClient.isReady()      │
└────────────┬────────────────────────┘
             │
             ▼
      ┌─────┴─────┐
      │ lspReady? │
      └─────┬─────┘
            │
    ┌───────┴───────┐
    │ Sim           │ Não
    ▼               ▼
┌───────────┐   ┌────────────┐
│ Tenta LSP │   │lspRequired?│
└─────┬─────┘   └─────┬──────┘
      │               │
      ▼         ┌─────┴─────┐
 ┌────────┐    │Sim    │Não│
 │Sucesso?│    ▼       ▼
 └────┬───┘  ┌────┐ ┌──────┐
      │      │[]  │ │REGEX │ ⚠️
 ┌────┴────┐ └────┘ └──────┘
 │Sim │Não │
 ▼    ▼
┌──┐ ┌──────────┐
│OK│ │Erro?     │
└──┘ └────┬─────┘
          │
     ┌────┴──────┐
     │-32601?│Outro│
     ▼       ▼
   ┌─────┐ ┌──────┐
   │Mark │ │lspReq?│
   │unsup│ └──┬───┘
   └──┬──┘   │
      │   ┌──┴──┐
      │   │Sim│Não│
      │   ▼   ▼
      │  ┌─┐ ┌────┐
      │  │[]│ │REGEX│ ⚠️
      │  └─┘ └────┘
      │
      ▼
  ┌────────┐
  │lspReq? │
  └───┬────┘
      │
  ┌───┴───┐
  │Sim│Não│
  ▼   ▼
 ┌─┐ ┌────┐
 │[]│ │REGEX│ ⚠️
 └─┘ └────┘
```

**⚠️ Pontos Críticos:**

1. **Linha 607-608:** LSP retorna null → fallback para regex (se `!lspRequired`)
2. **Linha 616:** LSP método não encontrado (-32601) → fallback para regex (se `!lspRequired`)
3. **Linha 622:** Outro erro LSP → fallback para regex (se `!lspRequired`)
4. **Linha 637:** LSP não pronto → fallback para regex (se `!lspRequired`)

#### 2.2 Métodos LSP-Exclusive (dataService.js:30-36)

```javascript
const DEFAULT_LSP_EXCLUSIVE_METHODS = new Set([
    'getCodes',
    'getRelations',
    'getRelationGraph',
    'getOntologyTopics',
    'getOntologyAnnotations'
]);
```

**Comportamento:**
- Quando `lspStrict=true` → esses métodos NUNCA usam fallback
- Quando `lspStrict=false` → podem usar fallback se LSP falhar

**Problema:** Usuário pode desativar strict mode e continuar usando regex deprecated.

---

### 3. Funcionalidades Quebradas

#### 3.1 ❌ CRÍTICO: Explorers Mostram Lista Vazia Silenciosamente

**Componentes afetados:**
- [referenceExplorer.js:42](src/explorers/reference/referenceExplorer.js#L42)
- [codeExplorer.js:36](src/explorers/code/codeExplorer.js#L36)
- [relationExplorer.js:35](src/explorers/relation/relationExplorer.js#L35)

**Cenário de falha:**

```javascript
// Em codeExplorer.js linha 36
const codes = await this.dataService.getCodes();
// Se LSP retorna [] (vazio), explorer simplesmente mostra vazio
// Sem erro, sem warning na UI
```

**Impacto:**
- LSP retorna `[]` → Explorer vazio
- LSP retorna `null` (tratado como `[]` pelo dataService) → Explorer vazio
- LSP método não suportado (-32601) → Explorer vazio (após primeiro warning)
- **Usuário não sabe se é:**
  - Dados vazios legítimos (projeto sem códigos)
  - Falha do LSP
  - LSP não está pronto
  - LSP não suporta o método

**Logs disponíveis:**
- ✅ Console do desenvolvedor (F12) mostra warnings
- ❌ Nenhum feedback visual na UI após primeiro warning
- ❌ Status bar não indica falha dos explorers

---

#### 3.2 ❌ CRÍTICO: GraphViewer Sem Fallback para _findBibref()

**Arquivo:** [graphViewer.js:355-379](src/viewers/graphViewer.js#L355-L379)

**Código problemático:**

```javascript
async _findBibref(document, position) {
    const lspReady = Boolean(this.dataService && this.dataService.lspClient &&
                            this.dataService.lspClient.isReady());

    if (!lspReady) {
        console.warn('GraphViewer._findBibref: LSP not ready');
        return null;  // ❌ FALHA SILENCIOSA - SEM FALLBACK
    }

    const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    );

    if (!symbols || symbols.length === 0) {
        console.warn('GraphViewer._findBibref: No symbols returned from LSP');
        return null;  // ❌ FALHA SILENCIOSA - SEM FALLBACK
    }

    const bibref = extractBibrefFromSymbols(symbols, position);
    return bibref;
}
```

**Dependências LSP:**
1. `lspClient.isReady()` → Se false, retorna null imediatamente
2. `vscode.executeDocumentSymbolProvider` → Requer `documentSymbolProvider` capability
3. Extração de bibref via símbolos LSP

**Cenários de falha:**
- LSP não está pronto → Warning: "No reference found. Ensure the LSP is ready..."
- LSP sem `documentSymbolProvider` capability → Warning: "No reference found..."
- LSP retorna símbolos vazios → Warning: "No reference found..."

**Impacto:**
- ❌ **NENHUM gráfico pode ser exibido sem LSP funcionando**
- ❌ Mesmo com `lspStrict=false`, GraphViewer NÃO usa fallback regex
- ❌ Usuário não consegue usar GraphViewer em arquivos .syn sem LSP

**Possível solução (não implementada):**
```javascript
// Fallback: Extrair bibref via regex local
if (!bibref && !lspReady) {
    // Usar SynesisParser.findBibrefAtPosition(document, position)
    // Implementação similar ao que OntologyAnnotationExplorer faz
}
```

---

#### 3.3 ⚠️ ALTO: Validação de Capabilities Incompleta

**Arquivo:** [extension.js:702-756](extension.js#L702-L756)

**Capabilities validadas:**
- ✅ `hoverProvider`
- ✅ `definitionProvider`
- ✅ `documentSymbolProvider`
- ✅ `renameProvider`
- ✅ `completionProvider`

**Capabilities NÃO validadas:**
- ❌ `synesis/getReferences`
- ❌ `synesis/getCodes`
- ❌ `synesis/getRelations`
- ❌ `synesis/getRelationGraph`
- ❌ `synesis/getOntologyTopics`
- ❌ `synesis/getOntologyAnnotations`

**Problema:**
- LSP pode ter capabilities padrão (hover, definition, etc.) mas **não ter métodos customizados Synesis**
- Validação passa (✓ LSP capabilities validated successfully)
- Explorers ficam vazios silenciosamente quando chamam métodos customizados

**Solução necessária:**
```javascript
// Adicionar validação de métodos customizados
async function validateSynesisLspMethods() {
    const testMethods = [
        'synesis/getCodes',
        'synesis/getReferences',
        'synesis/getRelations',
        'synesis/getRelationGraph'
    ];

    for (const method of testMethods) {
        try {
            await lspClient.sendRequest(method, { workspaceRoot: '...' });
        } catch (error) {
            if (isMethodNotFound(error)) {
                console.error(`LSP missing custom method: ${method}`);
                // Adicionar a unsupportedMethods
            }
        }
    }
}
```

---

#### 3.4 ⚠️ MÉDIO: Métodos Deprecated Sem Implementação

**Arquivo:** [dataService.js:521-531](src/services/dataService.js#L521-L531)

```javascript
async getOntologyTopics() {
    console.warn('LocalRegexProvider.getOntologyTopics: fallback to local parsing (deprecated)');
    return [];  // SEMPRE VAZIO
}

async getOntologyAnnotations(activeFile) {
    console.warn('LocalRegexProvider.getOntologyAnnotations: fallback to local parsing (deprecated)');
    return [];  // SEMPRE VAZIO
}
```

**Situação:**
- Métodos marcados como "deprecated" mas **nunca implementados** com regex
- DataService nunca chama esses métodos (usa OntologyExplorer/OntologyAnnotationExplorer diretamente)
- **Código morto** que pode ser removido

**Impacto:**
- ✅ Baixo - Métodos não são usados pela aplicação
- ✅ OntologyExplorer usa parsing regex diretamente (não passa por DataService)

---

### 4. Matriz de Dependências LSP

| Componente | Método LSP | Fallback Regex? | Quebra sem LSP? | Localização |
|------------|------------|-----------------|-----------------|-------------|
| **ReferenceExplorer** | `synesis/getReferences` | ✅ Sim (se !strict) | ⚠️ Vazio | [referenceExplorer.js:42](src/explorers/reference/referenceExplorer.js#L42) |
| **CodeExplorer** | `synesis/getCodes` | ✅ Sim (se !strict) | ⚠️ Vazio | [codeExplorer.js:36](src/explorers/code/codeExplorer.js#L36) |
| **RelationExplorer** | `synesis/getRelations` | ✅ Sim (se !strict) | ⚠️ Vazio | [relationExplorer.js:35](src/explorers/relation/relationExplorer.js#L35) |
| **GraphViewer (getGraph)** | `synesis/getRelationGraph` | ✅ Sim (se !strict) | ⚠️ Vazio | [graphViewer.js:45](src/viewers/graphViewer.js#L45) |
| **GraphViewer (findBibref)** | `documentSymbolProvider` | ❌ **NÃO** | ❌ **Quebra** | [graphViewer.js:355](src/viewers/graphViewer.js#L355) |
| **OntologyExplorer** | - | ✅ Apenas regex | ✅ Funciona | [ontologyExplorer.js](src/explorers/ontology/ontologyExplorer.js) |
| **OntologyAnnotationExplorer** | - | ✅ Apenas regex | ✅ Funciona | [ontologyAnnotationExplorer.js](src/explorers/ontology/ontologyAnnotationExplorer.js) |
| **Hover Provider** | `hoverProvider` | ❌ NÃO | ❌ Quebra | LSP nativo |
| **Definition Provider** | `definitionProvider` | ❌ NÃO | ❌ Quebra | LSP nativo |
| **Rename Provider** | `renameProvider` | ❌ NÃO | ❌ Quebra | LSP nativo |
| **Completion Provider** | `completionProvider` | ❌ NÃO | ❌ Quebra | LSP nativo |

**Legenda:**
- ✅ Funciona / Tem fallback
- ⚠️ Mostra vazio sem erro claro
- ❌ Quebra completamente

---

## 🔧 Problemas Identificados

### Problema #1: LocalRegexProvider Ainda Presente
**Severidade:** 🔴 CRÍTICO
**Arquivos:** [dataService.js:204-532](src/services/dataService.js#L204-L532)

**Descrição:**
O código completo do `LocalRegexProvider` ainda está no codebase, implementando parsing regex para todos os métodos principais.

**Impacto:**
- Confusão sobre arquitetura (LSP-only vs LSP+fallback)
- Código deprecated mantido no codebase
- Comportamento inconsistente quando `lspStrict=false`

**Ação recomendada:**
- [ ] **ANTES de remover:** Garantir que LSP 100% funcional
- [ ] **ANTES de remover:** Implementar validação de métodos Synesis customizados
- [ ] **ANTES de remover:** Implementar fallback para GraphViewer._findBibref()
- [ ] Remover classe `LocalRegexProvider` inteira
- [ ] Remover linha 636-637 (fallback call)
- [ ] Remover setting `lsp.strict` (sempre strict)

---

### Problema #2: GraphViewer._findBibref() Sem Fallback
**Severidade:** 🔴 CRÍTICO
**Arquivos:** [graphViewer.js:355-379](src/viewers/graphViewer.js#L355-L379)

**Descrição:**
GraphViewer depende 100% de LSP para extrair bibref via `documentSymbolProvider`. Não há fallback regex, mesmo quando `lspStrict=false`.

**Impacto:**
- GraphViewer **totalmente inutilizável** sem LSP
- Usuário vê apenas: "No reference found. Ensure the LSP is ready..."
- Funcionalidade mais visual da extensão fica quebrada

**Ação recomendada:**
- [ ] Implementar `_findBibrefLocal(document, position)` com regex
- [ ] Usar parsing similar ao OntologyAnnotationExplorer
- [ ] Modificar `_findBibref()`:
  ```javascript
  async _findBibref(document, position) {
      // Tentar LSP primeiro
      if (lspReady) {
          const bibrefFromLsp = await this._findBibrefViaLsp(document, position);
          if (bibrefFromLsp) return bibrefFromLsp;
      }

      // Fallback para regex local
      console.warn('GraphViewer: Falling back to local bibref extraction');
      return this._findBibrefLocal(document, position);
  }
  ```

---

### Problema #3: Validação de Capabilities Incompleta
**Severidade:** 🟡 ALTO
**Arquivos:** [extension.js:702-756](extension.js#L702-L756)

**Descrição:**
`validateLspCapabilities()` valida apenas capabilities padrão LSP, não valida métodos customizados `synesis/*`.

**Impacto:**
- LSP pode passar na validação mas não ter métodos Synesis
- Explorers ficam vazios silenciosamente
- Usuário vê "✓ LSP capabilities validated successfully" mas dados não aparecem

**Ação recomendada:**
- [ ] Adicionar `validateSynesisCustomMethods()`:
  ```javascript
  async function validateSynesisCustomMethods() {
      const requiredMethods = [
          'synesis/getCodes',
          'synesis/getReferences',
          'synesis/getRelations',
          'synesis/getRelationGraph'
      ];

      const missing = [];
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      for (const method of requiredMethods) {
          try {
              await lspClient.sendRequest(method, { workspaceRoot });
          } catch (error) {
              if (error.code === -32601) {
                  missing.push(method);
              }
          }
      }

      if (missing.length > 0) {
          vscode.window.showErrorMessage(
              `⚠️ LSP missing Synesis methods: ${missing.join(', ')}. ` +
              `Please update synesis-lsp to v1.0.0+`
          );
      }
  }
  ```

---

### Problema #4: Explorers Sem Feedback de Erro Visual
**Severidade:** 🟡 ALTO
**Arquivos:**
- [referenceExplorer.js:38-52](src/explorers/reference/referenceExplorer.js#L38-L52)
- [codeExplorer.js:32-52](src/explorers/code/codeExplorer.js#L32-L52)
- [relationExplorer.js:31-47](src/explorers/relation/relationExplorer.js#L31-L47)

**Descrição:**
Quando LSP retorna `[]` ou `null`, explorers simplesmente mostram lista vazia. Usuário não sabe se:
- Não há dados (legítimo)
- LSP falhou
- LSP não está pronto
- LSP não suporta o método

**Impacto:**
- Experiência do usuário confusa
- Difícil diagnosticar problemas
- Usuário não sabe se deve esperar, atualizar LSP, ou verificar logs

**Ação recomendada:**
- [ ] Adicionar placeholder visual quando LSP não está pronto:
  ```javascript
  async refresh() {
      this.references.clear();
      const lspReady = this.dataService.lspClient?.isReady();

      if (!lspReady) {
          // Mostrar item de placeholder
          this.references.set('⚠️ LSP not ready', [{
              file: '',
              line: 0,
              itemCount: 0,
              message: 'Waiting for LSP to initialize...'
          }]);
          this._onDidChangeTreeData.fire();
          return;
      }

      const refs = await this.dataService.getReferences();
      // ... resto do código
  }
  ```

- [ ] Ou adicionar status na TreeView title:
  ```javascript
  // Em extension.js ao criar TreeView
  const refTreeView = vscode.window.createTreeView('synesisReferences', {
      treeDataProvider: refExplorer,
      showCollapseAll: true
  });

  // Atualizar title baseado no status
  function updateTreeViewTitle() {
      if (!lspClient.isReady()) {
          refTreeView.title = 'References (LSP Loading...)';
      } else {
          refTreeView.title = 'References';
      }
  }
  ```

---

### Problema #5: Métodos Deprecated Mantidos
**Severidade:** 🟢 BAIXO
**Arquivos:** [dataService.js:521-531](src/services/dataService.js#L521-L531)

**Descrição:**
Métodos `getOntologyTopics()` e `getOntologyAnnotations()` no `LocalRegexProvider` retornam sempre `[]` e são marcados como deprecated.

**Impacto:**
- Código morto no codebase
- Confusão sobre implementação

**Ação recomendada:**
- [ ] Remover métodos deprecated
- [ ] Confirmar que OntologyExplorer/OntologyAnnotationExplorer não dependem deles

---

## 📊 Estatísticas do Código

| Métrica | Valor | Localização |
|---------|-------|-------------|
| **LocalRegexProvider LOC** | ~328 linhas | dataService.js:204-532 |
| **Métodos com fallback regex** | 4 funcionais + 2 stubs | getCodes, getReferences, getRelations, getRelationGraph |
| **Componentes LSP-only** | 1 crítico | GraphViewer._findBibref() |
| **Capabilities validadas** | 5 padrão + 0 custom | extension.js:723-736 |
| **Explorers afetados** | 3 principais | Reference, Code, Relation |
| **Warnings em código** | 13 ocorrências | "DEPRECATED", "fallback", etc. |

---

## ✅ Plano de Ação Recomendado

### Fase 1: Correções Pré-Remoção ✅ CONCLUÍDA

- [x] **1.1** Implementar `validateSynesisCustomMethods()` em extension.js ✅
- [x] **1.2** Implementar `_findBibrefLocal()` em GraphViewer com fallback regex ✅
- [x] **1.3** Adicionar feedback visual em explorers quando LSP não está pronto ✅
- [ ] **1.4** Adicionar testes para cenários de falha LSP
- [ ] **1.5** Documentar comportamento LSP-only no README.md

**Status:** ✅ Principais correções implementadas (3/5 concluídas)

### Fase 2: Remoção de Fallback Regex (Após Fase 1)

- [ ] **2.1** Remover classe `LocalRegexProvider` (linhas 204-532)
- [ ] **2.2** Remover linha 636-637 (fallback call em `_tryLspThenLocal`)
- [ ] **2.3** Remover setting `lsp.strict` (sempre strict)
- [ ] **2.4** Remover `DEFAULT_LSP_EXCLUSIVE_METHODS` (todos os métodos são exclusive)
- [ ] **2.5** Simplificar `_tryLspThenLocal()` → rename para `_callLsp()`
- [ ] **2.6** Atualizar documentação LSP_TROUBLESHOOTING.md
- [ ] **2.7** Atualizar CHANGELOG.md com breaking changes

### Fase 3: Melhorias Pós-Remoção (Opcional)

- [ ] **3.1** Implementar retry automático quando LSP retorna null
- [ ] **3.2** Implementar status bar item com mais detalhes (ex: "LSP: Ready, 50 codes indexed")
- [ ] **3.3** Adicionar comando "Synesis: Diagnose LSP Issues" para debug
- [ ] **3.4** Implementar cache local de dados LSP para evitar vazios em falhas temporárias
- [ ] **3.5** Adicionar telemetria para rastrear falhas LSP (opt-in)

---

## 🎯 Critérios de Sucesso

Antes de considerar a remoção do fallback regex completa, garantir que:

1. ✅ **100% dos testes passam** com LSP-only mode
2. ✅ **GraphViewer funciona** mesmo quando `documentSymbolProvider` falha (via fallback local)
3. ✅ **Validação de capabilities** detecta LSP incompleto (padrão + custom methods)
4. ✅ **Explorers mostram feedback claro** quando LSP não está pronto ou falha
5. ✅ **Documentação atualizada** com todos os requisitos LSP
6. ✅ **LSP v1.0.0+** instalado e testado com todos os métodos customizados
7. ✅ **Comportamento degradado gracioso** quando LSP temporariamente indisponível

---

## 📚 Referências

- [LSP_TROUBLESHOOTING.md](LSP_TROUBLESHOOTING.md) - Guia de troubleshooting atual
- [dataService.js](src/services/dataService.js) - Adapter LSP/Local
- [graphViewer.js](src/viewers/graphViewer.js) - Visualizador de grafos
- [extension.js](extension.js) - Ponto de entrada e validação

---

## 📝 Conclusão

A extensão Synesis Explorer **NÃO ESTÁ PRONTA** para remoção completa do fallback regex. Problemas críticos identificados:

1. 🔴 **GraphViewer._findBibref() quebra sem LSP** (sem fallback)
2. 🔴 **Validação de capabilities incompleta** (não testa métodos Synesis)
3. 🟡 **Explorers vazios sem feedback** (UX confusa)

**Recomendação final:** Implementar **Fase 1 (Correções Pré-Remoção)** ANTES de remover qualquer código do `LocalRegexProvider`. Caso contrário, múltiplas funcionalidades ficarão quebradas e a experiência do usuário será severamente degradada.

---

**Status:** ⏸️ **AGUARDANDO CORREÇÕES** antes de prosseguir com remoção de fallback
