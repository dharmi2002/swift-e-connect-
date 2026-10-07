import { describe, expect, it } from "vitest";
import { escapeHtml } from "./email";

describe("email template safety", () => {
  it("escapes HTML-sensitive provider values", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)"> & 'code'`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;code&#39;",
    );
  });
});
