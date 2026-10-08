/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { TimeTrackingReport } from "@/components/time-tracking/time-tracking-report";

function TimeTrackingLayout() {
  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t("issue.time_tracking.log_time")} />
      <TimeTrackingReport />
    </>
  );
}

export default observer(TimeTrackingLayout);
