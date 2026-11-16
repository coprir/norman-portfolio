# One image, two roles: the web app (`npm run start`) and the release worker
# (`npm run worker`). Give KEY_RELEASE_PRIVATE_KEY only to the worker.
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN useradd --system --uid 1001 dfm && chown -R dfm /app/.next
USER dfm
EXPOSE 3000
CMD ["npm", "run", "start"]
