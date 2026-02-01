# Checklist de Testes — Synesis Explorer

Este documento descreve testes manuais para validar todas as funcionalidades
da extensao. Os exemplos usam os fixtures em `test/fixtures/lsp-project`.

## Preparacao
- [ ] **Abrir workspace de teste**
  - Teste: abrir a pasta `test/fixtures/lsp-project` no VS Code e abrir `lsp-project.syn`.
  - Esperado: extensao ativa, icone **Synesis Explorer** aparece na Activity Bar e as views sao carregadas.
- [ ] **Ativacao por arquivo (sem .synp)**
  - Teste: abrir `test/fixtures/sample.syn` em um workspace sem `.synp`.
  - Esperado: linguagem reconhecida como Synesis e a extensao ativa via `onLanguage:synesis`.
- [ ] **Word wrap automatico**
  - Teste: apos ativacao, conferir em Settings do workspace o `editor.wordWrap`.
  - Esperado: `wordWrap` definido como `on` no workspace.

## Linguagem, sintaxe e editor
- [ ] **Associacao de linguagem**
  - Teste: abrir arquivos `.syn`, `.synt`, `.synp`, `.syno` e confirmar o modo de linguagem.
  - Esperado: todos reconhecidos como `Synesis`.
- [ ] **Syntax highlighting basico**
  - Teste: em um `.syn`, conferir realce de `SOURCE`, `ITEM`, `ONTOLOGY`, `END`, campos e `@bibref`.
  - Esperado: keywords e campos com cores distintas e consistentes.
- [ ] **Comentarios com #**
  - Teste: usar `Ctrl+/` em uma linha.
  - Esperado: `#` inserido/removido corretamente.
- [ ] **Auto closing e pares**
  - Teste: digitar `[` `(` `"` em um `.syn`.
  - Esperado: fechamento automatico inserido.
- [ ] **Folding por blocos**
  - Teste: usar folding em blocos `SOURCE/ITEM/ONTOLOGY/FIELD/PROJECT/TEMPLATE`.
  - Esperado: VS Code reconhece e permite recolher/expandir blocos corretamente.

## Icones e temas
- [ ] **File icon theme**
  - Teste: selecionar "Synesis File Icons" em `File > Preferences > File Icon Theme`.
  - Esperado: icones especificos para `.syn`, `.synt`, `.synp`, `.syno`, `.bib`.
- [ ] **Temas de cores**
  - Teste: selecionar "Synesis Dark" e "Synesis Light".
  - Esperado: tema muda e permanece consistente com os arquivos Synesis.

## LSP (com `synesis-lsp` disponivel)
- [ ] **Status bar do LSP**
  - Teste: observar item "Synesis LSP" no status bar.
  - Esperado: mostra estados `Loading`, `Ready`, `Error` ou `Disabled` conforme o caso.
- [ ] **LSP Load Project**
  - Teste: executar `Synesis: LSP Load Project`.
  - Esperado: progresso visivel e status `Ready` apos finalizar.
- [ ] **Diagnosticos**
  - Teste: inserir erro de sintaxe em `.syn`.
  - Esperado: sublinhado/diagnostico em tempo real.
- [ ] **Hover (bibref, campo, codigo)**
  - Teste: passar o mouse em `@paper01`, em `code:` e em `usability`.
  - Esperado: tooltip com informacoes contextuais.
- [ ] **Go to Definition (Ctrl+Click)**
  - Teste: `Ctrl+Click` em `@paper01` e em `usability`.
  - Esperado: navegacao para a definicao correspondente.
- [ ] **Autocompletar**
  - Teste: digitar `@` e nomes de campos.
  - Esperado: sugestoes de bibrefs e campos aparecem.
- [ ] **Rename (F2)**
  - Teste: F2 em `usability` e renomear.
  - Esperado: todas as ocorrencias sao atualizadas.
- [ ] **Inlay Hints**
  - Teste: observar `@paper01` em `.syn`.
  - Esperado: autor/ano exibidos inline.
- [ ] **Document Symbols (Outline)**
  - Teste: abrir "Outline" no painel lateral.
  - Esperado: hierarquia `SOURCE/ITEM/ONTOLOGY` visivel.
- [ ] **Signature help (se suportado)**
  - Teste: digitar `code:` e verificar ajuda.
  - Esperado: ajuda contextual aparece (se o LSP suportar).
- [ ] **LSP desabilitado**
  - Teste: setar `synesisExplorer.lsp.enabled = false` e recarregar.
  - Esperado: status bar mostra "LSP Disabled"; explorers continuam funcionais via parsing local.

## Reference Explorer
- [ ] **Listagem e contagem**
  - Teste: abrir `lsp-project.syn`.
  - Esperado: `@paper01` listado com `1 file(s), 2 item(s)`.
- [ ] **Navegacao**
  - Teste: clicar em uma ocorrencia.
  - Esperado: editor abre no arquivo/linha da fonte.
- [ ] **Filtro**
  - Teste: usar `Filter References` e digitar parte do bibref.
  - Esperado: lista filtrada (case-insensitive).
- [ ] **Refresh**
  - Teste: editar `.syn` e salvar; ou usar `Refresh References`.
  - Esperado: contagem/lista atualiza.
- [ ] **Rename Reference (context menu)**
  - Teste: clicar com direito no item e renomear.
  - Esperado: referencias atualizadas (com LSP ativo).

