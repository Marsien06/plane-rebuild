/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useParams } from "next/navigation";
import { format, startOfMonth, subDays } from "date-fns";
import { Table, TableHeader, TableRow, TableCell, TableHead, TableBody } from "@makeplane/propel/components/table";
import { Input } from "@makeplane/propel/components/input";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@makeplane/propel/components/dialog";
import { Calendar } from "@makeplane/propel/components/calendar";
import { DownloadOutline, CalendarOutline } from "@makeplane/propel/icons";
import { formatTrackedTime, cn } from "@plane/utils";
import { EIssueServiceType, type IUserLite } from "@plane/types";
// services
import { IssueService } from "@/services/issue";

export interface TimeEntryReportUser {
  user: IUserLite | null;
  total_seconds: number;
  entry_count: number;
}

export interface TimeEntryReportIssue {
  issue_id: string;
  issue_name: string;
  total_seconds: number;
  entry_count: number;
  by_user: TimeEntryReportUser[];
}

export interface TimeEntryReportData {
  total_seconds: number;
  entry_count: number;
  by_issue: TimeEntryReportIssue[];
  by_user: TimeEntryReportUser[];
}

type TRange = { from: Date | undefined; to?: Date | undefined };
type TFilters = { start_date: string; end_date: string; user_id: string };

const EMPTY_FILTERS: TFilters = { start_date: "", end_date: "", user_id: "" };

