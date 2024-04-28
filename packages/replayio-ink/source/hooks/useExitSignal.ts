import { useCallback, useEffect, useState } from "react";

export type ExitSignal = "beforeExit" | "exit";

export function useExitSignal() {
  const [exitSignal, setExitSignal] = useState<ExitSignal | null>(null);

  const beforeExit = useCallback(() => {
    setExitSignal("beforeExit");
  }, []);

  const exit = useCallback(() => {
    setExitSignal("exit");
  }, []);

  useEffect(() => {
    switch (exitSignal) {
      case "exit": {
        process.exit(0);
      }
    }
  }, [exitSignal]);

  return { beforeExit, exit, exitSignal };
}
