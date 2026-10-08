/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import { EIssueServiceType, type TTimeEntriesReport } from "@plane/types";
import { formatTrackedTime } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { IssueService } from "@/services/issue";
import type { Route } from "./+types/page";

const issueService = new IssueService(EIssueServiceType.ISSUES);

// ---------------------------------------------------------------------------
// types & helpers
// ---------------------------------------------------------------------------

type TUserRow = TTimeEntriesReport["by_user"][number];
type TModuleRow = TTimeEntriesReport["by_module"][number];
type TCycleRow = TTimeEntriesReport["by_cycle"][number];
type TRange = { start: string; end: string };
type TTab = "module" | "member" | "cycle";
type TCycleView = "module" | "member";

const toISODate = (d: Date) => {
  // local date, not UTC, so "today" is what the user expects
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
};

const PRESETS: { key: string; label: string; get: () => TRange }[] = [
  { key: "7d", label: "Last 7 days", get: () => ({ start: daysAgo(6), end: toISODate(new Date()) }) },
  { key: "30d", label: "Last 30 days", get: () => ({ start: daysAgo(29), end: toISODate(new Date()) }) },
  {
    key: "month",
    label: "This month",
    get: () => {
      const now = new Date();
      return { start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISODate(now) };
    },
  },
  { key: "all", label: "All time", get: () => ({ start: "", end: "" }) },
];

const byTimeDesc = <T extends { total_seconds: number }>(rows: T[]) =>
  [...rows].sort((a, b) => b.total_seconds - a.total_seconds);

// the API can return several rows for the same user within a module; combine them
const mergeUsers = (rows: TUserRow[]): TUserRow[] => {
  const merged = new Map<string, TUserRow>();
  rows.forEach((row, idx) => {
    const key = row.user?.id ?? `unknown-${idx}`;
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            ...existing,
            total_seconds: existing.total_seconds + row.total_seconds,
            entry_count: existing.entry_count + row.entry_count,
          }
        : row
    );
  });
  return [...merged.values()];
};

const userKeyOf = (row: TUserRow) => row.user?.id ?? "unknown";

type TMemberIssue = { key: string; name: string; seconds: number; entries: number };
type TMemberModule = TMemberIssue & { issues: TMemberIssue[] };
type TMemberBreakdown = { modules: TMemberModule[] };

// For each member: the modules they worked in, and the work items inside each module
const buildMemberBreakdown = (report: TTimeEntriesReport): Map<string, TMemberBreakdown> => {
  const result = new Map<string, TMemberBreakdown>();
  const entryFor = (key: string) => {
    let entry = result.get(key);
    if (!entry) {
      entry = { modules: [] };
      result.set(key, entry);
    }
    return entry;
  };

  report.by_module.forEach((mod) => {
    const issueRows = mod.by_issue.map((issue) => ({
      issue,
      users: new Map(mergeUsers(issue.by_user).map((r) => [userKeyOf(r), r] as const)),
    }));

    mergeUsers(mod.by_user).forEach((row) => {
      const key = userKeyOf(row);
      const issues: TMemberIssue[] = issueRows
        .flatMap(({ issue, users }) => {
          const r = users.get(key);
          return r
            ? [{ key: issue.issue_id, name: issue.issue_name, seconds: r.total_seconds, entries: r.entry_count }]
            : [];
        })
        .sort((a, b) => b.seconds - a.seconds);

      entryFor(key).modules.push({
        key: mod.module_id ?? "no_module",
        name: mod.module_name,
        seconds: row.total_seconds,
        entries: row.entry_count,
        issues,
      });
    });
  });

  result.forEach((entry) => entry.modules.sort((a, b) => b.seconds - a.seconds));
  return result;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// ---------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------

type TNodeKind = "cycle" | "module" | "member" | "item";

// every row is exactly 44px tall, so the connector elbows (22px) always land on the row's vertical center
const ROW = "flex h-11 items-center gap-3 border-b border-subtle pr-3";

function ShareBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    // track = the text color at low opacity, so it stays visible in both light and dark themes
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full text-tertiary" aria-hidden="true">
      <span className="absolute inset-0 bg-current opacity-25" />
      <span className="relative block h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Metrics({
  seconds,
  entries,
  total,
  compact = false,
}: {
  seconds: number;
  entries: number;
  total: number;
  compact?: boolean;
}) {
  return (
    <>
      <span className="block w-28 min-w-0 shrink">
        <ShareBar value={seconds} total={total} />
      </span>
      <span
        className={`w-20 shrink-0 text-right tabular-nums ${
          compact ? "text-12 text-secondary" : "text-13 font-medium text-primary"
        }`}
      >
        {formatTrackedTime(seconds)}
      </span>
      <span
        className={`w-12 shrink-0 text-right text-tertiary tabular-nums md:w-20 ${compact ? "text-11" : "text-12"}`}
      >
        {entries}
        <span className="hidden md:inline"> {entries === 1 ? "entry" : "entries"}</span>
      </span>
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`size-3.5 shrink-0 text-tertiary transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// colored type badges, like the field-type badges in the reference design
const BADGE_TONE: Record<Exclude<TNodeKind, "member">, string> = {
  cycle: "bg-[rgba(99,102,241,0.14)] text-[#6366f1]",
  module: "bg-[rgba(168,85,247,0.14)] text-[#a855f7]",
  item: "bg-[rgba(34,197,94,0.14)] text-[#22c55e]",
};

function KindIcon({ kind }: { kind: Exclude<TNodeKind, "member"> }) {
  const svg = {
    className: "size-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  if (kind === "cycle")
    return (
      <svg {...svg}>
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    );
  if (kind === "module")
    return (
      <svg {...svg}>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function NodeBadge({ kind, name }: { kind: TNodeKind; name?: string }) {
  if (kind === "member")
    return (
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full border border-subtle bg-surface-2 text-11 font-medium text-secondary"
        aria-hidden="true"
      >
        {initialsOf(name ?? "")}
      </span>
    );
  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-md ${BADGE_TONE[kind]}`} aria-hidden="true">
      <KindIcon kind={kind} />
    </span>
  );
}

