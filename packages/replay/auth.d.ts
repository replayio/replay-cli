export * from "./dist/auth.js";
// MBUDAYR - without these two files (this and `auth.js`), in `playwright/index.ts`, I have to import `@replayio/replay/src/auth` rather than `@replayio/replay/auth`. I think it's because this package (`replay`) has no `src/index.ts` file?
