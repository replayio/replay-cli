import { maskString } from "./maskString";

describe("maskString", () => {
  it("should filter alpha-numeric characters", () => {
    expect(maskString("abc-ABC-123")).toBe("***-***-***");
  });
});
