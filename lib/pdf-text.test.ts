import { describe, expect, it } from "vitest";
import { validateResumePdf } from "./pdf-text";

describe("resume PDF validation", () => {
  it("accepts a normal PDF", () => expect(validateResumePdf({ type: "application/pdf", name: "resume.pdf", size: 2000 })).toBeNull());
  it("rejects non-PDF and over-size uploads", () => {
    expect(validateResumePdf({ type: "text/plain", name: "resume.txt", size: 10 })).toMatch(/PDF/);
    expect(validateResumePdf({ type: "application/pdf", name: "resume.pdf", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
});