const PRESETS: { key: string; label: string; get: () => TRange | undefined }[] = [
  { key: "all", label: "All time", get: () => undefined },
  { key: "7d", label: "Last 7 days", get: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { key: "30d", label: "Last 30 days", get: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { key: "month", label: "This month", get: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
];

const ISO = "yyyy-MM-dd";
const byTimeDesc = <T extends { total_seconds: number }>(rows: T[]) =>
  [...rows].sort((a, b) => b.total_seconds - a.total_seconds);
const entriesLabel = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

// --- CSV -------------------------------------------------------------------
// quote fields containing separators, and defuse spreadsheet formulas (=, +, -, @)
const csvCell = (value: string | number) => {
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---------------------------------------------------------------------------
// presentational pieces
// ---------------------------------------------------------------------------

function ShareBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    // track = text color at low opacity, so it stays visible in light and dark themes
    <div className="relative h-1.5 w-full min-w-24 overflow-hidden rounded-full text-tertiary" aria-hidden="true">
      <div className="absolute inset-0 bg-current opacity-25" />
      <div className="relative h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MemberCell({ user, unknownLabel }: { user: IUserLite | null; unknownLabel: string }) {
  if (!user) return <span className="text-13 text-tertiary">{unknownLabel}</span>;
  return (
    <span className="flex items-center gap-2">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="size-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full bg-layer-1 text-11 font-medium text-secondary"
          aria-hidden="true"
        >
          {(user.display_name?.[0] ?? "?").toUpperCase()}
        </span>
      )}
      <span className="truncate text-13 text-primary">{user.display_name}</span>
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-subtle bg-surface-1 px-4 py-3">
      <p className="text-12 text-tertiary">{label}</p>
      <p className="mt-1 text-20 font-semibold text-primary tabular-nums">{value}</p>
    </div>
  );
}

const num = "block text-right tabular-nums";

// ---------------------------------------------------------------------------
// main component
// ---------------------------------------------------------------------------

export function TimeTrackingReport() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectId = params.projectId as string;

  const issueService = useMemo(() => new IssueService(EIssueServiceType.ISSUES), []);

  const [reportData, setReportData] = useState<TimeEntryReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TFilters>(EMPTY_FILTERS);
  const [dateRange, setDateRange] = useState<TRange | undefined>();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [query, setQuery] = useState("");
  // remember every member seen so the member filter keeps its options after filtering down to one person
  const [members, setMembers] = useState<Map<string, IUserLite>>(new Map());
  const requestId = useRef(0);

  const fetchReport = useCallback(async () => {
    const id = ++requestId.current; // ignore responses from superseded requests
    setIsLoading(true);
    setError(null);
    try {
      const data: TimeEntryReportData = await issueService.getIssueTimeEntriesReport(workspaceSlug, projectId, {
        ...(filters.start_date ? { start_date: filters.start_date } : {}),
        ...(filters.end_date ? { end_date: filters.end_date } : {}),
        ...(filters.user_id ? { user_id: filters.user_id } : {}),
      });
      if (id !== requestId.current) return;
      setReportData(data);
      setMembers((prev) => {
        const next = new Map(prev);
        data.by_user.forEach((row) => row.user && next.set(row.user.id, row.user));
        return next;
      });
    } catch (e) {
      console.error("Failed to fetch time tracking report:", e);
      if (id === requestId.current) setError("Couldn't load the time report.");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [issueService, workspaceSlug, projectId, filters.start_date, filters.end_date, filters.user_id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // --- date range ----------------------------------------------------------
  const applyRange = (range: TRange | undefined) => {
    setDateRange(range);
    setFilters((prev) =>
      range?.from && range?.to
        ? { ...prev, start_date: format(range.from, ISO), end_date: format(range.to, ISO) }
        : { ...prev, start_date: "", end_date: "" }
    );
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.get();
    return r
      ? filters.start_date === format(r.from!, ISO) && filters.end_date === format(r.to!, ISO)
      : !filters.start_date && !filters.end_date;
  })?.key;

  const hasCustomRange = !activePreset && !!filters.start_date && !!filters.end_date;
  const rangeLabel =
    hasCustomRange && dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
      : "Custom range";

  const hasActiveFilters = !!(filters.start_date || filters.user_id || query.trim());
  const clearAll = () => {
    setDateRange(undefined);
    setFilters(EMPTY_FILTERS);
    setQuery("");
  };

  // --- derived rows (search is client-side, by work item name) ---------------
  const rows = useMemo(() => {
    if (!reportData) return [];
    const q = query.trim().toLowerCase();
    return byTimeDesc(reportData.by_issue).filter((i) => !q || i.issue_name.toLowerCase().includes(q));
  }, [reportData, query]);

  const visibleTotals = useMemo(
    () =>
      rows.reduce((acc, i) => ({ seconds: acc.seconds + i.total_seconds, entries: acc.entries + i.entry_count }), {
        seconds: 0,
        entries: 0,
      }),
    [rows]
  );

  // --- export (what you see is what you get) ----------------------------------
  const handleExport = () => {
    if (rows.length === 0) return;
    const header = ["Work item", "Member", "Time", "Hours", "Entries"];
    const lines: (string | number)[][] = [];
    rows.forEach((issue) =>
      issue.by_user.forEach((u) =>
        lines.push([
          issue.issue_name,
          u.user?.display_name || "Unknown",
          formatTrackedTime(u.total_seconds),
          (u.total_seconds / 3600).toFixed(2),
          u.entry_count,
        ])
      )
    );
    const csv = [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM so Excel reads UTF-8
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `time-tracking-report-${format(new Date(), ISO)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-12 transition-colors",
      active
        ? "border-accent-primary bg-accent-primary/10 font-medium text-primary"
        : "border-subtle text-secondary hover:bg-layer-1"
    );

  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full w-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-3">
        <h2 className="text-18 font-medium text-primary">{t("issue.time_tracking.log_time")}</h2>
        <Button
          variant="secondary"
          size="sm"
          stretch="auto"
          label={t("common.export")}
          onClick={handleExport}
          disabled={rows.length === 0}
          icon={<DownloadOutline className="h-4 w-4" />}
          iconPosition="start"
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {/* summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t("common.total")}
              value={reportData ? formatTrackedTime(reportData.total_seconds) : "–"}
            />
            <StatCard label={t("common.entries")} value={reportData?.entry_count ?? "–"} />
            <StatCard label="Work items" value={reportData?.by_issue.length ?? "–"} />
            <StatCard label="Members" value={reportData?.by_user.length ?? "–"} />
          </div>

          {/* toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Date range">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={activePreset === p.key}
                  onClick={() => applyRange(p.get())}
                  className={chip(activePreset === p.key)}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={hasCustomRange}
                onClick={() => setIsCalendarOpen(true)}
                className={cn(chip(hasCustomRange), "inline-flex items-center gap-1.5")}
              >
                <CalendarOutline className="h-3.5 w-3.5" />
                {rangeLabel}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t("common.user")}
                value={filters.user_id}
                onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))}
                className="focus-visible:outline-accent-primary h-8 rounded-sm border border-subtle bg-surface-1 px-2 text-13 text-primary focus-visible:outline-2"
              >
                <option value="">All members</option>
                {[...members.values()].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
              <div className="w-56">
                <Input
                  size="md"
                  placeholder={t("common.search_issues", { count: 2 })}
                  value={query}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* body */}
          {error ? (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-subtle px-4 py-3"
              role="alert"
            >
              <p className="text-danger text-13">{error}</p>
              <Button variant="secondary" size="sm" stretch="auto" label="Try again" onClick={fetchReport} />
            </div>
          ) : isLoading && !reportData ? (
            <div
              className="flex animate-pulse flex-col gap-px overflow-hidden rounded-md border border-subtle"
              role="status"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 bg-layer-1" />
              ))}
            </div>
          ) : reportData && rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-subtle px-4 py-14 text-center">
              <p className="text-14 font-medium text-primary">
                {reportData.by_issue.length === 0 ? t("issue.time_tracking.empty") : "No work items match your search"}
              </p>
              <p className="mt-1 text-12 text-tertiary">
                {hasActiveFilters ? "Try a wider date range or clear the filters." : "Logged time will show up here."}
              </p>
              {hasActiveFilters && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" size="sm" stretch="auto" label="Clear filters" onClick={clearAll} />
                </div>
              )}
            </div>
          ) : reportData ? (
            <div
              className={cn(
                "overflow-hidden rounded-md border border-subtle transition-opacity",
                isLoading && "opacity-60"
              )}
              aria-busy={isLoading}
            >
              <Table variant="table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("issue.label", { count: 2 })}</TableHead>
                    <TableHead>{t("common.user")}</TableHead>
                    <TableHead>Share</TableHead>
                    <TableHead>
                      <span className={num}>Time</span>
                    </TableHead>
                    <TableHead>
                      <span className={num}>{t("common.entries")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((issue) => {
                    const users = byTimeDesc(issue.by_user);
                    const single = users.length <= 1;
                    return (
                      <Fragment key={issue.issue_id}>
                        <TableRow>
                          <TableCell>
                            <span className="text-13 font-medium text-primary">{issue.issue_name}</span>
                          </TableCell>
                          <TableCell>
                            {single ? (
                              <MemberCell user={users[0]?.user ?? null} unknownLabel={t("common.unknown")} />
                            ) : (
                              <span className="text-13 text-tertiary">{users.length} members</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <ShareBar value={issue.total_seconds} total={reportData.total_seconds} />
                          </TableCell>
                          <TableCell>
                            <span className={cn(num, "text-13 font-medium text-primary")}>
                              {formatTrackedTime(issue.total_seconds)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={cn(num, "text-12 text-tertiary")}>{entriesLabel(issue.entry_count)}</span>
                          </TableCell>
                        </TableRow>
                        {!single &&
                          users.map((u, idx) => (
                            <TableRow key={`${issue.issue_id}-${u.user?.id ?? "unknown"}-${idx}`}>
                              <TableCell>
                                <span className="sr-only">{issue.issue_name}</span>
                              </TableCell>
                              <TableCell>
                                <MemberCell user={u.user} unknownLabel={t("common.unknown")} />
                              </TableCell>
                              <TableCell>
                                <ShareBar value={u.total_seconds} total={issue.total_seconds} />
                              </TableCell>
                              <TableCell>
                                <span className={cn(num, "text-13 text-secondary")}>
                                  {formatTrackedTime(u.total_seconds)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={cn(num, "text-12 text-tertiary")}>{entriesLabel(u.entry_count)}</span>
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={3}>
                      <span className="block text-right text-13 font-medium text-primary">
                        {query.trim() ? `${t("common.total")} (filtered)` : t("common.total")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(num, "text-13 font-semibold text-primary")}>
                        {formatTrackedTime(visibleTotals.seconds)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(num, "text-12 font-medium text-secondary")}>
                        {entriesLabel(visibleTotals.entries)}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </div>

      {/* custom range picker */}
      <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t("common.filters")}</DialogTitle>
            <DialogDescription>{t("common.filter_description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-4 py-4">
            <Calendar mode="range" selected={dateRange} onSelect={applyRange} weekStartsOn={1} />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                stretch="auto"
                label="Clear"
                onClick={() => {
                  applyRange(undefined);
                  setIsCalendarOpen(false);
                }}
              />
              <Button
                variant="primary"
                size="sm"
                stretch="auto"
                label="Done"
                onClick={() => setIsCalendarOpen(false)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default observer(TimeTrackingReport);
