# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Sum
from django.db.models.functions import JSONObject

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView, BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTimeEntrySerializer, UserLiteSerializer, ModuleLiteSerializer
from plane.db.models import IssueTimeEntry, User, Module, Cycle


class IssueTimeEntryViewSet(BaseViewSet):
    serializer_class = IssueTimeEntrySerializer
    model = IssueTimeEntry

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "issue", "user")
            .order_by("-logged_on", "-created_at")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_id):
        queryset = self.get_queryset()
        serializer = IssueTimeEntrySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, issue_id, pk):
        entry = self.get_queryset().get(pk=pk)
        serializer = IssueTimeEntrySerializer(entry)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        data.setdefault("user", str(request.user.id))
        serializer = IssueTimeEntrySerializer(data=data)
        if serializer.is_valid():
            serializer.save(project_id=project_id, issue_id=issue_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueTimeEntry)
    def partial_update(self, request, slug, project_id, issue_id, pk):
        entry = IssueTimeEntry.objects.get(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        )
        serializer = IssueTimeEntrySerializer(entry, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueTimeEntry)
    def destroy(self, request, slug, project_id, issue_id, pk):
        entry = IssueTimeEntry.objects.get(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        )
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueTimeEntryReportEndpoint(BaseAPIView):
    def _base_queryset(self, request, slug, project_id):
        queryset = IssueTimeEntry.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
        )
        start_date = request.query_params.get("start_date")
        if start_date and start_date.strip():
            queryset = queryset.filter(logged_on__gte=start_date)
        end_date = request.query_params.get("end_date")
        if end_date and end_date.strip():
            queryset = queryset.filter(logged_on__lte=end_date)
        issue_id = request.query_params.get("issue_id")
        if issue_id:
            queryset = queryset.filter(issue_id=issue_id)
        user_id = request.query_params.get("user_id")
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        return queryset.distinct()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        queryset = self._base_queryset(request, slug, project_id)

        # Get module IDs and cycle IDs for all issues in the queryset
        issue_ids = list(queryset.values_list("issue_id", flat=True).distinct())
        from plane.db.models import Issue
        issues = Issue.objects.filter(id__in=issue_ids).values("id", "name", "modules", "cycle")
        issue_modules = {str(issue["id"]): {"name": issue["name"], "modules": issue["modules"], "cycle": issue["cycle"]} for issue in issues}

        # Get cycle names and dates
        cycle_ids = [issue["cycle"] for issue in issues if issue["cycle"]]
        cycle_info = {}
        if cycle_ids:
            cycles = Cycle.objects.filter(id__in=cycle_ids).values("id", "name", "start_date", "end_date")
            cycle_info = {str(c["id"]): c for c in cycles}

        # Module names for grouping (avoids per-row module queries)
        all_module_ids = {mid for issue in issues for mid in (issue["modules"] or [])}
        module_names = (
            {str(m["id"]): m["name"] for m in Module.objects.filter(id__in=all_module_ids).values("id", "name")}
            if all_module_ids
            else {}
        )

        rows = (
            queryset.values("issue_id", "issue__name", "user_id")
            .annotate(total_seconds=Sum("duration_seconds"), entry_count=Count("id"))
            .order_by("issue_id")
        )

        by_user_rows = (
            queryset.values("user_id")
            .annotate(total_seconds=Sum("duration_seconds"), entry_count=Count("id"))
            .order_by("-total_seconds")
        )
        user_ids = [r["user_id"] for r in by_user_rows]
        users = {str(u.id): u for u in User.objects.filter(id__in=user_ids)}
        by_user = [
            {
                "user": UserLiteSerializer(users[str(r["user_id"])]).data if r["user_id"] else None,
                "total_seconds": r["total_seconds"] or 0,
                "entry_count": r["entry_count"],
            }
            for r in by_user_rows
        ]

        # By module - expand issues to their modules
        by_module_map = {}
        for r in rows:
            issue_info = issue_modules.get(str(r["issue_id"]))
            if not issue_info:
                continue
            module_ids = issue_info["modules"] or []
            issue_name = issue_info["name"]
            if not module_ids:
                # Issue without module - group as "No module"
                module_key = "no_module"
                module_name = "No module"
                if module_key not in by_module_map:
                    by_module_map[module_key] = {
                        "module_id": None,
                        "module_name": module_name,
                        "total_seconds": 0,
                        "entry_count": 0,
                        "by_user": [],
                        "by_issue": [],
                    }
                module_entry = by_module_map[module_key]
                module_entry["total_seconds"] += r["total_seconds"] or 0
                module_entry["entry_count"] += r["entry_count"]
                user = users.get(str(r["user_id"]))
                module_entry["by_user"].append({
                    "user": UserLiteSerializer(user).data if user else None,
                    "total_seconds": r["total_seconds"] or 0,
                    "entry_count": r["entry_count"],
                })
                module_entry["by_issue"].append({
                    "issue_id": r["issue_id"],
                    "issue_name": issue_name,
                    "total_seconds": r["total_seconds"] or 0,
                    "entry_count": r["entry_count"],
                    "by_user": [{
                        "user": UserLiteSerializer(user).data if user else None,
                        "total_seconds": r["total_seconds"] or 0,
                        "entry_count": r["entry_count"],
                    }]
                })
            else:
                # Issue has modules - add to each module
                for module_id in module_ids:
                    module_key = str(module_id)
                    if module_key not in by_module_map:
                        by_module_map[module_key] = {
                            "module_id": module_key,
                            "module_name": module_names.get(module_key, "Unknown module"),
                            "total_seconds": 0,
                            "entry_count": 0,
                            "by_user": [],
                            "by_issue": [],
                        }
                    module_entry = by_module_map[module_key]
                    module_entry["total_seconds"] += r["total_seconds"] or 0
                    module_entry["entry_count"] += r["entry_count"]
                    user = users.get(str(r["user_id"]))
                    module_entry["by_user"].append({
                        "user": UserLiteSerializer(user).data if user else None,
                        "total_seconds": r["total_seconds"] or 0,
                        "entry_count": r["entry_count"],
                    })
                    module_entry["by_issue"].append({
                        "issue_id": r["issue_id"],
                        "issue_name": issue_name,
                        "total_seconds": r["total_seconds"] or 0,
                        "entry_count": r["entry_count"],
                        "by_user": [{
                            "user": UserLiteSerializer(user).data if user else None,
                            "total_seconds": r["total_seconds"] or 0,
                            "entry_count": r["entry_count"],
                        }]
                    })

        # By cycle - group issues by their cycle
        by_cycle_map = {}
        for r in rows:
            issue_info = issue_modules.get(str(r["issue_id"]))
            if not issue_info:
                continue
            cycle_id = issue_info.get("cycle")
            issue_name = issue_info["name"]
            if cycle_id:
                cycle_key = str(cycle_id)
                cycle = cycle_info.get(cycle_key) or {}
                cycle_name = cycle.get("name", "Unknown cycle")
                start_date = cycle.get("start_date")
                end_date = cycle.get("end_date")
            else:
                # Issue without cycle - group as "No cycle"
                cycle_key = "no_cycle"
                cycle_name = "No cycle"
                start_date = None
                end_date = None
            if cycle_key not in by_cycle_map:
                by_cycle_map[cycle_key] = {
                    "cycle_id": cycle_key if cycle_id else None,
                    "cycle_name": cycle_name,
                    "start_date": start_date,
                    "end_date": end_date,
                    "total_seconds": 0,
                    "entry_count": 0,
                    "by_user": [],
                    "by_issue": [],
                    "by_module": [],
                }
            cycle_entry = by_cycle_map[cycle_key]
            cycle_entry["total_seconds"] += r["total_seconds"] or 0
            cycle_entry["entry_count"] += r["entry_count"]
            user = users.get(str(r["user_id"]))
            user_data = UserLiteSerializer(user).data if user else None
            member_id = str(r["user_id"]) if r["user_id"] else None
            cycle_entry["by_user"].append({
                "user": user_data,
                "total_seconds": r["total_seconds"] or 0,
                "entry_count": r["entry_count"],
            })
            cycle_entry["by_issue"].append({
                "issue_id": r["issue_id"],
                "issue_name": issue_name,
                "total_seconds": r["total_seconds"] or 0,
                "entry_count": r["entry_count"],
                "by_user": [{
                    "user": user_data,
                    "total_seconds": r["total_seconds"] or 0,
                    "entry_count": r["entry_count"],
                }]
            })
            # Expand to the modules within this cycle
            module_ids = issue_info["modules"] or []
            cycle_modules = (
                [
                    {"module_id": str(mid), "module_name": module_names.get(str(mid), "Unknown module")}
                    for mid in module_ids
                ]
                if module_ids
                else [{"module_id": None, "module_name": "No module"}]
            )
            for cycle_module in cycle_modules:
                module_entry = next(
                    (m for m in cycle_entry["by_module"] if m["module_id"] == cycle_module["module_id"]),
                    None,
                )
                if module_entry is None:
                    module_entry = {
                        **cycle_module,
                        "total_seconds": 0,
                        "entry_count": 0,
                        "by_user": [],
                        "by_issue": [],
                    }
                    cycle_entry["by_module"].append(module_entry)
                module_entry["total_seconds"] += r["total_seconds"] or 0
                module_entry["entry_count"] += r["entry_count"]

                # members who logged time in this module (within the cycle)
                member_row = next(
                    (u for u in module_entry["by_user"] if (u["user"]["id"] if u["user"] else None) == member_id),
                    None,
                )
                if member_row is None:
                    module_entry["by_user"].append({
                        "user": user_data,
                        "total_seconds": r["total_seconds"] or 0,
                        "entry_count": r["entry_count"],
                    })
                else:
                    member_row["total_seconds"] += r["total_seconds"] or 0
                    member_row["entry_count"] += r["entry_count"]

                # work items in this module, with each member's time on them
                issue_row = next(
                    (i for i in module_entry["by_issue"] if str(i["issue_id"]) == str(r["issue_id"])),
                    None,
                )
                if issue_row is None:
                    issue_row = {
                        "issue_id": r["issue_id"],
                        "issue_name": issue_name,
                        "total_seconds": 0,
                        "entry_count": 0,
                        "by_user": [],
                    }
                    module_entry["by_issue"].append(issue_row)
                issue_row["total_seconds"] += r["total_seconds"] or 0
                issue_row["entry_count"] += r["entry_count"]
                issue_row["by_user"].append({
                    "user": user_data,
                    "total_seconds": r["total_seconds"] or 0,
                    "entry_count": r["entry_count"],
                })

        by_issue_map = {}
        for r in rows:
            issue = by_issue_map.setdefault(
                str(r["issue_id"]),
                {
                    "issue_id": r["issue_id"],
                    "issue_name": r["issue__name"],
                    "total_seconds": 0,
                    "entry_count": 0,
                    "by_user": [],
                },
            )
            issue["total_seconds"] += r["total_seconds"] or 0
            issue["entry_count"] += r["entry_count"]
            user = users.get(str(r["user_id"]))
            issue["by_user"].append(
                {
                    "user": UserLiteSerializer(user).data if user else None,
                    "total_seconds": r["total_seconds"] or 0,
                    "entry_count": r["entry_count"],
                }
            )

        total_seconds = queryset.aggregate(total=Sum("duration_seconds"))["total"] or 0
        return Response(
            {
                "total_seconds": total_seconds,
                "entry_count": queryset.count(),
                "by_issue": list(by_issue_map.values()),
                "by_user": by_user,
                "by_module": list(by_module_map.values()),
                "by_cycle": list(by_cycle_map.values()),
            },
            status=status.HTTP_200_OK,
        )
