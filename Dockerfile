# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then apt_extra="-o Acquire::https::CaInfo=/run/secrets/proxy_ca"; else apt_extra=""; fi; \
    apt-get $apt_extra update && apt-get $apt_extra install -y --no-install-recommends openssl ca-certificates poppler-utils tesseract-ocr tesseract-ocr-eng fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    node --version
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    DATABASE_URL=postgresql://localhost/lner npm run db:generate && npm run build
RUN mkdir /data && chown node:node /data /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
