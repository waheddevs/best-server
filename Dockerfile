# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ libgomp1 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY . .
RUN yarn install --immutable
RUN yarn build && yarn typecheck && yarn lint && yarn test

# Explicit one-off migration image; migrations never run automatically on API startup.
FROM build AS migrate
USER node
CMD ["yarn", "database:migrate:deploy"]

FROM build AS dependencies
RUN yarn workspaces focus @best/api @best/scoring-worker --production

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl libgomp1 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/apps ./apps
COPY --from=dependencies --chown=node:node /app/packages ./packages
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
