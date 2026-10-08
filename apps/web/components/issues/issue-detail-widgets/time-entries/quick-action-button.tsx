/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AddOutline } from "@makeplane/propel/icons";

type Props = {
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
};

export function IssueTimeEntriesActionButton(props: Props) {
  const { disabled = false, onClick } = props;

  return (
    <button type="button" onClick={onClick} disabled={disabled}>
      <AddOutline className="h-4 w-4" />
    </button>
  );
}
