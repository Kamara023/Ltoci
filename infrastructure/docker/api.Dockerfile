# Image du service API NestJS — build depuis la racine du monorepo :
#   docker build -f infrastructure/docker/api.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@11
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile --filter @lotostats/api... --config.confirmModulesPurge=false
COPY packages ./packages
COPY services/api ./services/api
RUN cd services/api && pnpm exec prisma generate && pnpm run build

FROM node:22-alpine
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/services/api/node_modules ./services/api/node_modules
COPY --from=build /repo/services/api/dist ./services/api/dist
COPY --from=build /repo/services/api/prisma ./services/api/prisma
USER app
WORKDIR /app/services/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
