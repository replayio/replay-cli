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
  # download binary openssl packages from Impish builds
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/openssl_1.1.1f-1ubuntu2.19_amd64.deb
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl-dev_1.1.1f-1ubuntu2.19_amd64.deb
  RUN wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.19_amd64.deb
  # install downloaded binary packages
  RUN dpkg -i libssl1.1_1.1.1f-1ubuntu2.19_amd64.deb
  RUN dpkg -i libssl-dev_1.1.1f-1ubuntu2.19_amd64.deb
  RUN dpkg -i openssl_1.1.1f-1ubuntu2.19_amd64.deb

flake:
  FROM +setup
  ARG --required REPLAY_API_KEY
  WORKDIR /usr/build/e2e-repos/flake
  ENV REPLAY_METADATA_TEST_RUN_TITLE="flake"
  RUN npm i && npm link @replayio/cypress
  RUN npm run start-and-test || exit 0
  DO +UPLOAD --REPLAY_API_KEY=$REPLAY_API_KEY

e2e:
  BUILD +flake

UPLOAD:
  COMMAND
  ARG --required REPLAY_API_KEY
  RUN npx @replayio/replay ls --json | grep -q id 
  RUN npx @replayio/replay upload-all --api-key ${REPLAY_API_KEY}

ci:
  BUILD +lint
  BUILD +test
  BUILD +e2e
