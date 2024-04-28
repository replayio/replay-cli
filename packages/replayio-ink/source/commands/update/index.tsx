import { Box, Text, render } from "ink";
import { useEffect, useState } from "react";
import { FlexBox } from "../../components/FlexBox.js";
import { FullScreen } from "../../components/Fullscreen.js";
import { useExitSignal } from "../../hooks/useExitSignal.js";
import { useInputKey } from "../../hooks/useInputKey.js";
import { Status, Task } from "./Task.js";

export function update() {
  render(<App />);
}

function App() {
  const { exit, exitSignal } = useExitSignal();

  const [step, setStep] = useState<"cli" | "runtime" | undefined>("cli");
  const [cliStatus, setCliStatus] = useState<Status>("running");
  const [runtimeState, setRuntimeState] = useState<{
    status: Status;
    subStatus: "checking" | "confirmation" | "downloading" | "installing" | undefined;
  }>({
    status: "pending",
    subStatus: undefined,
  });

  useInputKey(key => {
    if (step === "runtime" && runtimeState.subStatus === "confirmation") {
      if (key === "return") {
        setRuntimeState(prevState => ({ ...prevState, subStatus: "downloading" }));
      }
    }
  });

  useEffect(() => {
    switch (step) {
      case "cli": {
        // HACK Simulate time to check NPM for package updates
        setTimeout(() => {
          setCliStatus("success");
          setStep("runtime");
          setRuntimeState({
            status: "running",
            subStatus: "checking",
          });
        }, 2_500);
        break;
      }
      case "runtime": {
        switch (runtimeState.subStatus) {
          case "checking": {
            // HACK Simulate time to check for updates
            setTimeout(() => {
              setRuntimeState({
                status: "running",
                subStatus: "confirmation",
              });
            }, 1_500);
            break;
          }
          case "downloading": {
            // HACK Simulate time to download
            setTimeout(() => {
              setRuntimeState({
                status: "running",
                subStatus: "installing",
              });
            }, 3_500);
            break;
          }
          case "installing": {
            // HACK Simulate time to install
            setTimeout(() => {
              setRuntimeState({
                status: "success",
                subStatus: undefined,
              });
              setStep(undefined);
            }, 2_000);
            break;
          }
        }
        break;
      }
      case undefined: {
        exit();
      }
    }
  }, [exit, runtimeState, step]);

  const Wrapper = exitSignal === "exit" ? Box : FullScreen;

  let runtimeDetails = "";
  switch (runtimeState.status) {
    case "running": {
      switch (runtimeState.subStatus) {
        case "checking": {
          runtimeDetails = "Checking Replay for updates…";
          break;
        }
        case "confirmation": {
          runtimeDetails = "An update is available! (Press any key to install)";
          break;
        }
        case "downloading": {
          runtimeDetails = "Downloading update…";
          break;
        }
        case "installing": {
          runtimeDetails = "Installing update…";
          break;
        }
      }
      break;
    }
    case "success": {
      runtimeDetails = "Latest version installed";
      break;
    }
  }

  return (
    <Wrapper>
      <FlexBox direction="column">
        <Text>Checking for updates</Text>
        <Task
          details={step === "cli" ? "Checking NPM for updates…" : "Latest version installed"}
          name="CLI"
          status={cliStatus}
        />
        <Task details={runtimeDetails} name="Replay browser" status={runtimeState.status} />
      </FlexBox>
    </Wrapper>
  );
}
