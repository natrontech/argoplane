# Build natively on the builder's platform; the vite output is arch-independent.
# Building under QEMU emulation crashes V8/Rolldown with SIGILL on arm64.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build

WORKDIR /app

COPY package*.json svelte.config.js ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build/index.js"]
