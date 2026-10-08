# AGENTS.md

## Contas e CLIs

- Este projeto usa os tokens de `.claude/settings.local.json`, que valem só para esta pasta (GitHub: `genext-group`; Vercel: time `genext-group`).
- Nunca rodar `gh auth login`, `supabase login` ou `vercel login`, nem alterar configurações globais (git, gh, supabase, vercel).
- Todo comando da Vercel usa `--token $VERCEL_TOKEN` e o escopo da conta deste projeto: `--scope team_BonDL8Gwy9qy5eJR8qAtKF1M` (time `genext-group`). No PowerShell, use `$env:VERCEL_TOKEN`.
- Nunca exibir, registrar ou commitar tokens.
