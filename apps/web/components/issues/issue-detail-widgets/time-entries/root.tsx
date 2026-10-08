/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Collapsible } from "@makeplane/propel/components/collapsible";
import type { TIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueTimeEntriesCollapsibleContent } from "./content";
import { IssueTimeEntriesCollapsibleTitle } from "./title";
import { IssueTimeEntriesActionButton } from "./quick-action-button";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const TimeEntriesCollapsible = observer(function TimeEntriesCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  // store hooks
  const { fetchTimeEntries } = useIssueDetail(issueServiceType);
  // states
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !issueId) return;
    fetchTimeEntries(workspaceSlug, projectId, issueId);
  }, [workspaceSlug, projectId, issueId, fetchTimeEntries]);

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={() => setIsCollapsibleOpen((prev) => !prev)}
      trigger={<IssueTimeEntriesCollapsibleTitle issueId={issueId} issueServiceType={issueServiceType} />}
      trailing={
        isCollapsibleOpen && !disabled ? (
          <IssueTimeEntriesActionButton
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsModalOpen(true);
            }}
          />
        ) : undefined
      }
    >
      <IssueTimeEntriesCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
        issueServiceType={issueServiceType}
        isModalOpen={isModalOpen}
        onModalClose={() => setIsModalOpen(false)}
      />
    </Collapsible>
  );
});