## Code Explorer
- [ ] **Listagem de codigos**
  - Teste: abrir `lsp-project.syn`.
  - Esperado: `usability` e `reliability` listados.
- [ ] **Icone de ontologia (com LSP)**
  - Teste: verificar icones com LSP ativo e ontologia carregada.
  - Esperado: codigos definidos na ontologia com icone distinto.
- [ ] **Ocorrencias (modo local)**
  - Teste: desabilitar LSP e expandir um codigo.
  - Esperado: ocorrencias listadas com arquivo/linha e clique abre a posicao.
- [ ] **Filtro**
  - Teste: usar `Filter Codes`.
  - Esperado: lista filtrada por substring.
- [ ] **Go to Definition / Rename (context menu)**
  - Teste: clicar com direito em um codigo.
  - Esperado: "Go to Definition" navega; "Rename Code" atualiza ocorrencias (com LSP).

## Relation Explorer (CHAIN)
- [ ] **Preparar CHAIN no template**
  - Teste: adicionar um campo CHAIN no `.synt` e salvar.
  - Esperado: view "Relations" aparece quando ha chains.
  - Exemplo:
    ```
    FIELD chain TYPE CHAIN
        SCOPE ITEM
    END FIELD
    ```
- [ ] **Adicionar CHAIN em `.syn`**
  - Teste: em um ITEM, adicionar `chain: usability -> reliability` e salvar.
  - Esperado: Relation Explorer mostra relacao `relates_to` com triplets.
- [ ] **Filtro e navegacao**
  - Teste: usar `Filter Relations` e clicar no triplet.
  - Esperado: lista filtrada e navegacao para a ocorrencia.

## Ontology Topics Explorer
- [ ] **Visibilidade condicional**
  - Teste: abrir `lsp-ontology.syno`.
  - Esperado: view "Ontology Topics" aparece; some ao sair do `.syno`.
- [ ] **Listagem por campo**
  - Teste: expandir o campo `topic`.
  - Esperado: valores aparecem como `[1] usability`, `[2] reliability` (ordenados).
- [ ] **Navegacao**
  - Teste: clicar em uma ocorrencia.
  - Esperado: editor abre no `.syno` correto.
- [ ] **Filtro**
  - Teste: usar `Filter Ontology Topics`.
  - Esperado: lista filtrada por nome de campo ou valor.

## Ontology (Annotations)
- [ ] **Visibilidade condicional**
  - Teste: abrir `lsp-project.syn`.
  - Esperado: view "Ontology (Annotations)" aparece; some ao sair do `.syn`.
- [ ] **Anotacoes por codigo**
  - Teste: expandir `topic` e um valor.
  - Esperado: lista conceitos e ocorrencias ligadas aos codigos usados no `.syn`.
- [ ] **Navegacao**
  - Teste: clicar em uma ocorrencia.
  - Esperado: editor abre na linha correta no `.syn`.
- [ ] **Refresh**
  - Teste: editar `.syn` e salvar; ou usar `Refresh Ontology (Annotations)`.
  - Esperado: view atualiza com novos codigos.

## Graph Viewer
- [ ] **Abrir via comando/atalho**
  - Teste: `Synesis: Show Relation Graph` ou `Ctrl+Alt+G`.
  - Esperado: webview abre com grafo Mermaid para o bibref atual.
- [ ] **Sem CHAIN**
  - Teste: chamar o comando sem CHAIN definido.
  - Esperado: aviso "No chain relations found...".
- [ ] **Zoom**
  - Teste: usar botoes `+/-/Reset` e `Ctrl+scroll`.
  - Esperado: zoom aplicado e indicador de % atualizado.

## Abstract Viewer
- [ ] **Abrir via comando/atalho**
  - Teste: `Synesis: Show Abstract` ou `Ctrl+Shift+A`.
  - Esperado: webview abre com metadados e abstract.
- [ ] **Highlights de trechos**
  - Teste: verificar trechos destacados no abstract.
  - Esperado: trechos com `<mark>` e legenda com notas/codes.
- [ ] **Sem abstract**
  - Teste: usar bibref sem abstract.
  - Esperado: aviso e exibicao apenas de metadados.

## Comandos e menus
- [ ] **Command Palette**
  - Teste: executar todos os comandos listados (Refresh/Filter/Show).
  - Esperado: cada comando funciona e afeta a view correta.
- [ ] **Context menu de TreeView**
  - Teste: clique direito em Reference/Code.
  - Esperado: "Rename" e "Go to Definition" disponiveis conforme o tipo.

## Atualizacoes automaticas (watchers)
- [ ] **Salvar `.syn`**
  - Teste: editar e salvar `.syn`.
  - Esperado: Reference/Code/Relation/Ontology(Annotations) atualizam automaticamente.
- [ ] **Salvar `.syno`**
  - Teste: editar e salvar `.syno`.
  - Esperado: Ontology Topics e Ontology(Annotations) atualizam.
- [ ] **Salvar `.synp` ou `.synt`**
  - Teste: editar e salvar qualquer um.
  - Esperado: cache de template invalidado e todas as views atualizam.
- [ ] **Salvar `.bib` (com LSP)**
  - Teste: editar `.bib` e salvar.
  - Esperado: LSP recarrega o projeto (status "Loading" -> "Ready").