type TRowProps = {
  kind: TNodeKind;
  avatarName?: string;
  title: string;
  subtitle?: string;
  seconds: number;
  entries: number;
  total: number;
  compact?: boolean;
};

// open === undefined -> leaf (no chevron)
function RowBody({
  kind,
  avatarName,
  title,
  subtitle,
  seconds,
  entries,
  total,
  compact,
  open,
}: TRowProps & { open?: boolean }) {
  return (
    <>
      <NodeBadge kind={kind} name={avatarName ?? title} />
      {/* the name always keeps at least ~6rem; the date range shrinks first, the arrow never does */}
      <span className="flex min-w-28 flex-1 items-center gap-2">
        <span
          className={`truncate ${subtitle ? "max-w-[70%] shrink-0" : "min-w-0"} ${
            compact ? "text-12 text-secondary" : "text-13 font-medium text-primary"
          }`}
        >
          {title}
        </span>
        {subtitle && <span className="min-w-0 truncate text-12 text-tertiary">{subtitle}</span>}
        {open !== undefined && <Chevron open={open} />}
      </span>
      <Metrics seconds={seconds} entries={entries} total={total} compact={compact} />
    </>
  );
}

function Group({ defaultOpen = false, children, ...row }: TRowProps & { defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${ROW} w-full cursor-pointer rounded-sm text-left hover:bg-surface-2/60`}
      >
        <RowBody {...row} open={open} />
      </button>
      {/* children start under the parent's badge center (badge is 28px wide) */}
      {open && <div className="ml-3.5">{children}</div>}
    </div>
  );
}

function LeafRow(row: TRowProps) {
  return (
    <div className={ROW}>
      <RowBody {...row} />
    </div>
  );
}

// One child in a nested list: a curved elbow from the vertical guide line into the row.
// The guide line continues below the elbow unless this is the last child.
function TreeItem({ last, children }: { last: boolean; children: ReactNode }) {
  return (
    <div className="relative pl-6">
      <span
        aria-hidden="true"
        className="border-accent-primary/30 absolute top-0 left-0 h-[22px] w-5 rounded-bl-xl border-b border-l"
      />
      {!last && <span aria-hidden="true" className="absolute top-[22px] bottom-0 left-0 w-px bg-accent-primary/30" />}
      {children}
    </div>
  );
}

function TreeList({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <div>
      {items.map((child, i) => (
        <TreeItem key={(isValidElement(child) ? child.key : null) ?? i} last={i === items.length - 1}>
          {child}
        </TreeItem>
      ))}
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="flex h-11 items-center pl-6 text-12 text-tertiary">{children}</p>;
}

function UserRowItem({ row, total }: { row: TUserRow; total: number }) {
  const name = row.user?.display_name ?? "Unknown";
  return <LeafRow kind="member" title={name} seconds={row.total_seconds} entries={row.entry_count} total={total} />;
}

// deepest level: a work item
function WorkItemRow({ item, total }: { item: TMemberIssue; total: number }) {
  return <LeafRow kind="item" title={item.name} seconds={item.seconds} entries={item.entries} total={total} compact />;
}

// member → module → work items
function MemberGroup({ row, breakdown, total }: { row: TUserRow; breakdown?: TMemberBreakdown; total: number }) {
  const name = row.user?.display_name ?? "Unknown";
  if (!breakdown || breakdown.modules.length === 0) {
    return <UserRowItem row={row} total={total} />;
  }
  return (
    <Group kind="member" title={name} seconds={row.total_seconds} entries={row.entry_count} total={total}>
      <TreeList>
        {breakdown.modules.map((mod) => (
          <Group
            key={mod.key}
            kind="module"
            title={mod.name}
            seconds={mod.seconds}
            entries={mod.entries}
            total={row.total_seconds}
            defaultOpen
          >
            {mod.issues.length === 0 ? (
              <EmptyRow>No work items</EmptyRow>
            ) : (
              <TreeList>
                {mod.issues.map((issue) => (
                  <WorkItemRow key={issue.key} item={issue} total={mod.seconds} />
                ))}
              </TreeList>
            )}
          </Group>
        ))}
      </TreeList>
    </Group>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-sm border border-subtle bg-surface-1 px-4 py-3">
      <p className="text-12 text-tertiary">{label}</p>
      <p className="mt-1 text-20 font-semibold text-primary tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-sm border border-dashed border-subtle px-4 py-10 text-center">
      <p className="text-13 font-medium text-primary">{title}</p>
      {hint && <p className="mt-1 text-12 text-tertiary">{hint}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" role="status" aria-label="Loading time report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[74px] rounded-sm bg-surface-2" />
        ))}
      </div>
      <div className="h-9 w-72 rounded-sm bg-surface-2" />
      <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-subtle">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// lists
// ---------------------------------------------------------------------------

// the card: a column header row, then the tree (like the reference field list)
function TreeCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-subtle bg-surface-1 px-5 pt-4 pb-3">
      <div className="tracking-wider flex items-center gap-3 border-b border-subtle pr-3 pb-3 text-11 font-medium text-tertiary uppercase">
        <span className="flex-1">{label}</span>
        <span className="block w-28 min-w-0 shrink overflow-hidden">Share</span>
        <span className="w-20 shrink-0 text-right">Time</span>
        <span className="w-12 shrink-0 text-right md:w-20">Entries</span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// cycles
// ---------------------------------------------------------------------------

const shortDate = (d: string) =>
  new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const cycleRange = (c: TCycleRow) =>
  c.start_date && c.end_date ? `${shortDate(c.start_date)} – ${shortDate(c.end_date)}` : undefined;

// anything that has per-work-item, per-member rows (a module inside a cycle, or a module on its own)
type TWithIssues = { by_issue: { issue_id: string; issue_name: string; by_user: TUserRow[] }[] };
// level 3 inside a cycle: one member (members view) or one module (modules view)
type TCycleSubGroup = {
  key: string;
  title: string;
  avatar?: string;
  seconds: number;
  entries: number;
  items: TMemberIssue[];
};
// level 2 inside a cycle: one module (modules view) or one member (members view)
type TCycleGroup = {
  key: string;
  title: string;
  seconds: number;
  entries: number;
  children: TCycleSubGroup[];
};

// the work items a member worked on inside a module, with that member's own time on each
const memberIssuesOf = (mod: TWithIssues, memberKey: string): TMemberIssue[] =>
  mod.by_issue
    .flatMap((issue) => {
      const r = issue.by_user.find((u) => userKeyOf(u) === memberKey);
      return r
        ? [{ key: issue.issue_id, name: issue.issue_name, seconds: r.total_seconds, entries: r.entry_count }]
        : [];
    })
    .sort((a, b) => b.seconds - a.seconds);

// cycle → modules → members → work items
const buildModuleGroups = (cycle: TCycleRow): TCycleGroup[] =>
  byTimeDesc(cycle.by_module).map((mod) => ({
    key: mod.module_id ?? "no_module",
    title: mod.module_name,
    seconds: mod.total_seconds,
    entries: mod.entry_count,
    children: byTimeDesc(mergeUsers(mod.by_user)).map((row) => {
      const name = row.user?.display_name ?? "Unknown";
      return {
        key: userKeyOf(row),
        title: name,
        avatar: name,
        seconds: row.total_seconds,
        entries: row.entry_count,
        items: memberIssuesOf(mod, userKeyOf(row)),
      };
    }),
  }));

// cycle → members → modules → work items
const buildMemberGroups = (cycle: TCycleRow): TCycleGroup[] =>
  byTimeDesc(mergeUsers(cycle.by_user)).map((row) => {
    const memberKey = userKeyOf(row);
    const name = row.user?.display_name ?? "Unknown";
    const children: TCycleSubGroup[] = cycle.by_module
      .flatMap((mod) => {
        const rows = mod.by_user.filter((u) => userKeyOf(u) === memberKey);
        if (rows.length === 0) return [];
        return [
          {
            key: mod.module_id ?? "no_module",
            title: mod.module_name,
            seconds: rows.reduce((s, u) => s + u.total_seconds, 0),
            entries: rows.reduce((s, u) => s + u.entry_count, 0),
            items: memberIssuesOf(mod, memberKey),
          },
        ];
      })
      .sort((a, b) => b.seconds - a.seconds);
    return {
      key: memberKey,
      title: name,
      avatar: name,
      seconds: row.total_seconds,
      entries: row.entry_count,
      children,
    };
  });

function ViewSwitch({ value, onChange }: { value: TCycleView; onChange: (v: TCycleView) => void }) {
  const options: { key: TCycleView; label: string }[] = [
    { key: "module", label: "Modules" },
    { key: "member", label: "Members" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-12 text-tertiary">View by</span>
      <div className="flex gap-1 rounded-sm border border-subtle p-0.5" role="group" aria-label="View cycles by">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-sm px-2.5 py-0.5 text-12 transition-colors ${
              value === o.key
                ? "bg-accent-primary/10 font-medium text-accent-primary"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CycleGroup({ cycle, view, total }: { cycle: TCycleRow; view: TCycleView; total: number }) {
  const groups = view === "member" ? buildMemberGroups(cycle) : buildModuleGroups(cycle);
  const emptyLabel = view === "member" ? "No members in this cycle." : "No modules in this cycle.";
  const level2: TNodeKind = view === "member" ? "member" : "module";
  const level3: TNodeKind = view === "member" ? "module" : "member";
  return (
    <Group
      kind="cycle"
      title={cycle.cycle_name?.trim() || (cycle.cycle_id ? "Untitled cycle" : "No cycle")}
      subtitle={cycleRange(cycle)}
      seconds={cycle.total_seconds}
      entries={cycle.entry_count}
      total={total}
    >
      {groups.length === 0 ? (
        <EmptyRow>{emptyLabel}</EmptyRow>
      ) : (
        <TreeList>
          {groups.map((group) => (
            <Group
              key={group.key}
              kind={level2}
              title={group.title}
              seconds={group.seconds}
              entries={group.entries}
              total={cycle.total_seconds}
            >
              <TreeList>
                {group.children.map((child) => (
                  <Group
                    key={child.key}
                    kind={level3}
                    avatarName={child.avatar}
                    title={child.title}
                    seconds={child.seconds}
                    entries={child.entries}
                    total={group.seconds}
                  >
                    {child.items.length === 0 ? (
                      <EmptyRow>No work items</EmptyRow>
                    ) : (
                      <TreeList>
                        {child.items.map((item) => (
                          <WorkItemRow key={item.key} item={item} total={child.seconds} />
                        ))}
                      </TreeList>
                    )}
                  </Group>
                ))}
              </TreeList>
            </Group>
          ))}
        </TreeList>
      )}
    </Group>
  );
}

// module → members → work items (same shape as the "Modules" view inside a cycle)
function ModuleGroup({ mod, total }: { mod: TModuleRow; total: number }) {
  const members = byTimeDesc(mergeUsers(mod.by_user));
  return (
    <Group kind="module" title={mod.module_name} seconds={mod.total_seconds} entries={mod.entry_count} total={total}>
      {members.length === 0 ? (
        <EmptyRow>No members in this module.</EmptyRow>
      ) : (
        <TreeList>
          {members.map((row, idx) => {
            const name = row.user?.display_name ?? "Unknown";
            const items = memberIssuesOf(mod, userKeyOf(row));
            return (
              <Group
                key={row.user?.id ?? idx}
                kind="member"
                title={name}
                seconds={row.total_seconds}
                entries={row.entry_count}
                total={mod.total_seconds}
              >
                {items.length === 0 ? (
                  <EmptyRow>No work items</EmptyRow>
                ) : (
                  <TreeList>
                    {items.map((item) => (
                      <WorkItemRow key={item.key} item={item} total={row.total_seconds} />
                    ))}
                  </TreeList>
                )}
              </Group>
            );
          })}
        </TreeList>
      )}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

function TimeReportPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const [range, setRange] = useState<TRange>({ start: "", end: "" });
  const [report, setReport] = useState<TTimeEntriesReport | null>(null);
  const [loader, setLoader] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TTab>("cycle");
  const [cycleView, setCycleView] = useState<TCycleView>("module");
  const [query, setQuery] = useState("");
  const requestId = useRef(0);

  const memberBreakdown = useMemo(() => (report ? buildMemberBreakdown(report) : null), [report]);

  const rangeInvalid = !!range.start && !!range.end && range.start > range.end;

  const fetchReport = useCallback(
    async (next: TRange) => {
      // ignore responses from superseded requests (fast preset clicking)
      const id = ++requestId.current;
      setLoader(true);
      setError(null);
      try {
        const data = await issueService.getIssueTimeEntriesReport(workspaceSlug, projectId, {
          ...(next.start ? { start_date: next.start } : {}),
          ...(next.end ? { end_date: next.end } : {}),
        });
        if (id === requestId.current) setReport(data);
      } catch {
        if (id === requestId.current) setError("Couldn't load the time report. Check your connection and try again.");
      } finally {
        if (id === requestId.current) setLoader(false);
      }
    },
    [workspaceSlug, projectId]
  );

  useEffect(() => {
    const all = { start: "", end: "" };
    setRange(all);
    fetchReport(all);
  }, [fetchReport]);

  const applyRange = (next: TRange) => {
    setRange(next);
    fetchReport(next);
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.get();
    return r.start === range.start && r.end === range.end;
  })?.key;

  // search filter (applies to whichever tab is open)
  const q = query.trim().toLowerCase();
  const matches = (s?: string | null) => !q || (s ?? "").toLowerCase().includes(q);

  const tabs: { key: TTab; label: string; count: number }[] = report
    ? [
        { key: "cycle", label: "Cycles", count: report.by_cycle.length },
        { key: "module", label: "Modules", count: report.by_module.length },
        { key: "member", label: "Members", count: report.by_user.length },
      ]
    : [];

  const renderTab = (data: TTimeEntriesReport) => {
    if (tab === "module") {
      const rows = byTimeDesc(data.by_module).filter((m) => matches(m.module_name));
      if (data.by_module.length === 0)
        return <EmptyState title="No time logged in this period" hint="Try a wider date range." />;
      if (rows.length === 0) return <EmptyState title={`No modules match “${query}”`} />;
      return (
        <TreeCard label="Module">
          {rows.map((mod) => (
            <ModuleGroup key={mod.module_id ?? "no_module"} mod={mod} total={data.total_seconds} />
          ))}
        </TreeCard>
      );
    }
    if (tab === "cycle") {
      if (data.by_cycle.length === 0)
        return <EmptyState title="No time logged in this period" hint="Try a wider date range." />;
      const rows = byTimeDesc(data.by_cycle)
        .filter(
          (c) =>
            matches(c.cycle_name) ||
            c.by_user.some((u) => matches(u.user?.display_name)) ||
            c.by_module.some(
              (m) =>
                matches(m.module_name) ||
                m.by_user.some((u) => matches(u.user?.display_name)) ||
                m.by_issue.some((i) => matches(i.issue_name))
            )
        )
        // "No cycle" (cycle_id === null) always comes last
        .sort((a, b) => Number(a.cycle_id === null) - Number(b.cycle_id === null));
      return (
        <div className="flex flex-col gap-3">
          <ViewSwitch value={cycleView} onChange={setCycleView} />
          {rows.length === 0 ? (
            <EmptyState title={`No cycles match “${query}”`} />
          ) : (
            <TreeCard label="Cycle">
              {rows.map((cycle) => (
                <CycleGroup
                  key={cycle.cycle_id ?? "no_cycle"}
                  cycle={cycle}
                  view={cycleView}
                  total={data.total_seconds}
                />
              ))}
            </TreeCard>
          )}
        </div>
      );
    }
    const rows = byTimeDesc(data.by_user).filter((r) => {
      const b = memberBreakdown?.get(userKeyOf(r));
      return (
        matches(r.user?.display_name ?? "Unknown") ||
        !!b?.modules.some((m) => matches(m.name) || m.issues.some((i) => matches(i.name)))
      );
    });
    if (data.by_user.length === 0)
      return <EmptyState title="No time logged in this period" hint="Try a wider date range." />;
    if (rows.length === 0) return <EmptyState title={`No members match “${query}”`} />;
    return (
      <TreeCard label="Member">
        {rows.map((row, idx) => (
          <MemberGroup
            key={row.user?.id ?? idx}
            row={row}
            breakdown={memberBreakdown?.get(userKeyOf(row))}
            total={data.total_seconds}
          />
        ))}
      </TreeCard>
    );
  };

  const inputClass =
    "rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-13 text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-primary";

  return (
    <>
      <PageHead title="Time report" />
      <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          {/* ------------------------------------------------ filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick date ranges">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyRange(p.get())}
                  aria-pressed={activePreset === p.key}
                  className={`rounded-full border px-3 py-1 text-12 transition-colors ${
                    activePreset === p.key
                      ? "border-accent-primary bg-accent-primary/10 font-medium text-primary"
                      : "border-subtle text-secondary hover:bg-surface-2"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!rangeInvalid) fetchReport(range);
              }}
            >
              <label className="flex items-center gap-2 text-13 text-secondary">
                From
                <input
                  type="date"
                  value={range.start}
                  max={range.end || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-2 text-13 text-secondary">
                To
                <input
                  type="date"
                  value={range.end}
                  min={range.start || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={rangeInvalid || loader}
                className="text-on-accent rounded-sm bg-accent-primary px-3 py-1.5 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
              {rangeInvalid && <p className="text-danger text-12">The start date must be before the end date.</p>}
            </form>
          </div>

          {/* ------------------------------------------------ body */}
          {loader && !report ? (
            <LoadingSkeleton />
          ) : error ? (
            <div
              className="flex items-center justify-between gap-3 rounded-sm border border-subtle px-4 py-3"
              role="alert"
            >
              <p className="text-danger text-13">{error}</p>
              <button
                type="button"
                onClick={() => fetchReport(range)}
                className="rounded-sm border border-subtle px-3 py-1 text-13 text-primary hover:bg-surface-2"
              >
                Try again
              </button>
            </div>
          ) : report ? (
            <div className={`flex flex-col gap-5 transition-opacity ${loader ? "opacity-60" : ""}`} aria-busy={loader}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Total time" value={formatTrackedTime(report.total_seconds)} />
                <StatCard label="Entries" value={report.entry_count} />
                <StatCard label="Members" value={report.by_user.length} />
                <StatCard label="Work items" value={report.by_issue.length} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className="flex gap-1 rounded-sm border border-subtle p-0.5"
                  role="tablist"
                  aria-label="Group time by"
                >
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={`rounded-sm px-3 py-1 text-13 transition-colors ${
                        tab === t.key ? "bg-surface-2 font-medium text-primary" : "text-secondary hover:text-primary"
                      }`}
                    >
                      {t.label} <span className="text-tertiary tabular-nums">{t.count}</span>
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    tab === "member"
                      ? "Search members, modules, items"
                      : tab === "cycle"
                        ? cycleView === "member"
                          ? "Search cycles, members, items"
                          : "Search cycles, modules, items"
                        : "Search modules"
                  }
                  aria-label="Search"
                  className={`${inputClass} w-56`}
                />
              </div>

              <div role="tabpanel">{renderTab(report)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default observer(TimeReportPage);
