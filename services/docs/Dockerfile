# Build natively on the builder's platform; the vite output is arch-independent.
# Building under QEMU emulation crashes V8/Rolldown with SIGILL on arm64.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build

WORKDIR /app

COPY package*.json svelte.config.js ./
RUN npm ci

COPY . .
RUN npm run build

# adapter-static emits plain files, so serve them with nginx instead of Node.
FROM nginxinc/nginx-unprivileged:1.30-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/build /usr/share/nginx/html

ENV NGINX_ENTRYPOINT_QUIET_LOGS=1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
