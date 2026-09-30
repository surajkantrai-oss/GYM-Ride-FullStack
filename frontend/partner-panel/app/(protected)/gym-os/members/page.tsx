"use client";
import type {
  GymOsMember,
  GymOsMemberImportReport,
  GymOsMemberSummary,
  GymSummary,
  PaginatedResponse,
} from "@gymride/types";
import {
  ErrorState,
  PageHeader,
  PageState,
  StatusBadge,
  pushToast,
  useAuth,
} from "@gymride/web-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { canManageGymOsMembers } from "@/lib/gym-os";

export default function GymOsMembersPage() {
  const cache = useQueryClient(),
    { user } = useAuth();
  const [gym, setGym] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [form, setForm] = useState(false),
    [csv, setCsv] = useState(
      "firstName,lastName,phone,email,primaryBranchId,joinedAt\n",
    ),
    [preview, setPreview] = useState<GymOsMemberImportReport | null>(null);
  const gyms = useQuery({
    queryKey: ["member-gyms"],
    queryFn: () =>
      api.request<PaginatedResponse<GymSummary>>(
        "/partner/gyms?page=1&limit=100",
      ),
  });
  const gymId = gym || gyms.data?.data[0]?.id || "";
  const selectedGym = gyms.data?.data.find((item) => item.id === gymId);
  const summary = useQuery({
    queryKey: ["member-summary", gymId],
    enabled: !!gymId,
    queryFn: () =>
      api.request<GymOsMemberSummary>(
        `/partner/gyms/${gymId}/gym-os/members/summary`,
      ),
  });
  const members = useQuery({
    queryKey: ["members", gymId, search, status, page],
    enabled: !!gymId,
    queryFn: () =>
      api.request<PaginatedResponse<GymOsMember>>(
        `/partner/gyms/${gymId}/gym-os/members?page=${page}&pageSize=25&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`,
      ),
  });
  const refresh = async () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["members", gymId] }),
      cache.invalidateQueries({ queryKey: ["member-summary", gymId] }),
    ]);
  const create = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.request(`/partner/gyms/${gymId}/gym-os/members`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setForm(false);
      pushToast("Member added", "GymOS member created.");
      await refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.request(`/partner/gyms/${gymId}/gym-os/members/${id}/${action}`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const previewCsv = useMutation({
    mutationFn: () =>
      api.request<GymOsMemberImportReport>(
        `/partner/gyms/${gymId}/gym-os/members/import/preview`,
        { method: "POST", body: JSON.stringify({ csv }) },
      ),
    onSuccess: setPreview,
  });
  const importCsv = useMutation({
    mutationFn: () =>
      api.request<GymOsMemberImportReport>(
        `/partner/gyms/${gymId}/gym-os/members/import`,
        { method: "POST", body: JSON.stringify({ csv }) },
      ),
    onSuccess: async (r) => {
      setPreview(r);
      await refresh();
    },
  });
  const canWrite = canManageGymOsMembers(user?.roles ?? []);
  if (gyms.isLoading) return <PageState title="Loading members…" />;
  return (
    <>
      <PageHeader
        eyebrow="GymOS · Member directory"
        title="Members"
        description="Direct gym members remain separate from GYMRide customer accounts."
        action={
          canWrite ? (
            <button
              disabled={summary.data?.remainingCapacity === 0}
              onClick={() => setForm(true)}
            >
              Add member
            </button>
          ) : undefined
        }
      />
      <section className="panel filter-row">
        <select value={gymId} onChange={(e) => setGym(e.target.value)}>
          {gyms.data?.data.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email or code"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Current members</option>
          <option>ACTIVE</option>
          <option>INACTIVE</option>
          <option>ARCHIVED</option>
        </select>
      </section>
      {summary.error ? (
        <ErrorState error={summary.error} />
      ) : (
        summary.data && (
          <>
            <section className="metric-grid">
              {[
                ["Active", summary.data.active],
                ["Inactive", summary.data.inactive],
                ["Archived", summary.data.archived],
                [
                  "Plan usage",
                  `${summary.data.active} / ${summary.data.memberLimit}`,
                ],
              ].map(([k, v]) => (
                <article className="metric" key={k}>
                  <strong>{v}</strong>
                  <span>{k}</span>
                </article>
              ))}
            </section>
            {summary.data.remainingCapacity <= 5 && (
              <div className="notice-banner">
                {summary.data.overLimit
                  ? "Over plan limit; existing data is retained but new activations are blocked."
                  : `${summary.data.remainingCapacity} active slots remaining. Upgrade from GymOS Overview if needed.`}
              </div>
            )}
          </>
        )
      )}
      {form && (
        <section className="panel">
          <h2>Add member</h2>
          <form
            className="form-grid"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              create.mutate(
                Object.fromEntries(
                  [...new FormData(e.currentTarget).entries()].filter(
                    ([, value]) => String(value).trim(),
                  ),
                ) as Record<string, string>,
              );
            }}
          >
            {[
              ["firstName", "First name *"],
              ["lastName", "Last name"],
              ["phone", "Phone in E.164 *"],
              ["email", "Email"],
              ["joinedAt", "Joined date"],
              ["notes", "Notes"],
            ].map(([name, label]) => (
              <label className="field" key={name}>
                <span>{label}</span>
                <input
                  name={name}
                  required={name === "firstName" || name === "phone"}
                  type={
                    name === "joinedAt"
                      ? "date"
                      : name === "email"
                        ? "email"
                        : "text"
                  }
                />
              </label>
            ))}
            <label className="field">
              <span>Primary branch</span>
              <select name="primaryBranchId">
                <option value="">Not assigned</option>
                {selectedGym?.branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="span-2 filter-row">
              <button>Create member</button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {members.isLoading ? (
        <PageState title="Loading directory…" />
      ) : members.error ? (
        <ErrorState error={members.error} />
      ) : !members.data?.data.length ? (
        <PageState title="No members found" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Code</th>
                <th>Phone</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.data.data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/gym-os/members/${m.id}?gymId=${gymId}`}>
                      <b>
                        {m.firstName} {m.lastName}
                      </b>
                    </Link>
                    <br />
                    <small>{m.email || "No email"}</small>
                  </td>
                  <td>{m.memberCode}</td>
                  <td>{m.phone}</td>
                  <td>{m.primaryBranch?.name || "—"}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>
                    {m.joinedAt
                      ? new Date(m.joinedAt).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td>
                    {canWrite && m.status !== "ARCHIVED" && (
                      <div className="filter-row">
                        {m.status === "ACTIVE" ? (
                          <button
                            className="button-secondary"
                            onClick={() =>
                              change.mutate({ id: m.id, action: "deactivate" })
                            }
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              change.mutate({ id: m.id, action: "reactivate" })
                            }
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          className="button-danger"
                          onClick={() =>
                            confirm("Archive this member?") &&
                            change.mutate({ id: m.id, action: "archive" })
                          }
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="filter-row">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {members.data.meta.page} of{" "}
              {members.data.meta.totalPages || 1}
            </span>
            <button
              disabled={page >= members.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {canWrite && (
        <section className="panel">
          <h2>CSV import</h2>
          <p className="muted">
            UTF-8 CSV, maximum 1,000 rows. Preview is non-mutating and commit is
            atomic.
          </p>
          <textarea
            rows={7}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
          />
          <div className="filter-row">
            <button
              className="button-secondary"
              onClick={() => previewCsv.mutate()}
            >
              Validate preview
            </button>
            <button
              disabled={
                !preview || preview.errors.length > 0 || !preview.validRows
              }
              onClick={() => importCsv.mutate()}
            >
              Confirm import
            </button>
          </div>
          {preview && (
            <div className="notice-banner">
              {preview.validRows} valid · {preview.failedRows} failed ·{" "}
              {preview.importedRows} imported
              {preview.errors.map((e) => (
                <div key={`${e.rowNumber}-${e.field}`}>
                  Row {e.rowNumber}: {e.message}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
