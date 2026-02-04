# Como Recarregar a Extensão Synesis Explorer

Após fazer alterações no código da extensão, é necessário recarregá-la no VSCode para que as mudanças tenham efeito.

## Método 1: Comando de Reload (Recomendado)

1. Pressione `Ctrl+Shift+P` (Windows/Linux) ou `Cmd+Shift+P` (Mac)
2. Digite: `Developer: Reload Window`
3. Pressione Enter

**Nota:** Isso recarrega toda a janela do VSCode, incluindo a extensão.

## Método 2: Via F5 (Durante Desenvolvimento)

Se você está executando a extensão em modo de desenvolvimento:

1. Pressione `F5` para iniciar/reiniciar a extensão
2. Uma nova janela do VSCode será aberta com a extensão carregada

## Método 3: Recarregar Apenas a Extensão

1. Pressione `Ctrl+Shift+P`
2. Digite: `Extensions: Restart Extensions`
3. Pressione Enter

## Verificação

Após recarregar, verifique se as correções foram aplicadas:

### Teste 1: AbstractViewer com Múltiplos Chains

1. Abra `test/fixtures/bibliometrics/bibliometrics.syn`
2. Posicione o cursor no ITEM @demir2021 ou @ashworth2019
3. Execute: `Synesis: Show Abstract`
4. **Verificar:** Todos os chains devem aparecer, não apenas o último

**ITEM @demir2021 deve mostrar 3 chains:**
- Environment -> CONTESTED-BY -> Wind_Energy
- Economy -> CONSTRAINS -> Wind_Energy
- Sensory_Impact -> CONTESTED-BY -> Wind_Energy

**ITEM @ashworth2019 deve mostrar 4 chains:**
- Gender -> INFLUENCES -> CCS_Support
- Knowledge -> INFLUENCES -> CCS_Support
- Economic_Value -> INFLUENCES -> CCS_Support
- Risk_Perception -> CONSTRAINS -> CCS_Support

### Teste 2: GraphViewer Fallback

1. Com LSP desabilitado ou não inicializado
2. Abra qualquer arquivo .syn
3. Execute: `Synesis: Show Relation Graph`
4. **Verificar:** Deve encontrar o bibref mesmo sem LSP

### Teste 3: Feedback Visual nos Explorers

1. Recarregue a extensão
2. **Verificar:** Durante a inicialização, os explorers devem mostrar:
   - `References (LSP Loading...)`
   - `Codes (LSP Loading...)`
   - `Relations (LSP Loading...)`
3. Após LSP carregar, os títulos voltam ao normal:
   - `References`
   - `Codes`
   - `Relations`

### Teste 4: AbstractViewer com Múltiplas Notes

1. Abra `test/fixtures/bibliometrics/bibliometrics.syn`
2. Localize o ITEM @dall-orsoletta2022a que contém múltiplas notes e chains
3. Posicione o cursor neste ITEM
4. Execute: `Synesis: Show Abstract`
5. **Verificar:** Deve mostrar múltiplos excerpts separados, cada um com:
   - Seu próprio texto de note
   - Sua própria chain correspondente
6. **Não deve** mostrar todas as notes concatenadas em um único excerpt

### Teste 5: Code e Relation Explorers Clicáveis

1. Abra qualquer arquivo .syn do projeto
2. Aguarde o LSP carregar completamente
3. **Code Explorer:**
   - Verifique se há códigos listados
   - Expanda um código para ver suas occurrences
   - **Clique** em uma occurrence
   - **Verificar:** Deve abrir o arquivo na linha correta
   - **Console**: Deve mostrar "CodeExplorer.refresh: received X codes"
4. **Relation Explorer:**
   - Verifique se há relações listadas
   - Expanda uma relação para ver os triplets
   - **Clique** em um triplet
   - **Verificar:** Deve abrir o arquivo na linha correta
   - **Console**: Deve mostrar "RelationExplorer.refresh: received X relation types"
5. **Se algum item não for clicável:**
   - Verifique o ícone: deve ser "file" (clicável) ou "?" (sem localização)
   - Items com "?" devem mostrar "(no location)" na description
   - Verifique console para warnings sobre "file is null or undefined"

## Troubleshooting

### "Ainda vejo apenas o último chain"

**Causa:** A extensão não foi recarregada corretamente.

**Solução:**
1. Feche TODAS as janelas do VSCode
2. Reabra o VSCode
3. Abra a pasta do projeto synesis-explorer
4. Teste novamente

### "Não vejo as mudanças"

**Causa:** Pode haver cache do código antigo.

**Solução:**
1. Feche o VSCode completamente
2. Navegue até a pasta da extensão: `%USERPROFILE%\.vscode\extensions\` (Windows)
3. Encontre a pasta da extensão Synesis Explorer
4. Delete a pasta (se estiver instalada) ou apenas recarregue
5. Se está em desenvolvimento, pressione `F5` para recompilar

### "LSP não está carregando"

**Verificar:**
1. Abra: `Output` > `Synesis LSP`
2. Verifique logs de inicialização
3. Confirme que `synesis-lsp` está instalado: `pip list | grep synesis-lsp`

## Comandos Úteis para Desenvolvimento

```bash
# No diretório da extensão

# Limpar cache do Node.js (se aplicável)
npm cache clean --force

# Reinstalar dependências
npm install

# Executar testes
npm test

# Executar teste do parser
node test-parser.js
```

## Checklist de Verificação Pós-Reload

- [ ] AbstractViewer mostra TODOS os chains (não apenas o último)
- [ ] AbstractViewer mostra TODAS as notes como excerpts separados (não concatenadas)
- [ ] AbstractViewer cria múltiplos excerpts quando há múltiplos pares (note, chain)
- [ ] GraphViewer funciona sem LSP (fallback local)
- [ ] Explorers mostram status "(LSP Loading...)" durante inicialização
- [ ] Explorers voltam ao normal após LSP carregar
- [ ] **Code Explorer**: Occurrences são clicáveis e abrem o arquivo correto
- [ ] **Relation Explorer**: Triplets são clicáveis e abrem o arquivo correto
- [ ] Itens sem localização mostram ícone "?" e "(no location)"
- [ ] Console mostra logs de diagnóstico dos explorers
- [ ] Console do desenvolvedor não mostra erros relacionados ao parser
- [ ] OntologyAnnotationExplorer não falha com erro "trim is not a function"

---

**Status:** Se após recarregar corretamente você ainda vê apenas o último chain, reporte o problema com:
1. Screenshot do Abstract Viewer
2. Logs do console do desenvolvedor (F12 > Console)
3. Arquivo .syn que você está testando
