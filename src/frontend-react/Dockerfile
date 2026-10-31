# Production image (development uses Dockerfile.dev).
# The build stage runs on the builder's own platform (no emulation): its output is plain files.
FROM --platform=$BUILDPLATFORM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx serves the built files and passes /api to the API
FROM nginx:1.31.8-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
