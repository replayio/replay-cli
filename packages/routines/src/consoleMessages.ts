// Routine to ensure that console messages and the information needed to pause at them have all been
// loaded into backend caches.

import ProtocolClient from "./client";
import { ensurePauseLoaded } from "./pause";
import { Message } from "@replayio/protocol";

const MaxLoadedMessages = 50;

// Return a priority for a message such that higher priority messages are more likely to be loaded
// if there are many messages in the recording.
function messagePriority(msg: Message) {
  // Prioritize errors over warnings, and warnings over other messages.
  switch (msg.level) {
    case "error":
    case "assert":
      return 10;
    case "warning":
      return 1;
    default:
      return 0;
  }
}

function getLoadedMessages(messages: Message[]) {
  // Ignore messages without any frames on stack.
  messages = messages.filter(msg => msg.stack?.length);

  if (messages.length > MaxLoadedMessages) {
    messages.sort((a, b) => (messagePriority(a) > messagePriority(b) ? -1 : 1));
    messages.length = MaxLoadedMessages;
  }

  return messages;
}

export async function loadConsoleMessages(client: ProtocolClient, sessionId: string) {
  console.log("StartLoadMessages");

  // Ensure the sources on the page are cached.
  client.setEventListener("Debugger.newSource", () => {});
  await client.sendCommand("Debugger.findSources", {}, sessionId);

  const allMessages: Message[] = [];
  client.setEventListener("Console.newMessage", ({ message }) => {
    allMessages.push(message);
  });

  await client.sendCommand("Console.findMessages", {}, sessionId);

  const loadMessages = getLoadedMessages(allMessages);

  await Promise.all(
    loadMessages.map(msg =>
      ensurePauseLoaded(client, sessionId, msg.pauseId, msg.data).catch(e => {
        console.error("Error loading pause", msg.pauseId, msg.point, e);
      })
    )
  );

  console.log("LoadMessagesFinished");
}
