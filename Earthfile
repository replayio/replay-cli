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

setup:
  RUN apt update && apt install xz-utils
  RUN npx @replayio/playwright install

flake:
  WAIT
    BUILD +build
    BUILD +setup
  END
  WORKDIR /usr/build/e2e-repos/flake
  ENV REPLAY_METADATA_TEST_RUN_TITLE="flake"
  RUN npm i && npm link @replayio/cypress
  RUN npm run start-and-test

e2e:
  ARG REPLAY_API_KEY
  BUILD +flake
  RUN npx @replayio/replay upload-all --api-key $REPLAY_API_KEY

ci:
  ARG REPLAY_API_KEY
  BUILD +lint
  BUILD +test
  BUILD +flake --REPLAY_API_KEY=$REPLAY_API_KEY
