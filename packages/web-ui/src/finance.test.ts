import { describe, expect, it } from "vitest";
import { FinanceDataState } from "./finance";
import { ErrorState, PageState } from "./index";

describe("shared admin and partner finance states", () => {
  it("shows loading before stale records", () => {
    const view = FinanceDataState({
      loading: true,
      error: null,
      empty: false,
      children: "stale records",
    });
    expect(view.type).toBe(PageState);
    expect(view.props.title).toBe("Loading finance…");
  });
  it("shows API errors instead of success content", () => {
    const error = new Error("Access denied");
    const view = FinanceDataState({
      loading: false,
      error,
      empty: false,
      children: "records",
    });
    expect(view.type).toBe(ErrorState);
    expect(view.props.error).toBe(error);
  });
  it("shows a useful empty state for applied filters", () => {
    const view = FinanceDataState({
      loading: false,
      error: null,
      empty: true,
      children: null,
    });
    expect(view.type).toBe(PageState);
    expect(view.props.title).toBe("No financial records found");
  });
  it("renders returned financial content on success", () => {
    const view = FinanceDataState({
      loading: false,
      error: null,
      empty: false,
      children: "verified earnings",
    });
    expect(view.props.children).toBe("verified earnings");
  });
});
