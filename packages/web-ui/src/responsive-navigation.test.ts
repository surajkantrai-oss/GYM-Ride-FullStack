import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive web navigation", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it.each([320, 360, 375, 390, 414, 430])(
    "keeps every destination horizontally accessible at %ipx",
    () => {
      expect(css).toContain("max-width:100vw");
      expect(css).toContain("overflow-x:auto");
      expect(css).toContain("flex:0 0 76px");
      expect(css).toContain("min-height:52px");
      expect(css).toContain("env(safe-area-inset-bottom)");
    },
  );
});
