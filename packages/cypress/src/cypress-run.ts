import { run } from "cypress";

process.on("message", (runOptions: any) => {
  run(runOptions)
    .then(resp => {
      process.send?.(
        JSON.stringify({
          success: true,
          error: null,
          data: resp,
        })
      );
    })
    .catch(e => {
      process.send?.(
        JSON.stringify({
          success: false,
          error: e,
          data: null,
        })
      );
    });
});
