VERSION --wait-block 0.6
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

setup:
  FROM +build
  RUN apt update && apt install xz-utils
  RUN npx @replayio/playwright install

flake:
  FROM +setup
  WORKDIR /usr/build/e2e-repos/flake
  ENV REPLAY_METADATA_TEST_RUN_TITLE="flake"
  RUN npm i && npm link @replayio/cypress
  RUN npm run start-and-test || exit 0

e2e:
  BUILD +flake

upload:
  FROM +e2e
  ARG REPLAY_API_KEY
  RUN "npx @replayio/replay upload-all --api-key $REPLAY_API_KEY"

ci:
  BUILD +lint
  BUILD +test
  BUILD +upload
