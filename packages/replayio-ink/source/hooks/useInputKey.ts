import { Key, useInput } from "ink";

export function useInputKey(callback: (key: keyof Key) => void) {
  useInput(async (_, key) => {
    if (key.backspace) {
      callback("backspace");
    } else if (key.ctrl) {
      callback("ctrl");
    } else if (key.delete) {
      callback("delete");
    } else if (key.downArrow) {
      callback("downArrow");
    } else if (key.escape) {
      callback("escape");
    } else if (key.leftArrow) {
      callback("leftArrow");
    } else if (key.meta) {
      callback("meta");
    } else if (key.pageDown) {
      callback("pageDown");
    } else if (key.pageUp) {
      callback("pageUp");
    } else if (key.return) {
      callback("return");
    } else if (key.rightArrow) {
      callback("rightArrow");
    } else if (key.shift) {
      callback("shift");
    } else if (key.tab) {
      callback("tab");
    } else if (key.upArrow) {
      callback("upArrow");
    }
  });
}
