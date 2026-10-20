<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenção de trabalho do projeto

- **Sempre** atualizar `historico.md` junto com qualquer mudança de
  comportamento (seção nova ou bug novo na tabela de bugs).
- **Sempre** rodar `npm run typecheck`, `npm run lint` e `npm run build`
  antes de commitar.
- **Sempre** fazer `git commit` e `git push origin main` depois de validar —
  não deixar alteração local pendente.
- O `historico.md` é o registro vivo do projeto: ele é a referência para
  entender *por que* cada decisão foi tomada.

