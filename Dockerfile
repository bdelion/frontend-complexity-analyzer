FROM node:22-bookworm-slim AS build
WORKDIR /tool
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /tool
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /tool/dist ./dist
USER node
ENTRYPOINT ["node", "/tool/dist/cli.js"]
