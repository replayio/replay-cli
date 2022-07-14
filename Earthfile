VERSION 0.6
FROM node:lts-alpine

WORKDIR /usr/build

build:
  COPY . .
  RUN npm ci && npm run bootstrap

lint:
  FROM +build
  RUN npm run lint