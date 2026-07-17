# Repository Guidelines

## Project Structure & Module Organization

This is a static browser app for “Тихий список”.

- `index.html` is the main authenticated app shell.
- `login.html` is the Supabase auth screen.
- `script.js` contains app state, rendering, task logic, statistics, recurring tasks, account UI, and Supabase sync calls.
- `auth.js` handles sign in, sign up, password reset, and auth UI behavior.
- `supabase-client.js` stores Supabase client setup and redirect URLs.
- `styles.css` contains all layout, theme, responsive, and component styling.

There is no build directory, package manifest, or formal test suite at the moment.

## Build, Test, and Development Commands

Run locally from the repository root:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`. Use a static server instead of `file://` because auth redirects and browser behavior are closer to production.

Basic validation:

```bash
node --check script.js
node --check auth.js
node --check supabase-client.js
git diff --check
```

These commands catch JavaScript syntax errors and whitespace issues before committing.

## Coding Style & Naming Conventions

Use plain HTML, CSS, and JavaScript. Keep code dependency-free unless a change clearly requires a library. Prefer `const`/`let`, small helper functions, and descriptive names such as `renderDaySwitcher`, `togglePriority`, or `loadCloudData`.

CSS class names use kebab-case (`boot-loader`, `task-priority`, `account-row`). Keep UI states readable with `is-*` classes (`is-active`, `is-booting`, `is-focus`).

When changing CSS or JS loaded by `index.html` or `login.html`, update the query-string cache key, for example `styles.css?v=boot-loader-1`.

## Testing Guidelines

There is no automated test framework yet. For UI changes, verify manually in light and dark themes, desktop and mobile widths, and authenticated/unauthenticated flows where relevant. Do not wipe or seed production Supabase data during testing.

For risky UI behavior, prefer a small browser smoke test with mocked Supabase responses.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries, for example `Refine stats theme and account UI` or `Add calm boot loader and inline focus marker`. Follow that style.

Before a PR or deploy, include: what changed, how it was tested, screenshots for visible UI work, and any Supabase/auth impact. Deploy to GitHub Pages only after explicit approval.

Never deploy, push, or publish changes unless the owner explicitly asks for it in the current conversation.

## Security & Configuration Tips

Treat Supabase keys and redirect URLs in `supabase-client.js` carefully. Do not introduce destructive database operations, migrations, or data resets without explicit owner approval.
