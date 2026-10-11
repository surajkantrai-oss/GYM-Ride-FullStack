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

  it("keeps the Partner account controls visible while its long navigation scrolls", () => {
    expect(css).toContain(".app-frame-partner .sidebar{height:100vh;height:100dvh");
    expect(css).toContain(
      ".app-frame-partner .sidebar nav{flex:1 1 auto;min-height:0;align-content:start;overflow-y:auto",
    );
    expect(css).toContain(
      ".app-frame-partner .sidebar-user{flex:0 0 auto}",
    );
    expect(css).toContain(
      ".app-frame-partner .sidebar-user{margin-top:.45rem}",
    );
  });

  it("keeps a compact Partner sign-out control beside mobile navigation", () => {
    expect(css).toContain(
      ".app-frame-partner .sidebar{display:grid;grid-template-columns:minmax(0,1fr) auto",
    );
    expect(css).toContain(
      ".app-frame-partner .sidebar-user{display:grid;place-items:center",
    );
    expect(css).toContain(
      ".app-frame-partner .sidebar-user .button-ghost{width:52px;min-height:52px",
    );
  });

  it("anchors notifications to the safe top-right corner", () => {
    expect(css).toContain(
      ".toast-region{position:fixed;right:1rem;top:calc(1rem + env(safe-area-inset-top));bottom:auto",
    );
    expect(css).toContain("width:min(380px,calc(100vw - 2rem))");
  });
});
