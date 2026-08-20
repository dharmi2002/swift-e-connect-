import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts — last wins", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("text-sm", undefined, null, "font-bold")).toBe("text-sm font-bold");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});
