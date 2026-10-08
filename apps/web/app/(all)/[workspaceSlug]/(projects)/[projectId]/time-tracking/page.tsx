/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useParams } from "next/navigation";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";

function TimeTrackingPage() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const projectId = params.projectId as string;

  // hooks
  const { currentProjectDetails } = useProject();
  const { currentWorkspace } = useWorkspace();

  if (!currentWorkspace || !currentProjectDetails) return null;

  return (
    <div className="h-full">
      <p className="px-4 py-4 text-tertiary">
        {t("issue.time_tracking.log_time")} - {currentProjectDetails.name}
      </p>
    </div>
  );
}

export default observer(TimeTrackingPage);
