/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";

export type TIssueTimeEntry = {
  id: string;
  issue_id: string;
  user_id?: string | null;
  user?: string | null;
  duration_seconds: number;
  logged_on: string;
  description?: string | null;
  user_detail?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  created_at: string;
  updated_at: string;
};

export type TIssueTimeEntryMap = {
  [entry_id: string]: TIssueTimeEntry;
};

export type TIssueTimeEntryIdMap = {
  [issue_id: string]: string[];
};

export type TTimeEntriesReportByUser = {
  user: IUserLite | null;
  total_seconds: number;
  entry_count: number;
};

export type TTimeEntriesReportByIssue = {
  issue_id: string;
  issue_name: string;
  total_seconds: number;
  entry_count: number;
  by_user: TTimeEntriesReportByUser[];
};

export type TTimeEntriesReportByModule = {
  module_id: string | null;
  module_name: string;
  total_seconds: number;
  entry_count: number;
  by_user: TTimeEntriesReportByUser[];
  by_issue: Array<{
    issue_id: string;
    issue_name: string;
    total_seconds: number;
    entry_count: number;
    by_user: TTimeEntriesReportByUser[];
  }>;
};

export type TTimeEntriesReportByCycleModule = {
  module_id: string | null;
  module_name: string;
  total_seconds: number;
  entry_count: number;
  by_user: TTimeEntriesReportByUser[];
  by_issue: TTimeEntriesReportByIssue[];
};

export type TTimeEntriesReportByCycle = {
  cycle_id: string | null;
  cycle_name: string;
  start_date?: string | null;
  end_date?: string | null;
  total_seconds: number;
  entry_count: number;
  by_user: TTimeEntriesReportByUser[];
  by_issue: TTimeEntriesReportByIssue[];
  by_module: TTimeEntriesReportByCycleModule[];
};

export type TTimeEntriesReport = {
  total_seconds: number;
  entry_count: number;
  by_issue: TTimeEntriesReportByIssue[];
  by_user: TTimeEntriesReportByUser[];
  by_module: TTimeEntriesReportByModule[];
  by_cycle: TTimeEntriesReportByCycle[];
};
