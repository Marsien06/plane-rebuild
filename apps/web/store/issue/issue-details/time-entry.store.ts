/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
// services
import type { TIssueTimeEntry, TIssueTimeEntryMap, TIssueTimeEntryIdMap, TIssueServiceType } from "@plane/types";
import { IssueService } from "@/services/issue";
// types
import type { IIssueDetail } from "./root.store";

export interface IIssueTimeEntryStoreActions {
  addTimeEntries: (issueId: string, entries: TIssueTimeEntry[]) => void;
  fetchTimeEntries: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueTimeEntry[]>;
  createTimeEntry: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueTimeEntry>
  ) => Promise<TIssueTimeEntry>;
  updateTimeEntry: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entryId: string,
    data: Partial<TIssueTimeEntry>
  ) => Promise<TIssueTimeEntry>;
  removeTimeEntry: (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => Promise<void>;
}

export interface IIssueTimeEntryStore extends IIssueTimeEntryStoreActions {
  // observables
  entries: TIssueTimeEntryIdMap;
  entryMap: TIssueTimeEntryMap;
  // computed
  issueTimeEntries: string[] | undefined;
  // helper methods
  getTimeEntriesByIssueId: (issueId: string) => string[] | undefined;
  getTimeEntryById: (entryId: string) => TIssueTimeEntry | undefined;
  getTotalTrackedSecondsByIssueId: (issueId: string) => number;
}

export class IssueTimeEntryStore implements IIssueTimeEntryStore {
  // observables
  entries: TIssueTimeEntryIdMap = {};
  entryMap: TIssueTimeEntryMap = {};
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  issueService;
  serviceType;

  constructor(rootStore: IIssueDetail, serviceType: TIssueServiceType) {
    makeObservable(this, {
      // observables
      entries: observable,
      entryMap: observable,
      // computed
      issueTimeEntries: computed,
      // actions
      addTimeEntries: action.bound,
      fetchTimeEntries: action,
      createTimeEntry: action,
      updateTimeEntry: action,
      removeTimeEntry: action,
    });
    this.serviceType = serviceType;
    // root store
    this.rootIssueDetailStore = rootStore;
    // services
    this.issueService = new IssueService(serviceType);
  }

  // computed
  get issueTimeEntries() {
    const issueId = this.rootIssueDetailStore.peekIssue?.issueId;
    if (!issueId) return undefined;
    return this.entries[issueId] ?? undefined;
  }

  // helper methods
  getTimeEntriesByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.entries[issueId] ?? undefined;
  };

  getTimeEntryById = (entryId: string) => {
    if (!entryId) return undefined;
    return this.entryMap[entryId] ?? undefined;
  };

  getTotalTrackedSecondsByIssueId = (issueId: string) => {
    const entryIds = this.entries[issueId] ?? [];
    return entryIds.reduce((total, entryId) => total + (this.entryMap[entryId]?.duration_seconds ?? 0), 0);
  };

  // actions
  addTimeEntries = (issueId: string, timeEntries: TIssueTimeEntry[]) => {
    runInAction(() => {
      this.entries[issueId] = timeEntries.map((entry) => entry.id);
      timeEntries.forEach((entry) => set(this.entryMap, entry.id, entry));
      this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(issueId, {
        total_tracked_seconds: this.getTotalTrackedSecondsByIssueId(issueId),
      });
    });
  };

  fetchTimeEntries = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issueService.fetchIssueTimeEntries(workspaceSlug, projectId, issueId);
    this.addTimeEntries(issueId, response);
    return response;
  };

  createTimeEntry = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueTimeEntry>
  ) => {
    const response = await this.issueService.createIssueTimeEntry(workspaceSlug, projectId, issueId, data);
    runInAction(() => {
      this.entries[issueId] = [...(this.entries[issueId] ?? []), response.id];
      set(this.entryMap, response.id, response);
      this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(issueId, {
        total_tracked_seconds: this.getTotalTrackedSecondsByIssueId(issueId),
      });
    });
    // fetching activity
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
    return response;
  };

  updateTimeEntry = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entryId: string,
    data: Partial<TIssueTimeEntry>
  ) => {
    const initialData = { ...this.entryMap[entryId] };
    try {
      runInAction(() => {
        Object.keys(data).forEach((key) => {
          set(this.entryMap, [entryId, key], data[key as keyof TIssueTimeEntry]);
        });
        this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(issueId, {
          total_tracked_seconds: this.getTotalTrackedSecondsByIssueId(issueId),
        });
      });

      const response = await this.issueService.updateIssueTimeEntry(workspaceSlug, projectId, issueId, entryId, data);

      // fetching activity
      this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
      return response;
    } catch (error) {
      console.error("error", error);
      runInAction(() => {
        Object.keys(initialData).forEach((key) => {
          set(this.entryMap, [entryId, key], initialData[key as keyof TIssueTimeEntry]);
        });
        this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(issueId, {
          total_tracked_seconds: this.getTotalTrackedSecondsByIssueId(issueId),
        });
      });
      throw error;
    }
  };

  removeTimeEntry = async (workspaceSlug: string, projectId: string, issueId: string, entryId: string) => {
    await this.issueService.deleteIssueTimeEntry(workspaceSlug, projectId, issueId, entryId);

    const entryIndex = this.entries[issueId]?.findIndex((_entry) => _entry === entryId) ?? -1;
    if (entryIndex >= 0)
      runInAction(() => {
        this.entries[issueId].splice(entryIndex, 1);
        delete this.entryMap[entryId];
        this.rootIssueDetailStore.rootIssueStore.issues.updateIssue(issueId, {
          total_tracked_seconds: this.getTotalTrackedSecondsByIssueId(issueId),
        });
      });

    // fetching activity
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
  };
}
