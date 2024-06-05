// import { ROOT_CONTEXT, trace } from "@opentelemetry/api";
// import { ManualSpan, OtelEventTypes } from "./manual-span";

// const startTime = Date.now();
// const endTime = Date.now();

// function mockTracer(): {
//   tracer: any;
//   startSpan: any;
//   addEvent: any;
//   end: any;
// } {
//   const tracer = trace.getTracer("test");
//   const end = jest.fn();
//   const addEvent = jest.fn();
//   const startSpan = jest.fn(() => ({ end, addEvent })) as any;
//   tracer.startSpan = startSpan;
//   return { tracer, addEvent, startSpan, end };
// }
