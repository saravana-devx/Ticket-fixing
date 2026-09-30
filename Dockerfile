FROM node:22-bookworm-slim

# git: simple-git shells out to it. build tools: fallback if better-sqlite3 has no prebuilt binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Repos are bind-mounted (/target, /app) by docker compose; git must trust them.
RUN git config --global --add safe.directory '*'

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
