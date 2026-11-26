# Development

## Build

The project uses four Vite configs because each MV3 context has different
requirements:

| Config | Entry | Format | Output |
|---|---|---|---|
| `vite.config.ts` | `sidepanel.html`, `options.html` | ESM + HTML | pages + `assets/*-[hash].js/css` |
| `vite.background.config.ts` | `src/background/service-worker.ts` | ESM (lib) | `assets/background.js` |
| `vite.content.config.ts` | `src/content/index.ts` | IIFE | `assets/content.js` |
| `vite.offscreen.config.ts` | `src/offscreen.ts` | IIFE | `assets/offscreen.js` |

The first build cleans `dist/` and the others use `emptyOutDir: false`. Static
files (`manifest.json`, icons, `offscreen.html`) come from `public/`.

## Workflow

1. Edit the code in `src/` or `plugin/`.
2. `npm run verify` (typecheck + build).
3. Reload the extension at `chrome://extensions`.
4. For the plugin: `npm run install:plugin` (copies `browser-relay.ts`, the
   `opencode-browser.agent.md` template and the `browser-relay` skill) and then
   `opencode service restart`. The service loads plugin and agent at startup;
   without the restart, the old version stays in memory. Confirm with
   `curl http://127.0.0.1:8799/health`.

> Chrome caches the service worker. If behavior does not change after the
> build, click **Reload** on the extension or close and reopen the test browser.

## Automated tests

The suite uses **Vitest** with the `jsdom` environment, a global mock of the
Chrome APIs and V8 coverage. Tests live in `tests/`, mirroring `src/`.

```bash
npm test                 # full suite
npm run test:coverage    # coverage with an 80% minimum (lines, functions, branches, statements)
npm run test:watch       # watch mode
```

| Area | Test coverage |
|---|---|
| `src/background/opencode` | API client, SSE parser and errors |
| `src/background` | Permissions, tab groups, CDP, recording and service worker |
| `src/background/tools` | The 18 tools, error paths and permissions |
| `src/content` | Accessibility tree, DOM actions and indicator |
| `src/offscreen` | Keepalive, sound and GIF encoding |
| `src/components`, `src/sidepanel`, `src/options` | UI components and flows |
| `tests/plugin` | Agent creation/update and skill installation/update |

`npm run typecheck` covers only `src/` (`tsconfig.json` with `include:
["src"]`). The plugin is validated by ESLint, `bun build` and the agent tests.

Test helpers live in `tests/helpers/`:

| Helper | Role |
|---|---|
| `chrome.ts` | Complete mock of the Chrome APIs (storage, tabs, tabGroups, debugger, …) |
| `factories.ts` | Factories for models, sessions, agents and the tool context |

## Continuous integration

| Workflow | File | What runs |
|---|---|---|
| Tests | `.github/workflows/test.yml` | `npm run test:coverage`, coverage summary in the job and as a PR comment, `coverage-report` artifact |
| Code quality | `.github/workflows/quality.yml` | `npm run lint`, `npm run typecheck`, `npm run build` and artifact checks |
| GitHub Pages | `.github/workflows/pages.yml` | Publishes the guide and the videos on changes to `main` that touch `web/`, `assets/videos/` or the guide source; also supports manual runs |
| Release | `.github/workflows/release.yml` | On `v*` tags, checks that `package.json` and `public/manifest.json` carry the tag version, compiles the extension, packages extension + plugin + installer into a ZIP and creates the release |

The Tests and Quality workflows run on every `pull_request` to `main` and on
`push` to `main`.

The first Pages deploy may require setting the source under **Settings → Pages**
to **GitHub Actions**. The release package is downloaded by the user guide and
installs the plugin with `node scripts/install-plugin.mjs`.

The `main` branch is protected by a GitHub ruleset:

- A PR is required before merging (no required approvals, for solo use).
- Required checks: **Testes e cobertura** and **Lint, tipos e build**.
- No direct push, no force-push and no branch deletion.

