VERSION 0.6
FROM mcr.microsoft.com/playwright:v1.34.0-jammy

WORKDIR /usr/build

build:
  COPY . .
  RUN npm install && npm --unsafe-perm run bootstrap
  RUN npm link ./packages/cypress/dist

lint:
  FROM +build
  RUN npm run lint

test:
  FROM +build
  RUN npm test

flake:
  FROM +build
  WORKDIR /usr/build/e2e-repos/flake
  RUN npm i && npm link @replayio/cypress
  RUN REPLAY_METADATA_TEST_RUN_TITLE=flake npx concurrently npm:start npm:test:replay

ci:
  BUILD +lint
  BUILD +test
  BUILD +flake