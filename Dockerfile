FROM node:22.23.5-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src src
COPY scenarios scenarios
RUN npm run build && npm prune --omit=dev

FROM node:22.23.5-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=1024 --require /app/dist/src/runtime/telemetry.js"
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
USER 1000:1000
ENTRYPOINT ["node"]
