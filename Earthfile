VERSION 0.6
FROM node:lts-alpine

WORKDIR /usr/build

build:
  COPY . .
  RUN npm install

lint:
  FROM +build
  RUN npm run lint

test:
  FROM +build
  RUN npm test

ci:
  BUILD +lint
  BUILD +test