# Synesis Explorer

[![Versão](https://img.shields.io/badge/versão-0.4.0-blue.svg)](CHANGELOG.md)
[![VSCode](https://img.shields.io/badge/VSCode-%3E%3D1.60.0-blue.svg)](https://code.visualstudio.com/)
[![Licença](https://img.shields.io/badge/licença-MIT-green.svg)](LICENSE)

**[Read in English](README.md)**

Uma extensão do Visual Studio Code para navegar e visualizar arquivos de síntese de conhecimento Synesis (`.syn`, `.synt`, `.synp`, `.syno`).

![Synesis Explorer](synesis-icon.png)

## Visão Geral

O Synesis Explorer fornece um conjunto abrangente de ferramentas para trabalhar com o formato de síntese de conhecimento Synesis, projetado para pesquisa qualitativa e análise bibliométrica. A extensão oferece navegação baseada em árvore, visualização de relacionamentos e integração com referências BibTeX.

## Funcionalidades

### Integração LSP

Suporte completo ao Language Server Protocol para edição e navegação avançadas.

- **Diagnósticos**: Detecção de erros de sintaxe em tempo real com sublinhados
- **Realce Semântico**: Colorização contextual para keywords, bibrefs, campos e códigos
- **Hover**: Informações contextuais para `@bibref`, campos e códigos
- **Ir para Definição**: `Ctrl+Click` em `@bibref` ou código para ir à definição
- **Autocompletar**: `@bibrefs`, códigos da ontologia e campos do template
- **Renomear Símbolo**: `F2` para renomear códigos ou referências em todos os arquivos
- **Inlay Hints**: Autor e ano exibidos inline após `@bibref`
- **Símbolos do Documento**: Outline view com hierarquia SOURCE/ITEM/ONTOLOGY
- Operacao somente LSP para dados (sem fallback regex)
- Exploradores exibem placeholder enquanto o LSP inicia ou quando esta desativado

### Reference Explorer (Explorador de Referências)

Navegue por todas as referências bibliográficas (`SOURCE @bibref`) no seu workspace com contagem de itens.

- Lista todos os blocos `SOURCE` com seus identificadores `@bibref`
- Mostra o número de blocos `ITEM` para cada referência
- Clique para navegar diretamente para a localização da fonte
- Clique direito para renomear referências em todos os arquivos (requer LSP)
- Filtre referências por nome
- Atualização automática ao salvar arquivos

### Code Explorer (Explorador de Códigos)

Navegue por todos os códigos definidos nos seus arquivos de síntese.

- Lista valores de campos `CODE`
- Extrai códigos de campos `CHAIN`
- Consciente do template: adapta-se às definições de campo do seu projeto
- Ícones diferenciados para códigos definidos na ontologia vs. apenas usados
- Clique direito para ir à definição na ontologia (requer LSP)
- Clique direito para renomear códigos em todos os arquivos (requer LSP)
- Filtre códigos por nome
- Clique para ir ao uso do código

### Relation Explorer (Explorador de Relações)

Visualize relacionamentos definidos em campos CHAIN como triplets.

- Exibe relações como: `Sujeito → Relação → Objeto`
- Suporta chains qualificadas e simples
- Filtre relações por qualquer componente
- Navegue para definições de relações

### Ontology Topics Explorer (Explorador de Tópicos de Ontologia)

Navegue por definições de ontologia em arquivos `.syno`.

- Lista valores de campos `TOPIC`, `ORDERED` e `ENUMERATED`
- Organizado por nome de campo
- Visível apenas ao editar arquivos `.syno`

### Ontology Annotations Explorer (Explorador de Anotações de Ontologia)

Visualize anotações de ontologia diretamente de arquivos `.syn`.

- Mostra como códigos de ontologia são aplicados aos itens
- Referência cruzada entre síntese e ontologia

### Graph Viewer (Visualizador de Grafos)

Visualização interativa de redes de relacionamento usando Mermaid.js.

- Renderiza relações CHAIN como um grafo direcionado
- Consciente do contexto: mostra relações para a referência atual ou arquivo inteiro
- Atalho de teclado: `Ctrl+Alt+G` (Mac: `Cmd+Shift+G`)

### Abstract Viewer (Visualizador de Abstracts)

Exibe abstracts BibTeX com trechos destacados.

- Analisa arquivos `.bib` vinculados
- Destaca trechos de texto da sua síntese
- Atalho de teclado: `Ctrl+Shift+A` (Mac: `Cmd+Shift+A`)

### Syntax Highlighting (Realce de Sintaxe)

Suporte completo de sintaxe para formatos de arquivo Synesis.

- Palavras-chave: `SOURCE`, `ITEM`, `ONTOLOGY`, `END`
- Nomes e valores de campos
- Referências BibTeX (`@identificador`)
- Relações chain
- Comentários

### Temas

Temas de cores incluídos, otimizados para arquivos Synesis.

- **Synesis Dark**: Tema escuro com legibilidade aprimorada
- **Synesis Light**: Tema claro para trabalho diurno

### Ícones de Arquivo

Ícones de arquivo personalizados para fácil identificação.

- `.syn` - Arquivos de síntese
- `.synt` - Arquivos de template
- `.synp` - Arquivos de projeto
- `.syno` - Arquivos de ontologia
- `.bib` - Arquivos BibTeX

## Instalação

### A partir de VSIX (Local)

1. Baixe o arquivo `.vsix` em [Releases](https://github.com/your-username/synesis-explorer/releases)
2. Abra o VSCode
3. Pressione `Ctrl+Shift+P` e execute "Extensions: Install from VSIX..."
4. Selecione o arquivo baixado

### A partir do Código-fonte

```bash
git clone https://github.com/your-username/synesis-explorer.git
cd synesis-explorer
npm install
npm run build
```

Pressione `F5` para abrir o Extension Development Host.

### Gerando o Pacote VSIX

Para criar um pacote `.vsix` distribuível:

```bash
# Instalar vsce globalmente (se ainda não instalado)
npm install -g @vscode/vsce

# Compilar a extensão
npm run build

# Empacotar a extensão
npm run package
```

Isso gerará um arquivo `synesis-explorer-x.x.x.vsix` na raiz do projeto.

## Uso

### Início Rápido

1. Abra uma pasta contendo arquivos Synesis (`.syn`, `.syno`, etc.)
2. Clique no ícone do Synesis Explorer na Activity Bar (barra lateral)
3. Navegue por referências, códigos e relações nas visualizações em árvore
4. Clique em qualquer item para navegar até sua localização

### Tipos de Arquivo

| Extensão | Descrição |
|----------|-----------|
| `.syn` | Arquivo principal de síntese contendo blocos SOURCE e ITEM |
| `.synt` | Arquivo de template definindo estrutura de campos |
| `.synp` | Arquivo de projeto com includes e configuração |
| `.syno` | Arquivo de ontologia com definições TOPIC/ORDERED/ENUMERATED |

### Atalhos de Teclado

| Atalho | Comando | Descrição |
|--------|---------|-----------|
| `Ctrl+Alt+G` | Show Graph | Exibir grafo de relações (Mac: `Cmd+Shift+G`) |
| `Ctrl+Shift+A` | Show Abstract | Exibir abstract BibTeX (Mac: `Cmd+Shift+A`) |

### Comandos

Todos os comandos estão disponíveis via Command Palette (`Ctrl+Shift+P`):

- `Synesis: LSP Load Project` - Carregar/recarregar manualmente o projeto no servidor LSP
- `Synesis: Show Relation Graph` - Abrir o visualizador de grafos
- `Synesis: Show Abstract` - Abrir o visualizador de abstract
- `Refresh References` - Re-escanear lista de referências
- `Filter References` - Filtrar por nome de referência
- `Refresh Codes` - Re-escanear lista de códigos
- `Filter Codes` - Filtrar por nome de código
- `Refresh Relations` - Re-escanear lista de relações
- `Filter Relations` - Filtrar por componente de relação
- `Refresh Ontology Topics` - Re-escanear tópicos de ontologia
- `Filter Ontology Topics` - Filtrar por nome de tópico

Comandos de menu de contexto (clique direito nas tree views):

- `Go to Definition` - Navegar para definição do código no `.syno` (Code Explorer)
- `Rename Code` - Renomear código em todos os arquivos (Code Explorer)
- `Rename Reference` - Renomear referência em todos os arquivos (Reference Explorer)

## Configuração

### Servidor LSP

Por padrão a extensão inicia o LSP com `synesis-lsp` a partir do PATH. Se você tem o
executável standalone em outro local, aponte a configuração para ele.

```json
{
  "synesisExplorer.lsp.pythonPath": "synesis-lsp"
}
```

O Synesis Explorer opera em modo somente-LSP para dados.
Se o servidor ainda esta inicializando, os explorers exibem um placeholder ate o LSP ficar pronto.
Se o LSP estiver desativado, os explorers exibem um placeholder de LSP desativado.

### Ativando Ícones de Arquivo

1. Abra as Configurações do VSCode
2. Vá em `File > Preferences > File Icon Theme`
3. Selecione "Synesis File Icons"

### Ativando Temas de Cores

1. Abra as Configurações do VSCode
2. Vá em `File > Preferences > Color Theme`
3. Selecione "Synesis Dark" ou "Synesis Light"

## Estrutura do Projeto

```
Synesis-Explorer/
├── extension.js           # Ponto de entrada
├── src/
│   ├── core/              # Serviços principais
│   │   ├── templateManager.js
│   │   ├── projectLoader.js
│   │   ├── workspaceScanner.js
│   │   └── fieldRegistry.js
│   ├── lsp/               # Cliente LSP
│   │   └── synesisClient.js
│   ├── services/          # Serviços de dados
│   │   └── dataService.js # Adapter: acesso LSP-only
│   ├── parsers/           # Parsers de arquivo
│   │   ├── synesisParser.js
│   │   ├── ontologyParser.js
│   │   ├── templateParser.js
│   │   ├── chainParser.js
│   │   └── bibtexParser.js
│   ├── explorers/         # Provedores de tree view
│   │   ├── reference/
│   │   ├── code/
│   │   ├── relation/
│   │   └── ontology/
│   ├── viewers/           # Painéis webview
│   │   ├── graphViewer.js
│   │   └── abstractViewer.js
│   └── utils/
│       └── mermaidUtils.js
├── syntaxes/              # Gramáticas TextMate
├── themes/                # Temas de cores
├── icons/                 # Ícones de arquivo
└── test/                  # Testes unitários
```

## Requisitos

- Visual Studio Code 1.60.0 ou superior

## Dependências

- [bibtex-parse-js](https://www.npmjs.com/package/bibtex-parse-js) - Parser BibTeX
- [vscode-languageclient](https://www.npmjs.com/package/vscode-languageclient) - Cliente LSP para VSCode (v9.x)

## Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para enviar issues e pull requests.

1. Faça um fork do repositório
2. Crie sua branch de feature (`git checkout -b feature/funcionalidade-incrivel`)
3. Commit suas mudanças (`git commit -m 'Adiciona funcionalidade incrível'`)
4. Push para a branch (`git push origin feature/funcionalidade-incrivel`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## Agradecimentos

- Especificação do formato Synesis e compilador
- Documentação da API de Extensões do VSCode
- Mermaid.js para visualização de grafos

## Changelog

Veja [CHANGELOG.md](CHANGELOG.md) para uma lista de mudanças.

---

**Synesis Explorer** - Potencializando a pesquisa qualitativa com síntese estruturada de conhecimento.
