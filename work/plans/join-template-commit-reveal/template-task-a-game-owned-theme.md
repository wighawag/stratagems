---
title: A game owns its theme through one file the template's app.css imports
slug: a-game-owned-theme
spec: games-on-this-foundation
blockedBy: []
---

# A game cannot have a palette of its own without editing app.css, which every cascade then conflicts on

DRAFTED IN STRATAGEMS, NOT YET ON template-commit-reveal's `work` BRANCH: P8 of step 6c in stratagems' port plan (`join-template-commit-reveal` branch, `work/plans/join-template-commit-reveal.md`), decided with the maintainer on 2026-10-26. It goes to `work/tasks/backlog/a-game-owned-theme.md` there once the maintainer approves it; nothing has been pushed.

## Start here, from a cold context

```sh
cat CONTEXT.md
git show main:web/src/app.css | sed -n 1,140p   # the variables a theme owns: :root, .dark, @theme inline
git show main:web/src/lib/core/ui/README.md | grep -n -i theme
```

## What is wrong today

`web/src/app.css` is the stem's in every game (reveal-or-die's and stratagems' are byte-identical to it), and it holds both the framework's CSS (Tailwind, the layer variables, the coarse-pointer rules) and the THEME: the `:root` and `.dark` colour variables that `bg-*` and `text-*` resolve to. `core/ui/README.md` already says a theme owns those variables, and there is nowhere for a game's theme to live except an edit to `app.css`, which every later cascade then conflicts on. stratagems had a palette of its own (`web/src/css/palette.css`, deleted in its step 6c; at 54cafc4d) and dropped it rather than pay that conflict.

## Proposed

- `app.css` imports one theme file (for instance `src/theme.css`) where the `:root` and `.dark` colour variables now are, and keeps everything else.
- The template's theme file holds today's variables unchanged, so the template looks the same.
- A game replaces the theme file and nothing else; its `.offshoot-omissions` (or its own copy) says so, and every cascade of `app.css` merges cleanly.
- `core/ui/README.md` names the file.

## Acceptance

- the template's look is unchanged (its e2e passes; a screenshot of the home page and `/play/` matches);
- `app.css` holds no colour variable;
- a stub theme with other colours, swapped in, changes the look and `check`s to 0;
- cascaded to every node; stratagems then moves its palette into its theme file as a step of its own.
