/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { DeleteOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { formatTrackedTime } from "@plane/utils";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import type { TTimeEntryOperations } from "./helper";

type Props = {
  issueId: string;
  timeEntryOperations: TTimeEntryOperations;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
};

export const TimeEntryList = observer(function TimeEntryList(props: Props) {
  const { issueId, timeEntryOperations, disabled, issueServiceType } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    timeEntry: { getTimeEntriesByIssueId, getTimeEntryById },
  } = useIssueDetail(issueServiceType);

  // derived values
  const entryIds = getTimeEntriesByIssueId(issueId) ?? [];

  if (entryIds.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {entryIds.map((entryId) => {
        const entry = getTimeEntryById(entryId);
        if (!entry) return null;
        return (
          <div
            key={entry.id}
            className="group flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-layer-1"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-13 font-medium text-primary">{formatTrackedTime(entry.duration_seconds)}</span>
              {entry.description && <span className="truncate text-12 text-tertiary">{entry.description}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {entry.logged_on && <span className="text-12 text-tertiary">{entry.logged_on}</span>}
              {!disabled && (
                <button
                  type="button"
                  aria-label={t("common.remove")}
                  className="hover:text-danger invisible p-1 text-tertiary group-hover:visible"
                  onClick={() => timeEntryOperations.remove(entry.id)}
                >
                  <DeleteOutline className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
