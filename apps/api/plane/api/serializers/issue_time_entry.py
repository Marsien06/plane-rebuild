# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers


class IssueTimeEntrySerializer(serializers.ModelSerializer):
    """Serializer for IssueTimeEntry model."""
    
    class Meta:
        model = "plane.db.models.IssueTimeEntry"
        fields = "__all__"
