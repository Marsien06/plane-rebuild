/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setToast } from "@plane/blocks/toast";
import { parseDurationInput } from "@plane/utils";
import type { TIssueTimeEntry, TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

export type TTimeEntryOperations = {
  create: (durationInput: string, description?: string, loggedOn?: string) => Promise<void>;
  remove: (entryId: string) => Promise<void>;
};

export const useTimeEntryOperations = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
): TTimeEntryOperations => {
  const { createTimeEntry, removeTimeEntry } = useIssueDetail(issueServiceType);
  // i18n
  const { t } = useTranslation();

  const handleTimeEntryOperations: TTimeEntryOperations = useMemo(
    () => ({
      create: async (durationInput: string, description?: string, loggedOn?: string) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          const durationSeconds = parseDurationInput(durationInput);
          if (!durationSeconds) {
            setToast({
              message: t("issue.time_tracking.invalid_duration"),
              type: "error",
              title: t("issue.time_tracking.invalid_duration"),
            });
            throw new Error("Invalid duration");
          }
          const data: Partial<TIssueTimeEntry> = { duration_seconds: durationSeconds };
          if (description) data.description = description;
          if (loggedOn) data.logged_on = loggedOn;
          await createTimeEntry(workspaceSlug, projectId, issueId, data);
          setToast({ type: "success", title: t("issue.time_tracking.toasts.logged") });
        } catch (error: any) {
          if (error?.message === "Invalid duration") throw error;
          setToast({ type: "error", title: error?.data?.error ?? t("issue.time_tracking.toasts.not_logged") });
          throw error;
        }
      },
      remove: async (entryId: string) => {
        try {
          if (!workspaceSlug || !projectId || !issueId) throw new Error("Missing required fields");
          await removeTimeEntry(workspaceSlug, projectId, issueId, entryId);
          setToast({ type: "success", title: t("issue.time_tracking.toasts.removed") });
        } catch {
          setToast({ type: "error", title: t("issue.time_tracking.toasts.not_removed") });
        }
      },
    }),
    [workspaceSlug, projectId, issueId, createTimeEntry, removeTimeEntry, t]
  );

  return handleTimeEntryOperations;
};
