# bug-fix-agent

LangGraph.js pipeline: ticket → triage → planner → complexity check → coder → reviewer → git (branch, commit, push, PR). Every run is logged to SQLite (`data/agent_runs.db`). The repo it fixes is `../Test-app` (spec in `../CLAUDE.md`).

## Run (from this folder)
| Command | What it does |
|---|---|
| `make reset-target` | Reset `../Test-app` to a pristine `origin/main` (bugs restored, local `auto-fix/*` branches dropped; the remote is never touched) |
| `make run` | Run the pipeline on `LOCAL_TICKET_PATH` (Docker) |
| `make test` / `make typecheck` | Tests / tsc (Docker). `npm test` also works on the host |
| `make db` | Recent `agent_runs` rows |
| `make shell`, `make build`, `make install`, `make clean` | Docker helpers |

Local test loop: `make reset-target` → set `GROQ_API_KEY` in `.env` → set `LOCAL_TICKET_PATH` to `../Test-app/tickets/ticket-00N.json` → `make run` → inspect the pushed `auto-fix/*` branch on GitHub (or `git -C ../Test-app diff main <auto-fix branch>`) → `make db`.

## Config (`.env`)
`LLM_PROVIDER` (`groq` default | `gemini`), `GROQ_API_KEY` / `GOOGLE_API_KEY`, optional `LLM_MODEL`, `PLANNER_MODEL` / `CODER_MODEL` / `REVIEWER_MODEL`, `LLM_TEMPERATURE`, `LLM_DELAY_MS`, `GITHUB_TOKEN`, `GITHUB_OWNER/REPO` (the *target* repo where PRs/issues go: `saravana-devx/Test-app`), `USE_LOCAL_TICKET`, `LOCAL_TICKET_PATH`, `TARGET_REPO_PATH` (repo the agent edits/commits/pushes in; default = cwd), `GITHUB_DRY_RUN=true` (issues/PRs are logged and get `dry-run://` URLs — branches are still really pushed to the target's `origin`), `GITHUB_BASE_BRANCH` (default `main`), `GIT_AUTHOR_NAME/EMAIL`.

`fix-plan.md` and `data/` always live here, never in the target repo. Docker mounts this folder at `/app` and the target at `/Test-app` (so `../Test-app` in `.env` resolves the same on host and in the container); pushes use https with `GITHUB_TOKEN`.

## Behaviour notes (where code differs from the original spec)
- HIGH is skipped; LOW with >50 estimated lines escalates (exactly 50 continues); MEDIUM has no limit. Tickets fetched from GitHub with no severity label count as HIGH.
- Ticket JSON may carry `file_hint`; that file is given to the planner first.
- Planner throws if "Estimated Lines Changed" can't be parsed.
- Coder: manual tool loop (max 20 steps), file tools sandboxed to the target repo, true original kept across retries; `retryCount` +1 per run.
- Reviewer: separate LLM call, fails closed on bad JSON, empty diff is rejected; after 3 rejections it creates the `[Auto-Fix Failed]` issue itself and stops.
- Git node stages only the files in `modifiedFiles` (not `git add .`), never commits to `main`, returns to the original branch after pushing.
- `updateRun` is a no-op without a `runId` and only accepts whitelisted columns; files >50KB are stored as `[truncated: N chars]`.
- Nodes are factories (`createPlannerNode(llm, root, planDir)` etc.) so `src/*.test.ts` and `graph.test.ts` can run everything with fake LLMs and a fake GitHub.

## LLM layer (`src/llm/`) — changing model/provider is config, not code
Strategy + registry: nodes only call `createLLM("planner" | "coder" | "reviewer")` and `rateLimitDelay()`.
- `types.ts` — `LLMProvider` interface (name, apiKeyEnv, defaultModel, defaultDelayMs, rateLimitWaitMs, `create()`).
- `providers/groq.ts`, `providers/gemini.ts` — one file per provider. `registry.ts` maps `LLM_PROVIDER` → provider.
- `index.ts` — `getLLMSettings(role)` / `createLLM(role)`: reads env, fails fast with a clear error if the key is missing.
- `retry.ts` — shared policy: `maxRetries` 5, wait on 429, rethrow 400/401/403/404 immediately.
- `recovery.ts` — `invokeRecovering`: when the provider rejects a generation (`tool_use_failed`, `output_parse_failed` — the model called a non-existent tool or emitted malformed output), append a corrective message and retry (max 3). Used by planner, coder and reviewer. Blind retries are pointless because an identical request fails identically.
- Rate limit: `utils/delay.ts` waits the provider's `defaultDelayMs` (groq 3s, gemini 15s) before the planner/coder/reviewer calls and between coder tool-loop calls; `LLM_DELAY_MS` overrides.
- Switch model: set `LLM_MODEL` (or a per-role `*_MODEL`). Switch provider: `LLM_PROVIDER=gemini`. Add a provider: new file in `providers/` implementing `LLMProvider` + one `registerProvider()` line in `registry.ts`. The coder needs a model with tool calling.

## Not yet verified
Real Groq/Gemini output (planner format, coder tool calls), real GitHub issue/PR creation from the container.
