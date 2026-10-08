/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { TimeEntryList } from "./entry-list";
import { LogTimeModal } from "./log-time-modal";
import { useTimeEntryOperations } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
  isModalOpen: boolean;
  onModalClose: () => void;
};

export const IssueTimeEntriesCollapsibleContent = observer(function IssueTimeEntriesCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType, isModalOpen, onModalClose } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    timeEntry: { getTimeEntriesByIssueId },
  } = useIssueDetail(issueServiceType);

  // helper
  const handleTimeEntryOperations = useTimeEntryOperations(workspaceSlug, projectId, issueId, issueServiceType);

  // derived values
  const entryIds = getTimeEntriesByIssueId(issueId) ?? [];

  return (
    <div className="flex flex-col gap-2">
      {entryIds.length === 0 ? (
        <p className="px-2 py-1 text-13 text-tertiary">{t("issue.time_tracking.empty")}</p>
      ) : (
        <TimeEntryList
          issueId={issueId}
          timeEntryOperations={handleTimeEntryOperations}
          disabled={disabled}
          issueServiceType={issueServiceType}
        />
      )}
      <LogTimeModal
        isModalOpen={isModalOpen}
        handleOnClose={onModalClose}
        timeEntryOperations={handleTimeEntryOperations}
      />
    </div>
  );
});
