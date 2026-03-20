FROM node:24-alpine AS builder

WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /build/dist ./dist

ARG BUILD_TIME
ARG COMMIT_SHA
ARG VERSION

LABEL org.opencontainers.image.source="https://github.com/justworkshr/mcp-google-server"
LABEL org.opencontainers.image.title="mcp-google-server"
LABEL org.opencontainers.image.description="MCP server for Google Workspace APIs"
LABEL org.opencontainers.image.created=$BUILD_TIME
LABEL org.opencontainers.image.revision=$COMMIT_SHA
LABEL org.opencontainers.image.version=$VERSION

ENV TRANSPORT=http
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
