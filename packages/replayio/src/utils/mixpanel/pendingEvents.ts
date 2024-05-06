const pendingEvents: Set<Promise<any>> = new Set();

export function addPendingEvent(promise: Promise<any>) {
  pendingEvents.add(promise);
}

export function getPendingEvents() {
  return pendingEvents;
}

export function removePendingEvent(promise: Promise<any>) {
  pendingEvents.delete(promise);
}
