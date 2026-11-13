# E-Invoice frontend: build the React app, then serve it with nginx.
# nginx also forwards /api/ and /admin/ to the Django backend, so the browser talks to one address
# (same origin: the login cookie and CSRF work without any CORS setup). See DEPLOY_DOCKER.md.

# --- 1. build ---------------------------------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty = call the API on the same address as the page (/api/...), which nginx forwards to the backend.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# --- 2. serve ---------------------------------------------------------------------------------------------------
FROM nginx:1.27-alpine
# The nginx image fills in ${BACKEND_URL} from the environment when the container starts.
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://web:8000
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
