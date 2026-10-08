/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
// plane components
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { InputField } from "@makeplane/propel/components/input-field";
import { parseDurationInput } from "@plane/utils";
// local imports
import type { TTimeEntryOperations } from "./helper";

export type TLogTimeFormFields = {
  duration: string;
  description: string;
  logged_on: string;
};

export type TLogTimeModal = {
  isModalOpen: boolean;
  handleOnClose?: () => void;
  timeEntryOperations: TTimeEntryOperations;
};

const getToday = () => new Date().toISOString().slice(0, 10);

const defaultValues: TLogTimeFormFields = {
  duration: "",
  description: "",
  logged_on: getToday(),
};

export const LogTimeModal = observer(function LogTimeModal(props: TLogTimeModal) {
  const { isModalOpen, handleOnClose, timeEntryOperations } = props;
  // i18n
  const { t } = useTranslation();
  // react hook form
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    control,
    reset,
    setError,
  } = useForm<TLogTimeFormFields>({
    defaultValues,
  });

  const onClose = () => {
    if (handleOnClose) handleOnClose();
  };

  const handleFormSubmit = async (formData: TLogTimeFormFields) => {
    const durationSeconds = parseDurationInput(formData.duration);
    if (!durationSeconds) {
      setError("duration", { message: t("issue.time_tracking.invalid_duration") });
      return;
    }
    try {
      await timeEntryOperations.create(formData.duration, formData.description || undefined, formData.logged_on);
      onClose();
    } catch (error) {
      console.error("error", error);
    }
  };

  useEffect(() => {
    if (isModalOpen) reset({ ...defaultValues, logged_on: getToday() });
  }, [reset, isModalOpen]);

  return (
    <Dialog
      open={isModalOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="md">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("issue.time_tracking.log_time")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody render={<div className="space-y-3" />}>
              <Controller
                control={control}
                name="duration"
                rules={{
                  required: t("issue.time_tracking.invalid_duration"),
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <InputField
                    size="lg"
                    orientation="vertical"
                    id="duration"
                    type="text"
                    label={t("issue.display.properties.time_tracked")}
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    error={errors.duration?.message}
                    placeholder={t("issue.time_tracking.duration_placeholder")}
                  />
                )}
              />
              <Controller
                control={control}
                name="description"
                render={({ field: { value, onChange, ref } }) => (
                  <InputField
                    size="lg"
                    orientation="vertical"
                    id="description"
                    type="text"
                    label={t("common.description")}
                    hint={t("common.optional")}
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    error={errors.description?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="logged_on"
                render={({ field: { value, onChange, ref } }) => (
                  <InputField
                    size="lg"
                    orientation="vertical"
                    id="logged_on"
                    type="date"
                    label={t("common.date")}
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    error={errors.logged_on?.message}
                  />
                )}
              />
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" onClick={onClose} label={t("common.cancel")} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              loading={isSubmitting}
              label={isSubmitting ? t("common.adding") : t("issue.time_tracking.log_time")}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
