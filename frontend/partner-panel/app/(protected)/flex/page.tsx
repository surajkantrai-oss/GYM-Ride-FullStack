"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageHeader, PageState, StatusBadge } from "@gymride/web-ui";
import type { GymBranch, GymSummary, PageMeta, PaginatedResponse, ServiceCity } from "@gymride/types";
import { api } from "@/lib/api";
interface Summary { reserved: number; consumed: number; reimbursementEarned: number }
interface Row { id: string; status?: string; bookingId?: string; branchId?: string; reimbursementMinor?: number; netAmount?: number; createdAt: string }
interface Page { data: Row[]; meta: PageMeta }
interface Participation { id: string; branchId: string; serviceCityId: string; enabled: boolean; branch: { id: string; name: string; city: string }; serviceCity: ServiceCity }
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
export default function PartnerFlexPage() {
  const cache = useQueryClient();
  const [gymId, setGymId] = useState(""); const [tab, setTab] = useState<"bookings" | "usage" | "earnings">("usage"); const [page, setPage] = useState(1);
  const gyms = useQuery({ queryKey: ["partner-gyms", "flex"], queryFn: () => api.request<PaginatedResponse<GymSummary>>("/partner/gyms?page=1&limit=100") });
  useEffect(() => { if (!gymId && gyms.data?.data[0]) setGymId(gyms.data.data[0].id); }, [gymId, gyms.data]);
  const summary = useQuery({ queryKey: ["partner-flex-summary", gymId], enabled: !!gymId, queryFn: () => api.request<Summary>(`/partner/flex/summary?gymId=${gymId}`) });
  const rows = useQuery({ queryKey: ["partner-flex", tab, gymId, page], enabled: !!gymId, queryFn: () => api.request<Page>(`/partner/flex/${tab}?gymId=${gymId}&page=${page}&limit=20`) });
  const cities = useQuery({ queryKey: ["partner-flex-cities"], queryFn: () => api.request<ServiceCity[]>("/partner/flex/cities") });
  const branches = useQuery({ queryKey: ["partner-flex-branches", gymId], enabled: !!gymId, queryFn: () => api.request<GymBranch[]>(`/partner/gyms/${gymId}/branches`) });
  const participation = useQuery({ queryKey: ["partner-flex-participation", gymId], enabled: !!gymId, queryFn: () => api.request<Participation[]>(`/partner/flex/gyms/${gymId}/participation`) });
  const save = useMutation({ mutationFn: (input: { branchId: string; serviceCityId: string; enabled: boolean }) => api.request(`/partner/flex/gyms/${gymId}/participation`, { method: "PATCH", body: JSON.stringify({ ...input, allowedPlanTypes: ["DAY_PASS"] }) }), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["partner-flex-participation", gymId] }); } });
  return <><PageHeader eyebrow="Hybrid membership" title="Flex participation" description="Read-only reservations, consumed visits and reimbursements for gyms you manage." />
    <div className="toolbar"><select aria-label="Gym" value={gymId} onChange={(e) => { setGymId(e.target.value); setPage(1); }}><option value="">Select gym</option>{gyms.data?.data.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select>{(["bookings", "usage", "earnings"] as const).map((value) => <button key={value} onClick={() => { setTab(value); setPage(1); }}>{value}</button>)}</div>
    <section className="panel"><h2>Branch participation</h2><p className="muted">Enable eligible branches against a canonical city. Reimbursement amounts remain controlled by platform administrators.</p>{branches.data?.map((branch) => { const current = participation.data?.find((item) => item.branchId === branch.id); return <div className="toolbar" key={branch.id}><strong>{branch.name}</strong><select aria-label={`Flex city for ${branch.name}`} defaultValue={current?.serviceCityId || ""} id={`city-${branch.id}`}><option value="">Select city</option>{cities.data?.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select><button disabled={save.isPending} onClick={() => { const select = document.getElementById(`city-${branch.id}`) as HTMLSelectElement | null; if (select?.value) save.mutate({ branchId: branch.id, serviceCityId: select.value, enabled: !current?.enabled }); }}>{current?.enabled ? "Disable Flex" : "Enable Flex"}</button></div>; })}</section>
    {summary.error ? <ErrorState error={summary.error} retry={() => void summary.refetch()} /> : <section className="metric-grid"><article className="metric"><strong>{summary.data?.reserved ?? 0}</strong><span>Reserved</span></article><article className="metric"><strong>{summary.data?.consumed ?? 0}</strong><span>Consumed</span></article><article className="metric"><strong>{money(summary.data?.reimbursementEarned ?? 0)}</strong><span>Reimbursement earned</span></article></section>}
    {rows.isLoading ? <PageState title="Loading Flex activity…" /> : rows.error ? <ErrorState error={rows.error} retry={() => void rows.refetch()} /> : !rows.data?.data.length ? <PageState title="No Flex activity" detail="Eligible customer visits will appear here." /> : <div className="table-wrap"><table><thead><tr><th>ID</th><th>Status</th><th>Booking</th><th>Branch</th><th>Amount</th><th>Created</th></tr></thead><tbody>{rows.data.data.map((row) => <tr key={row.id}><td>{row.id.slice(0,8)}</td><td><StatusBadge status={row.status || "EARNED"} /></td><td>{row.bookingId?.slice(0,8) || "—"}</td><td>{row.branchId?.slice(0,8) || "—"}</td><td>{money(row.netAmount ?? row.reimbursementMinor ?? 0)}</td><td>{new Date(row.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div>}
    <div className="toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!rows.data?.meta.hasNextPage} onClick={() => setPage(page + 1)}>Next</button></div>
  </>;
}
