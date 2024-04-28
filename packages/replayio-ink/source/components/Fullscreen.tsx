import { Box, useStdout } from "ink";
import { PropsWithChildren, useLayoutEffect } from "react";
import {
  CLEAR_SCREEN_COMMAND,
  ENTER_ALT_SCREEN_COMMAND,
  EXIT_ALT_SCREEN_COMMAND,
} from "../constants.js";
import { useScreenSize } from "../hooks/useScreenSize.js";

export function FullScreen({ children }: PropsWithChildren) {
  const { stdout } = useStdout();

  const size = useScreenSize();

  useLayoutEffect(() => {
    stdout.write(ENTER_ALT_SCREEN_COMMAND);

    return () => {
      stdout.write(EXIT_ALT_SCREEN_COMMAND);
      stdout.write(CLEAR_SCREEN_COMMAND);
    };
  }, [stdout]);

  return (
    <Box height={size.height} width={size.width}>
      {children}
    </Box>
  );
}
