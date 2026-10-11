"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createUuid, type ApiClient } from "@gymride/api-client";
import { ErrorState, PageHeader, PageState, StatusBadge } from "./index";

type FinanceView =
  | "summary"
  | "payments"
  | "refunds"
  | "earnings"
  | "settlements"
  | "ledger"
  | "reconciliation";
type Row = { id: string; [key: string]: unknown };
type FinanceResult = {
  data: Row[];
  meta: { page: number; totalPages: number; total: number };
};
type Summary = {
  currency: string;
  grossRevenue: number;
  commission: number;
  refunds: number;
  netEarnings: number;
  pendingSettlement: number;
  paidSettlement: number;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value / 100,
  );
const labels: Record<FinanceView, string> = {
  summary: "Overview",
  payments: "Payments",
  refunds: "Refunds",
  earnings: "Gym earnings",
  settlements: "Settlements",
  ledger: "Ledger",
  reconciliation: "Reconciliation",
};
const columns: Record<string, string[]> = {
  payments: [
    "bookingId",
    "provider",
    "amount",
    "currency",
    "status",
    "createdAt",
  ],
  refunds: ["paymentId", "amount", "reason", "status", "createdAt"],
  earnings: [
    "paymentId",
    "grossAmount",
    "commissionAmount",
    "refundAmount",
    "netAmount",
    "settled",
  ],
  settlements: [
    "gymId",
    "periodStart",
    "periodEnd",
    "grossAmount",
    "commissionAmount",
    "refundAmount",
    "netAmount",
    "status",
  ],
  ledger: [
    "sourceType",
    "sourceId",
    "category",
    "account",
    "amount",
    "createdAt",
  ],
};
function heading(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
}
function display(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && (key.endsWith("Amount") || key === "amount"))
    return money(value);
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
export function FinanceDataState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <PageState title="Loading finance…" />;
  if (error) return <ErrorState error={error} />;
  if (empty)
    return (
      <PageState
        title="No financial records found"
        detail="Change the filters or check back after a verified payment."
      />
    );
  return <>{children}</>;
}

