FROM node:20 AS build-env
COPY package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs20-debian12
COPY --from=build-env /app /app
COPY src/ /app
WORKDIR /app

CMD ["test.js"]