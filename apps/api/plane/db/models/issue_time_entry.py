import django
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.conf import settings
import uuid


class IssueTimeEntry(models.Model):
    """Issue time entry for time tracking functionality."""
    
    id = models.UUIDField(
        db_index=True,
        default=uuid.uuid4,
        editable=False,
        primary_key=True,
        serialize=False,
        unique=True,
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Last Modified At")
    deleted_at = models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")
    
    duration_seconds = models.IntegerField(
        validators=[django.core.validators.MinValueValidator(1)],
    )
    
    logged_on = models.DateField(default=django.utils.timezone.localdate)
    
    description = models.TextField(blank=True, null=True)
    
    created_by = models.ForeignKey(
        null=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_created_by",
        to=settings.AUTH_USER_MODEL,
        verbose_name="Created By",
    )
    
    updated_by = models.ForeignKey(
        null=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_updated_by",
        to=settings.AUTH_USER_MODEL,
        verbose_name="Last Modified By",
    )
    
    issue = models.ForeignKey(
        on_delete=models.CASCADE,
        related_name="issue_time_entries",
        to="db.issue",
    )
    
    project = models.ForeignKey(
        on_delete=models.CASCADE,
        related_name="project_%(class)s",
        to="db.project",
    )
    
    user = models.ForeignKey(
        blank=True,
        null=True,
        on_delete=models.CASCADE,
        related_name="issue_time_entries",
        to=settings.AUTH_USER_MODEL,
    )
    
    workspace = models.ForeignKey(
        on_delete=models.CASCADE,
        related_name="workspace_%(class)s",
        to="db.workspace",
    )
    
    class Meta:
        verbose_name = "Issue Time Entry"
        verbose_name_plural = "Issue Time Entries"
        db_table = "issue_time_entries"
        ordering = ("-logged_on", "-created_at")
