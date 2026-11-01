# Cybrdek

A terminal-styled character sheet and rules reference for a cyberpunk tabletop game.
It runs as a website and an installable PWA (desktop and mobile). The game system is **Cyberpunk RED**
(chosen 2026-10-19). Keep the ruleset layer pluggable so another system could be added later.

The owner is learning Svelte but now mostly vibe-codes this project: AI agents (Claude Code and
Codex) write the code. Explain non-obvious Svelte patterns briefly in your summary. `AGENTS.md`
is a symlink to this file, so both agents follow the same rules.

## Stack
- SvelteKit 3 + Svelte 5, TypeScript, Vite. Config lives in `vite.config.ts` (no svelte.config.js).
- **Use Svelte 5 runes only** (`$state`, `$derived`, `$props`, `$effect`, snippets + `{@render}`).
  Never use legacy syntax (`export let`, `$:`, `<slot>`, stores for local state, `on:click`; use `onclick`).
- Import from lib with `#lib/...` (not `$lib`), always with the file extension (`#lib/engine/types.ts`, `#lib/rulesets/index.ts`). Page state is `$app/state`, not `$app/stores`.
- Fonts are self-hosted via @fontsource so the app works offline.

## Layout
- `src/lib/engine/`: core types, dice and rules math shared by every system. Keep it well tested.
- `src/lib/rulesets/<system>/`: per-system data (stats, skills, roles/classes, gear) plus
  system rules logic (derived stats, character creation). Verify rules against the rulebook.
- `src/lib/storage/`: on-device persistence (IndexedDB via Dexie). Browser-only.
- `src/lib/components/`: shared UI (terminal-styled).
- `src/routes/`: pages (`/`, `/characters`, `/characters/new`, `/characters/[id]`, `/rules`).

## Style
- Terminal/CRT aesthetic: colours come from the CSS variables in `src/app.css`. Don't hardcode colours.
- Mobile-first: everything must work on a phone. Buttons for everything, plus an optional command line later.
- Keep components small; scoped `<style>` blocks per component.

## Rulebooks
The rulebooks are copyrighted. Never commit PDFs or extracted rule text to the repo
(`static/rulebooks/` and `src/lib/rules-content/` are gitignored). Never make them publicly accessible.

## Commands
- `npm run dev`: dev server
- `npm run check`: type-check (run it after changes)
- `npm run build`: production build
- `npm test`: Vitest unit tests

## Workflow
- Every change goes through a branch and PR; `main` is protected and CI must pass. The owner approves merges.
- When two agents work at once, each uses its own git worktree and branch, and they don't edit the same files.
