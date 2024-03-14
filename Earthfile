VERSION 0.6
FROM mcr.microsoft.com/playwright:v1.34.0-jammy

WORKDIR /usr/build

build:
  COPY . .
  RUN yarn && yarn run bootstrap
  RUN npm link ./packages/cypress/dist

lint:
  FROM +build
  RUN yarn run lint

test:
  FROM +build
  RUN yarn run test

setup:
  FROM +build
  RUN apt update && apt install xz-utils
  RUN npx @replayio/playwright install
  # download binary openssl packages from Impish builds
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/openssl_1.1.1f-1ubuntu2.22_amd64.deb
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl-dev_1.1.1f-1ubuntu2.22_amd64.deb
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.22_amd64.deb
  # install downloaded binary packages
  RUN dpkg -i libssl1.1_1.1.1f-1ubuntu2.22_amd64.deb
  RUN dpkg -i libssl-dev_1.1.1f-1ubuntu2.22_amd64.deb
  RUN dpkg -i openssl_1.1.1f-1ubuntu2.22_amd64.deb

flake:
  FROM +setup
  ARG --required REPLAY_API_KEY
  ARG GITHUB_SHA
  ARG GITHUB_TOKEN
  ARG GITHUB_REPOSITORY
  ARG GITHUB_ACTOR
  ARG GITHUB_RUN_ID
  ARG GITHUB_WORKFLOW
  ARG GITHUB_SERVER_URL
  ARG GITHUB_REF_NAME
  WORKDIR /usr/build/e2e-repos/flake
  ENV REPLAY_METADATA_TEST_RUN_TITLE="flake"
  ENV REPLAY_API_KEY=${REPLAY_API_KEY}
  ENV GITHUB_SHA=${GITHUB_SHA}
  ENV GITHUB_TOKEN=${GITHUB_TOKEN}
  ENV GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
  ENV GITHUB_ACTOR=${GITHUB_ACTOR}
  ENV GITHUB_RUN_ID=${GITHUB_RUN_ID}
  ENV GITHUB_WORKFLOW=${GITHUB_WORKFLOW}
  ENV GITHUB_SERVER_URL=${GITHUB_SERVER_URL}
  ENV GITHUB_REF_NAME=${GITHUB_REF_NAME}
  ENV GITHUB_EVENT_PATH=/usr/build/e2e-repos/flake/github_event
  RUN npm i && npm link @replayio/cypress
  RUN DEBUG=replay:*,-replay:cypress:plugin:task,-replay:cypress:plugin:reporter:steps,replay:cli:metadata:source npm run start-and-test || exit 0
  RUN npx @replayio/replay ls --all
  RUN echo "JUnit Output"
  RUN find results -type f -exec grep -l 'adding-spec.ts' {} \; | xargs cat 

e2e:
  BUILD +flake

ci:
  BUILD +lint
  BUILD +test
  BUILD +e2e
