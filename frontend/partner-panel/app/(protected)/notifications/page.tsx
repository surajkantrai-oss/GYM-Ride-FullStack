"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageHeader, PageState } from "@gymride/web-ui";
import type { InAppNotification, PageMeta } from "@gymride/types";
import { api } from "@/lib/api";
import { partnerNotificationHref } from "@/lib/notification-route";

export default function PartnerNotificationsPage() {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["partner-notifications", page], queryFn: () => api.request<{ data: InAppNotification[]; meta: PageMeta }>(`/notifications?page=${page}&limit=20`) });
  const count = useQuery({ queryKey: ["partner-notification-count"], queryFn: () => api.request<{ count: number }>("/notifications/unread-count") });
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["partner-notifications"] }); await cache.invalidateQueries({ queryKey: ["partner-notification-count"] }); };
  const mark = useMutation({ mutationFn: (id: string) => api.request(`/notifications/${id}/read`, { method: "PATCH" }), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.request("/notifications/read-all", { method: "POST" }), onSuccess: refresh });
  return <>
    <PageHeader eyebrow="Operations" title="Notifications" description="Booking, review and settlement updates for your account." />
    <div className="toolbar"><span>{count.data?.count ?? 0} unread</span><button disabled={markAll.isPending || !count.data?.count} onClick={() => markAll.mutate()}>Mark all read</button></div>
    {list.isLoading ? <PageState title="Loading notifications…" /> : list.error ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : !list.data?.data.length ? <PageState title="No notifications yet" /> : <>
      <div className="table-wrap"><table><thead><tr><th>Update</th><th>When</th><th>Action</th></tr></thead><tbody>{list.data.data.map((item) => {
        const href = partnerNotificationHref(item.data);
        return <tr key={item.id}><td><strong>{item.readAt ? "" : "● "}{item.title}</strong><br />{item.body}</td><td>{new Date(item.createdAt).toLocaleString("en-IN")}</td><td>{!item.readAt && <button disabled={mark.isPending} onClick={() => mark.mutate(item.id)}>Mark read</button>} {href && <Link href={href}>Open</Link>}</td></tr>;
      })}</tbody></table></div>
      <div className="toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!list.data.meta.hasNextPage} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
    {(mark.error || markAll.error) && <ErrorState error={mark.error || markAll.error} />}
  </>;
}
