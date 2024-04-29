This project uses the [Yarn package manager](https://yarnpkg.com/). To install project dependencies:

```bash
# Workspace root
yarn
yarn run bootstrap
```

To build the CLI:

```bash
# packages/replayio
yarn build
```

To test your changes locally:

```bash
# packages/replayio
./replayio.js
```

Before submitting a pull request, make sure you've checked types, formatting, and tests:

```bash
yarn typecheck
yarn lint
yarn test
```
