LSP test fixture

Steps (manual):
1) Open this folder as the workspace: test/fixtures/lsp-project
2) Open lsp-project.syn
3) Run "Synesis: LSP Load Project"
4) Hover on: @paper01, field names (code, chain), and codes (usability)
5) Go-to-definition (Ctrl+Click) on @paper01 and on code "usability"
6) Inlay hints should show author/year after @paper01
7) Signature help should appear after typing a field name and ":"
8) Rename (F2) on "usability" should update both ITEM blocks
