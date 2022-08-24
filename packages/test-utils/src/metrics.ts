import fetch from "node-fetch";

function shouldReportTestMetrics() {
  const optIn = process.env.RECORD_REPLAY_TEST_METRICS;

  return optIn && optIn !== "0" && optIn !== "false";
}

async function pingTestMetrics(
  recordingId: string | undefined,
  runId: string,
  test: {
    id: string;
    duration: number;
    recorded: boolean;
    runtime?: string;
  }
) {
  if (!shouldReportTestMetrics()) return;

  const webhookUrl = process.env.RECORD_REPLAY_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("RECORD_REPLAY_WEBHOOK_URL is undefined. Skipping test metrics");
    return;
  }

  try {
    return await fetch(`${webhookUrl}/api/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "test.finished",
        recordingId,
        test: {
          ...test,
          runId,
        },
      }),
    });
  } catch (e) {
    console.log("Failed to send test metrics", e);
  }
}

export { pingTestMetrics };
