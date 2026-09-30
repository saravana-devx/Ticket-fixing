# Ticket-fixing

Autonomous bug-fix pipeline (LangGraph.js + Gemini): reads a bug ticket, triages by severity,
plans and writes a fix, has a separate LLM review it, then opens a GitHub PR.
Runs are logged to SQLite. The repo it fixes is [Test-app](https://github.com/saravana-devx/Test-app).

```
ticket → triage → planner → complexity check → coder ⇄ reviewer → git (branch, commit, push, PR)
```

- HIGH severity is skipped; LOW with >50 estimated lines is escalated to a new issue.
- Max 3 coder attempts, then a failure issue is created.

## Setup
```bash
git clone https://github.com/saravana-devx/Test-app.git ../Test-app   # target repo, sibling folder
cp .env.example .env                                                  # fill in the keys
make build && make test
make run                                                              # runs LOCAL_TICKET_PATH
```
Run `make reset-target` to restore Test-app to a pristine `origin/main`. See `CLAUDE.md` for details.
