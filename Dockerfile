# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then apt_extra="-o Acquire::https::CaInfo=/run/secrets/proxy_ca"; else apt_extra=""; fi; \
    apt-get $apt_extra update && apt-get $apt_extra install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit --no-fund
COPY --chown=node:node . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    DATABASE_URL=postgresql://localhost/planner npm run db:generate && npm run build
RUN chown node:node /app
USER node
ENV NODE_ENV=production PORT=4310
EXPOSE 4310
CMD ["sh","-c","npm run db:migrate && npm start"]
