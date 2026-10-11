FROM node:22-alpine AS build

RUN npm install --global pnpm@11.1.2

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api

RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build \
    pnpm --filter @costume/api db:generate
RUN pnpm --filter @costume/api build
RUN pnpm --filter @costume/api deploy --prod --legacy /prod/api

FROM node:22-alpine AS production

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=build --chown=node:node /prod/api/ ./
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/apps/api/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./prisma.config.ts

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