export function FinanceWorkspace({
  api,
  role,
}: {
  api: ApiClient;
  role: "admin" | "partner";
}) {
  const [view, setView] = useState<FinanceView>("summary");
  const [filters, setFilters] = useState({
    gymId: "",
    branchId: "",
    from: "",
    to: "",
    status: "",
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionKeys = useRef(new Map<string, string>());
  const cache = useQueryClient();
  const views: FinanceView[] =
    role === "admin"
      ? [
          "summary",
          "payments",
          "refunds",
          "earnings",
          "settlements",
          "ledger",
          "reconciliation",
        ]
      : ["summary", "payments", "earnings", "settlements"];
  const prefix = `/${role}/finance`;
  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...Object.fromEntries(
      Object.entries(applied).filter(
        ([key, v]) => v && !(view === "settlements" && key === "branchId"),
      ),
    ),
  });
  const enabled =
    role === "admin" || Boolean(applied.gymId || applied.branchId);
  const query = useQuery({
    queryKey: ["finance", role, view, params.toString()],
    enabled,
    queryFn: () =>
      api.request<
        | FinanceResult
        | Summary
        | {
            findings: { code: string; entityId: string }[];
            nextCursor: string | null;
          }
      >(`${prefix}/${view}?${params}`),
  });
  const detail = useQuery({
    queryKey: ["finance", role, view, selected],
    enabled: !!selected,
    queryFn: () => api.request<Row>(`${prefix}/${view}/${selected}`),
  });
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setActionError("");
    const fingerprint = JSON.stringify([path, body]);
    const key = actionKeys.current.get(fingerprint) ?? createUuid();
    actionKeys.current.set(fingerprint, key);
    try {
      await api.request(`${prefix}/${path}`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      actionKeys.current.delete(fingerprint);
      await cache.invalidateQueries({ queryKey: ["finance"] });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Finance action failed",
      );
    } finally {
      setBusy(false);
    }
  }
  const rows = query.data && "data" in query.data ? query.data.data : [];
  return (
    <>
      <PageHeader
        eyebrow={role === "admin" ? "Platform finance" : "Your earnings"}
        title="Finance"
        description="Payment history, commission, refunds and auditable settlements. All amounts shown in INR."
      />
      <nav className="finance-tabs" aria-label="Finance sections">
        {views.map((item) => (
          <button
            key={item}
            className={view === item ? "" : "button-secondary"}
            aria-current={view === item ? "page" : undefined}
            onClick={() => {
              setView(item);
              setSelected(null);
              setPage(1);
              setApplied({ ...applied, status: "" });
              setFilters({ ...filters, status: "" });
            }}
          >
            {labels[item]}
          </button>
        ))}
      </nav>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setPage(1);
          setSelected(null);
        }}
      >
        <label>
          Gym ID
          <input
            value={filters.gymId}
            onChange={(e) => setFilters({ ...filters, gymId: e.target.value })}
            placeholder="Authorized gym UUID"
          />
        </label>
        {view !== "settlements" && (
          <label>
            Branch ID
            <input
              value={filters.branchId}
              onChange={(e) =>
                setFilters({ ...filters, branchId: e.target.value })
              }
              placeholder="Optional branch UUID"
            />
          </label>
        )}
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <label>
          Status
          <input
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value.toUpperCase() })
            }
            placeholder="e.g. SUCCESS or PAID"
          />
        </label>
        <button>Apply filters</button>
      </form>
      {!enabled ? (
        <PageState
          title="Select your gym or branch"
          detail="Finance access is checked against your authorized gym membership."
        />
      ) : (
        <FinanceDataState
          loading={query.isLoading}
          error={query.error}
          empty={!!query.data && "data" in query.data && rows.length === 0}
        >
          {query.data && "grossRevenue" in query.data && (
            <div className="metrics">
              {(
                [
                  "grossRevenue",
                  "commission",
                  "refunds",
                  "netEarnings",
                  "pendingSettlement",
                  "paidSettlement",
                ] as const
              ).map((key) => (
                <section className="metric" key={key}>
                  <strong>{money((query.data as Summary)[key])}</strong>
                  <span>{heading(key)}</span>
                </section>
              ))}
            </div>
          )}
          {query.data && "findings" in query.data && (
            <section>
              <h2>Integrity checks</h2>
              <p>Report only. Findings do not modify financial records.</p>
              {query.data.findings.length ? (
                <ul>
                  {query.data.findings.map((f, i) => (
                    <li key={`${f.entityId}-${i}`}>
                      {f.code}: {f.entityId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No inconsistencies found in this scan.</p>
              )}
              {query.data.nextCursor && (
                <p>
                  More records remain. Use the reconciliation API cursor to
                  continue.
                </p>
              )}
            </section>
          )}
          {!!rows.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    {columns[view]?.map((key) => (
                      <th key={key}>{heading(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {["payments", "earnings", "settlements"].includes(
                          view,
                        ) ? (
                          <button
                            className="button-ghost"
                            onClick={() => setSelected(row.id)}
                          >
                            {row.id.slice(0, 8)}
                          </button>
                        ) : (
                          row.id.slice(0, 8)
                        )}
                      </td>
                      {columns[view]?.map((key) => (
                        <td key={key}>
                          {key === "status" ? (
                            <StatusBadge status={String(row[key])} />
                          ) : (
                            display(key, row[key])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {query.data && "meta" in query.data && (
            <div className="finance-tabs">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {query.data.meta.totalPages || 1} ·{" "}
                {query.data.meta.total} records
              </span>
              <button
                disabled={page >= query.data.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </FinanceDataState>
      )}
      {selected && (
        <section className="finance-detail">
          <h2>{labels[view]} details</h2>
          <button
            className="button-secondary"
            onClick={() => setSelected(null)}
          >
            Close details
          </button>
          <FinanceDataState
            loading={detail.isLoading}
            error={detail.error}
            empty={false}
          >
            {detail.data && (
              <dl>
                {Object.entries(detail.data)
                  .filter(
                    ([key]) =>
                      ![
                        "providerPaymentId",
                        "providerRefundId",
                        "idempotencyKey",
                      ].includes(key),
                  )
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{heading(key)}</dt>
                      <dd>
                        <pre>{display(key, value)}</pre>
                      </dd>
                    </div>
                  ))}
              </dl>
            )}
          </FinanceDataState>
          {role === "admin" &&
            view === "settlements" &&
            detail.data?.status === "READY" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Process this settlement using the configured payout provider? Development payouts simulate transfer only.",
                    )
                  )
                    void action(`settlements/${selected}/process`);
                }}
              >
                Process settlement
              </button>
            )}
          {role === "admin" &&
            view === "settlements" &&
            detail.data?.status === "PAID" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  if (
                    window.confirm(
                      "Record a verified settlement reversal? This restores payable liability and holds the earnings. It does not reverse a bank transfer.",
                    )
                  )
                    void action(`settlements/${selected}/reverse`, {
                      reason: data.get("reason"),
                    });
                }}
              >
                <label>
                  Reversal reason
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <button disabled={busy}>Record audited reversal</button>
              </form>
            )}
          {view === "settlements" && detail.data?.status === "REVERSED" && (
            <p>
              Reversed: payable liability restored. Earnings remain on hold and
              will not be automatically paid again.
            </p>
          )}
          {role === "admin" &&
            view === "payments" &&
            detail.data?.provider === "development" &&
            detail.data?.status === "PENDING" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Simulate a sandbox payment capture? No real money will move.",
                    )
                  )
                    void action(`payments/${selected}/simulate`);
                }}
              >
                Simulate development capture
              </button>
            )}
        </section>
      )}
      {role === "admin" && view === "refunds" && (
        <form
          className="stack finance-detail"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (
              window.confirm(
                "Request this refund? A configured real provider can return money to the customer.",
              )
            )
              void action("refunds", {
                paymentId: data.get("paymentId"),
                amount: Number(data.get("amount")),
                reason: data.get("reason"),
                override: data.get("override") === "on",
              });
          }}
        >
          <h2>Request refund</h2>
          <label>
            Payment ID
            <input name="paymentId" required />
          </label>
          <label>
            Amount in paise
            <input name="amount" type="number" min="1" step="1" required />
          </label>
          <label>
            Reason
            <input name="reason" minLength={5} maxLength={500} required />
          </label>
          <label>
            <input name="override" type="checkbox" /> Override time policy
            (audited)
          </label>
          <button disabled={busy}>Request refund</button>
        </form>
      )}
      {role === "admin" && view === "settlements" && (
        <form
          className="stack finance-detail"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void action("settlements", {
              gymId: data.get("gymId"),
              start: data.get("start"),
              end: data.get("end"),
            });
          }}
        >
          <h2>Generate settlement</h2>
          <label>
            Gym ID
            <input name="gymId" required />
          </label>
          <label>
            Period start
            <input name="start" type="date" required />
          </label>
          <label>
            Period end (exclusive)
            <input name="end" type="date" required />
          </label>
          <button disabled={busy}>Generate audited settlement</button>
        </form>
      )}
      {actionError && (
        <p role="alert" className="error-banner">
          {actionError}
        </p>
      )}
    </>
  );
}
