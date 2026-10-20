FROM node:24.14.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json index.html ./
COPY src ./src
RUN npm run build

FROM node:24.14.1-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 ROADGUARD_DB_PATH=/data/roadguard.sqlite ROADGUARD_AUTH_FILE=/run/secrets/roadguard_auth
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
COPY server/index.mjs server/backup.mjs server/camera-contract.mjs ./server/
COPY src/engine.ts src/types.ts ./src/
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
