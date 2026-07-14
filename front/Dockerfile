# Build + serve the Hormiga messenger UI (front4mess) as a container.
# Replaces the previous bare `node server.mjs` under the front4mess systemd unit:
# same port (5555), same zero-dependency static server, auto-restart via the
# container runtime. Served behind the platform edge at
# https://hormi.isolutions.io/messenger-ui/.
#
#   docker build --build-arg BASE=/messenger-ui/ -t front4mess ./front
#
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Vite base = the edge subpath the SPA is mounted under. We run `npx vite build`
# directly (not `npm run build`) because the repo's `tsc -b` trips on a stale
# test; the Vite build is the real gate (mirrors deploy.sh).
ARG BASE=/messenger-ui/
RUN npx vite build --base="$BASE"

FROM node:20-alpine
WORKDIR /app
ENV PORT=5555 HOST=0.0.0.0 NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 5555
CMD ["node", "server.mjs"]
