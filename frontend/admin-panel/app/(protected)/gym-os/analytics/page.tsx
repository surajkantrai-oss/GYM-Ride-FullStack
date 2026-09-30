"use client";
import type {GymOsAnalyticsOverview} from "@gymride/types";
import {ErrorState,PageHeader,PageState} from "@gymride/web-ui";
import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {api} from "@/lib/api";
export default function AdminAnalytics(){const[gymId,setGymId]=useState("");const q=useQuery({queryKey:["admin-gymos-analytics",gymId],enabled:!!gymId,queryFn:()=>api.request<GymOsAnalyticsOverview>(`/admin/gym-os/analytics/${gymId}`)});const d=q.data;return <><PageHeader eyebrow="GymOS oversight · read only" title="Gym analytics" description="Inspect deterministic operational aggregates without altering gym data."/><section className="panel filter-row"><input value={gymId} onChange={e=>setGymId(e.target.value)} placeholder="Gym UUID"/></section>{q.error?<ErrorState error={q.error}/>:q.isLoading?<PageState title="Loading analytics…"/>:d&&<section className="metric-grid">{[["Active members",d.activeMembers],["Active memberships",d.activeMemberships],["Expiring · 7d",d.expiringIn7Days],["Check-ins today",d.todayAttendance],["Visitors · 30d",d.uniqueVisitors30Days],["Overdue minor units",d.overdueMinor]].map(([k,v])=><article className="metric-card" key={k}><span>{k}</span><strong>{v}</strong></article>)}</section>}</>}
