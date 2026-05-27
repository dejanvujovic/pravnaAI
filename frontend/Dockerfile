# Frontend image — multi-stage build.
#
# Stage 1 (builder): Vite build u statički bundle.
# Stage 2 (runtime): nginx-alpine servira dist/ + radi kao reverse proxy
#                    za /api/ ka `backend:4000` (interna docker mreža).

# ============================================================================
# Stage 1 — builder
# ============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Workspace package.json fajlovi za stabilan npm install cache.
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm install --no-audit --no-fund

# Bazni tsconfig — frontend/shared `tsconfig.json` ga extend-uju
# (`../tsconfig.base.json`); bez njega `tsc` puca sa TS5083.
COPY tsconfig.base.json ./

# Izvorni kod frontend-a + shared tipova (frontend importuje @rtcg/shared).
COPY shared ./shared
COPY frontend ./frontend

# Vite build — izlaz u /app/frontend/dist.
RUN npm run build --workspace=frontend

# ============================================================================
# Stage 2 — runtime (nginx)
# ============================================================================
FROM nginx:1.27-alpine

# Ukloni default nginx site.
RUN rm -f /etc/nginx/conf.d/default.conf

# Naš site config — SPA fallback + /api/ proxy ka backend kontejneru.
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Statički bundle iz builder stage-a.
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
