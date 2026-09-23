"use client";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageHeader, PageState, StatusBadge } from "@gymride/web-ui";
import type { FlexPlan, PageMeta, ServiceCity } from "@gymride/types";
import { api } from "@/lib/api";

interface Summary { activeSubscriptions: number; reservedUsage: number; consumedUsage: number; subscriptionRevenue: number; gymReimbursements: number }
interface Row { id: string; status?: string; planName?: string; customerId?: string; gymId?: string; branchId?: string; reimbursementMinor?: number; createdAt: string }
interface Page { data: Row[]; meta: PageMeta }
const rupees = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);

export default function AdminFlexPage() {
  const cache = useQueryClient();
  const [tab, setTab] = useState<"subscriptions" | "usage" | "participations">("subscriptions");
  const [page, setPage] = useState(1);
  const [city, setCity] = useState({ code: "", name: "", state: "" });
  const [plan, setPlan] = useState({ code: "", name: "", priceMinor: "", totalUsageLimit: "", primaryCityLimit: "", secondaryCityLimit: "" });
  const summary = useQuery({ queryKey: ["admin-flex-summary"], queryFn: () => api.request<Summary>("/admin/flex/summary") });
  const rows = useQuery({ queryKey: ["admin-flex", tab, page], queryFn: () => api.request<Page>(`/admin/flex/${tab}?page=${page}&limit=20`) });
  const cities = useQuery({ queryKey: ["flex-cities"], queryFn: () => api.request<ServiceCity[]>("/admin/flex/cities") });
  const plans = useQuery({ queryKey: ["flex-plans"], queryFn: () => api.request<FlexPlan[]>("/admin/flex/plans") });
  const createCity = useMutation({ mutationFn: () => api.request("/admin/flex/cities", { method: "POST", body: JSON.stringify(city) }), onSuccess: async () => { setCity({ code: "", name: "", state: "" }); await cache.invalidateQueries({ queryKey: ["flex-cities"] }); } });
  const createPlan = useMutation({ mutationFn: () => api.request("/admin/flex/plans", { method: "POST", body: JSON.stringify({ code: plan.code, name: plan.name, priceMinor: Number(plan.priceMinor), currency: "INR", durationDays: 30, totalUsageLimit: Number(plan.totalUsageLimit), primaryCityLimit: Number(plan.primaryCityLimit), secondaryCityLimit: Number(plan.secondaryCityLimit), dailyUsageLimit: 1, bookingAdvanceDays: 14, eligiblePlanTypes: ["DAY_PASS"], status: "ACTIVE" }) }), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["flex-plans"] }); } });
  const submit = (event: FormEvent, action: () => void) => { event.preventDefault(); action(); };
  return <>
    <PageHeader eyebrow="Hybrid membership operations" title="GYMRide Flex" description="Manage canonical cities and platform plans; monitor subscriptions, usage and gym participation." />
    {summary.isLoading ? <PageState title="Loading Flex summary…" /> : summary.error ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> : <section className="metric-grid">
      <article className="metric"><strong>{summary.data?.activeSubscriptions ?? 0}</strong><span>Active subscriptions</span></article>
      <article className="metric"><strong>{summary.data?.reservedUsage ?? 0}</strong><span>Reserved visits</span></article>
      <article className="metric"><strong>{summary.data?.consumedUsage ?? 0}</strong><span>Consumed visits</span></article>
      <article className="metric"><strong>{rupees(summary.data?.subscriptionRevenue ?? 0)}</strong><span>Subscription revenue</span></article>
      <article className="metric"><strong>{rupees(summary.data?.gymReimbursements ?? 0)}</strong><span>Gym reimbursements</span></article>
    </section>}
    <section className="panel"><h2>Canonical service cities</h2><form className="toolbar" onSubmit={(e) => submit(e, () => createCity.mutate())}><input aria-label="City code" placeholder="Code" value={city.code} onChange={(e) => setCity({ ...city, code: e.target.value })} /><input aria-label="City name" placeholder="City" value={city.name} onChange={(e) => setCity({ ...city, name: e.target.value })} /><input aria-label="State" placeholder="State" value={city.state} onChange={(e) => setCity({ ...city, state: e.target.value })} /><button disabled={createCity.isPending}>Add city</button></form><p className="muted">{cities.data?.map((item) => `${item.name}, ${item.state}`).join(" · ") || "No active cities"}</p></section>
    <section className="panel"><h2>Platform Flex plans</h2><form className="toolbar" onSubmit={(e) => submit(e, () => createPlan.mutate())}>{(["code", "name", "priceMinor", "totalUsageLimit", "primaryCityLimit", "secondaryCityLimit"] as const).map((field) => <input key={field} aria-label={field} placeholder={field} value={plan[field]} onChange={(e) => setPlan({ ...plan, [field]: e.target.value })} />)}<button disabled={createPlan.isPending}>Create active plan</button></form><p className="muted">{plans.data?.map((item) => `${item.name} (${rupees(item.priceMinor)})`).join(" · ") || "No active plans"}</p></section>
    <div className="toolbar">{(["subscriptions", "usage", "participations"] as const).map((value) => <button key={value} onClick={() => { setTab(value); setPage(1); }}>{value}</button>)}</div>
    {rows.isLoading ? <PageState title="Loading records…" /> : rows.error ? <ErrorState error={rows.error} retry={() => void rows.refetch()} /> : !rows.data?.data.length ? <PageState title="No Flex records" /> : <div className="table-wrap"><table><thead><tr><th>ID</th><th>Status</th><th>Plan / gym</th><th>Customer / branch</th><th>Created</th></tr></thead><tbody>{rows.data.data.map((row) => <tr key={row.id}><td>{row.id.slice(0, 8)}</td><td><StatusBadge status={row.status || "CONFIGURED"} /></td><td>{row.planName || row.gymId?.slice(0, 8) || "—"}</td><td>{row.customerId?.slice(0, 8) || row.branchId?.slice(0, 8) || "—"}</td><td>{new Date(row.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div>}
    <div className="toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!rows.data?.meta.hasNextPage} onClick={() => setPage(page + 1)}>Next</button></div>
  </>;
}
