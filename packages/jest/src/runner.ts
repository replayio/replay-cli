// import { pass, fail, RunTest } from "create-jest-runner";

// const runTest: RunTest = ({ testPath }) => {
//   const start = Date.now();
//   const contents = fs.readFileSync(testPath, "utf8");
//   const end = Date.now();

//   if (contents.includes("⚔️🏃")) {
//     return pass({ start, end, test: { title: "asdf", path: testPath } });
//   }
//   const errorMessage = "Company policies require ⚔️ 🏃 in every file";
//   return fail({
//     start,
//     end,
//     test: { path: testPath, errorMessage, title: "Check for ⚔️ 🏃" },
//   });
// };

// module.exports = runTest;
