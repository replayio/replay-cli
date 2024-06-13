import dbg from "debug";

const debug = dbg("test");

const obj = { foo: "bar" };

debug("mimi:", JSON.stringify(obj));