## Release

The version lives in three places and must match in all three: `package.json`,
`package-lock.json` and `public/manifest.json`. The `tests/versions.test.ts`
test covers that equality, and the release workflow rejects the tag if it does
not match.

```bash
npm version 0.1.2 --no-git-tag-version   # package.json and package-lock.json
# edit "version" in public/manifest.json to 0.1.2
npm run verify && npm test
git commit -am "chore(release): v0.1.2"
git tag -a v0.1.2 -m "v0.1.2"
git push origin main --follow-tags       # pushing the tag triggers the release
```

Without updating the manifest, Chrome keeps showing the old version at
`chrome://extensions` and in package updates; that is what happened in v0.1.1,
which shipped with the manifest still on `0.1.0`.

## Manual testing checklist

| # | Step | Expected result |
|---|---|---|
| 1 | `opencode pair` + paste the link | Panel shows "online" and the model list |
| 2 | Create a conversation and send a prompt | Text and reasoning streaming |
| 3 | Ask the agent to open a page | Permission card; then `navigate` succeeds |
| 4 | Ask for `read_page` | Tree with refs in the result |
| 5 | Ask for a click by ref | Page reacts; card `ok` |
| 6 | Ask for `frames=all` on a page with an iframe | Refs `f<frameId>_ref_N` |
| 7 | Ask for a file upload | The file name appears on the page |
| 8 | `gif_creator start` → actions → `export` | GIF saved to Downloads |
| 9 | Type `/` in the composer | Menu with the OpenCode commands |
| 10 | Switch the model | The session uses the new model and keeps the `opencode-browser` agent |
| 11 | Close the panel and request an action | Permission popup opens |
| 12 | `npm run build` + reload | No errors in the service worker console |
| 13 | `npm run install:plugin` + `opencode service restart` | Agent v6, `browser-relay` skill and relay version 6 loaded |
| 14 | Ask to close a tab | `browser_tabs_close_tab` tool (wire `tabs_close`) asks for permission and closes |

## Diagnostics

| What | How |
|---|---|
| Service worker console | `chrome://extensions` → Details → "service worker" |
| Relay status | `curl http://127.0.0.1:8799/health` (version 6) |
| Token and port | `cat "${XDG_RUNTIME_DIR:-$HOME/.cache}/opencode-browser/relay.json"` |
| Installed agent | `grep opencode-browser-agent ~/.config/opencode/agents/opencode-browser.md` (v6) |
| OpenCode log | `~/.local/share/opencode/log/opencode.log` (Windows: `%USERPROFILE%\.local\share\opencode\log`); look for `browser-relay` |
| OpenCode plugins | `~/.config/opencode/plugins` (Windows: `%USERPROFILE%\.config\opencode\plugins`) |
| Conversations folder | `~/.opencode-browser-extensions` (created by the plugin) |
| Test a tool directly | `POST /tool` with `x-relay-token` (see [plugin.md](arquitetura/plugin.md)) |
| Tool list | Harness with a fake `Plugin.define`, or `opencode plugin list` |

## Conventions

- Code and documentation in Brazilian Portuguese; identifiers in English.
- Shared types in `src/shared/`; no duplicated types in the modules.
- Error messages aimed at the end user, in Portuguese, saying what to do.
- Commits in Conventional Commits (`feat:`, `fix:`, `docs:`…).
- Markdown sources in `docs/`, HTML pages in `web/`; no documentation file inside `src/`.

## Dependencies

| Dependency | Use |
|---|---|
| `react` / `react-dom` | Panel, options and permission UI |
| `react-markdown` + `remark-gfm` | Rendering of responses |
| `gifenc` | GIF encoding in the offscreen document |
| `vite`, `@vitejs/plugin-react`, `typescript` | Build and types |
| `@types/chrome` | Browser API types |
