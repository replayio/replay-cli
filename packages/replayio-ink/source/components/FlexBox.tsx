import { Box, BoxProps, Spacer, Text } from "ink";
import { Children, PropsWithChildren } from "react";

export function FlexBox({
  children,
  direction,
  gap = 0,
  ...rest
}: Omit<BoxProps, "flexDirection"> &
  PropsWithChildren<{ direction: BoxProps["flexDirection"]; gap?: number }>) {
  return (
    <Box flexDirection={direction} {...rest}>
      {Children.map(children, (child, index) => {
        if (index > 0) {
          if (isSpacer(child)) {
            return <Text> </Text>;
          } else if (direction === "row") {
            return <Box marginLeft={gap}>{child}</Box>;
          } else {
            return <Box marginTop={gap}>{child}</Box>;
          }
        } else {
          return child;
        }
      })}
    </Box>
  );
}

function isSpacer(child: any): boolean {
  return typeof child === "object" && child !== null && "type" in child && child.type === Spacer;
}
