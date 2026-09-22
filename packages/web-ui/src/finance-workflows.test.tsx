// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FinanceWorkspace } from "./finance";

afterEach(cleanup);
const gymId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const summary = {
  currency: "INR",
  grossRevenue: 100000,
  commission: 15000,
  refunds: 0,
  netEarnings: 85000,
  pendingSettlement: 85000,
  paidSettlement: 0,
};
const record = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "PAID",
  amount: 100000,
  currency: "INR",
};
function mount(role: "admin" | "partner", request: ReturnType<typeof vi.fn>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <FinanceWorkspace api={{ request } as never} role={role} />
    </QueryClientProvider>,
  );
  if (role === "partner") {
    fireEvent.change(screen.getByLabelText("Gym ID"), {
      target: { value: gymId },
    });
    fireEvent.click(screen.getByText("Apply filters"));
  }
}
describe.each(["admin", "partner"] as const)("%s finance workflow", (role) => {
  it("renders loading while API is pending", () => {
    mount(
      role,
      vi.fn(() => new Promise(() => {})),
    );
    expect(screen.getByText("Loading finance…")).toBeTruthy();
  });
  it("renders summary values supplied by API", async () => {
    mount(role, vi.fn().mockResolvedValue(summary));
    expect(await screen.findByText("Gross Revenue")).toBeTruthy();
    expect(screen.getByText("₹1,000.00")).toBeTruthy();
  });
  it("renders API errors without exposing stale financial content", async () => {
    mount(
      role,
      vi.fn().mockRejectedValue(new Error("Finance service unavailable")),
    );
    expect(await screen.findByText("We couldn’t load this")).toBeTruthy();
    expect(screen.queryByText("Gross Revenue")).toBeNull();
  });
  it("renders empty settlement history", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        data: [],
        meta: { page: 1, totalPages: 0, total: 0 },
      });
    mount(role, request);
    fireEvent.click(screen.getByRole("button", { name: "Settlements" }));
    expect(await screen.findByText("No financial records found")).toBeTruthy();
  });
  it("applies gym/branch/date filters and paginates real requests", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        data: [record],
        meta: { page: 1, totalPages: 2, total: 21 },
      });
    mount(role, request);
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    fireEvent.change(screen.getByLabelText("Branch ID"), {
      target: { value: branchId },
    });
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-09-14" },
    });
    fireEvent.click(screen.getByText("Apply filters"));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url]) =>
            String(url).includes(`branchId=${branchId}`) &&
            String(url).includes("from=2026-09-01") &&
            String(url).includes("to=2026-09-14"),
        ),
      ).toBe(true),
    );
    await screen.findByText("33333333");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(([url]) => String(url).includes("page=2")),
      ).toBe(true),
    );
  });
});
it("partner requires authorized scope before fetching and has no reversal action", () => {
  const request = vi.fn();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <FinanceWorkspace api={{ request } as never} role="partner" />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Select your gym or branch")).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByText("Record audited reversal")).toBeNull();
});
