import { useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";

export function useScreenSize() {
  const { stdout } = useStdout();

  const getCurrentSize = useCallback(
    () => ({
      height: stdout.rows,
      width: stdout.columns,
    }),
    []
  );

  const [size, setSize] = useState(getCurrentSize());

  useEffect(() => {
    const onResize = () => {
      setSize(getCurrentSize());
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [getCurrentSize, stdout]);

  return size;
}
