import { Text } from "ink";
import { ReactNode } from "react";
import { FlexBox } from "../../components/FlexBox.js";
import { Spinner } from "../../components/Spinner.js";

export type Status = "pending" | "running" | "success" | "failure";

export function Task({ details, name, status }: { details: string; name: string; status: Status }) {
  let icon: ReactNode;
  switch (status) {
    case "pending":
      icon = <Text color="gray">•</Text>;
      break;
    case "running":
      icon = <Spinner color="yellowBright" />;
      break;
    case "success":
      icon = <Text color="greenBright">✔</Text>;
      break;
    case "failure":
      icon = <Text color="redBright">✘</Text>;
      break;
  }

  return (
    <FlexBox direction="row">
      {icon}
      <Text bold color={status === "pending" ? "gray" : undefined}>
        {" "}
        {name}
      </Text>
      {status !== "pending" ? (
        <Text color={status !== "running" ? "gray" : undefined}>: {details}</Text>
      ) : null}
    </FlexBox>
  );
}
