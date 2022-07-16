VERSION 0.6
FROM node:lts-alpine

WORKDIR /usr/build

build:
  RUN corepack enable
  COPY . .
  RUN yarn install --frozen-lockfile

lint:
  FROM +build
  RUN yarn lint

test:
  FROM +build
  RUN yarn test:unit

ci:
  BUILD +lint
  BUILD +test