"use client";

// OKR Hub fork (OKR-170): Tags field for the account create/edit forms.

import { z } from "zod";
import { Control, FieldValues, Path } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TagInput } from "@/components/okrhub/tag-input";
import { ACCOUNT_TAG_SUGGESTIONS } from "@/lib/okrhub/fields";

/** Spread into an account form's zod object. */
export const okrhubAccountSchema = {
  tags: z.array(z.string()).optional(),
};

export function OkrhubAccountTagsField<T extends FieldValues>({
  control,
  disabled,
}: {
  control: Control<T>;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={"tags" as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tags</FormLabel>
          <FormControl>
            <TagInput
              value={field.value}
              onChange={field.onChange}
              suggestions={ACCOUNT_TAG_SUGGESTIONS}
              disabled={disabled}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
