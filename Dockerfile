FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
# Only public, non-credential configuration can be a build argument.
ARG NEXT_PUBLIC_PASSKEY_RP_ID=localhost
ARG NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS
ARG NEXT_PUBLIC_RECOVERY_DELAY_SECONDS=180
ENV NEXT_PUBLIC_PASSKEY_RP_ID=$NEXT_PUBLIC_PASSKEY_RP_ID
ENV NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS=$NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS
ENV NEXT_PUBLIC_RECOVERY_DELAY_SECONDS=$NEXT_PUBLIC_RECOVERY_DELAY_SECONDS
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24.16.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1 CONTINUITY_DATA_DIR=/data
RUN mkdir /data && chown node:node /data /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
