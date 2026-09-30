COMPOSE = docker compose
RUN     = $(COMPOSE) run --rm agent

.PHONY: help build install run run-all test typecheck shell db reset-target clean

help:  ## Show this help
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

build:  ## Build the Docker image
	$(COMPOSE) build

install: build  ## Refresh node_modules volume after changing package.json
	$(RUN) npm ci

run:  ## Run the pipeline on the ticket in LOCAL_TICKET_PATH
	$(RUN) npm start

run-all:  ## Run every ticket in ../Test-app/tickets in turn, then print a summary
	./scripts/run-all.sh

test:  ## Run all tests
	$(RUN) npm test

typecheck:  ## Type-check with tsc
	$(RUN) npm run typecheck

shell:  ## Open a shell in the container
	$(RUN) bash

db:  ## Print recent agent runs from SQLite
	$(RUN) node -e "const D=require('better-sqlite3');const d=new D('data/agent_runs.db',{readonly:true});console.table(d.prepare('SELECT ticket_id,status,estimated_lines,pr_url,duration_ms,started_at FROM agent_runs ORDER BY started_at DESC LIMIT 20').all())"

reset-target:  ## Reset ../Test-app to a pristine origin/main (bugs restored)
	./scripts/reset-target.sh

clean:  ## Remove containers, volumes and the built image
	$(COMPOSE) down -v --rmi local
