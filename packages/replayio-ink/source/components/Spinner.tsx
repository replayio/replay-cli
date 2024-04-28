import type { SpinnerName } from "cli-spinners";
import spinners from "cli-spinners";
import { Text, TextProps } from "ink";
import { useEffect, useState } from "react";

export function Spinner({
  color,
  type = "dots",
}: {
  color?: TextProps["color"];
  type?: SpinnerName;
}) {
  const [frame, setFrame] = useState(0);

  const { frames, interval } = spinners[type];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(previousFrame => {
        const isLastFrame = previousFrame === frames.length - 1;
        return isLastFrame ? 0 : previousFrame + 1;
      });
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, [frames, interval]);

  return <Text color={color}>{frames[frame]}</Text>;
}
