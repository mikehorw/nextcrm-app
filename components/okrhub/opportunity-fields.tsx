"use client";

// OKR Hub fork (OKR-170): Brand, Service line, Value type and Lost reason
// for the opportunity create/edit forms. Self-contained so the upstream
// forms only need one line to render it plus four schema keys.

import { z } from "zod";
import { Control, FieldValues, Path } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/okrhub/multi-select";
import {
  BRANDS,
  LOST_REASONS,
  SERVICE_LINES,
  VALUE_TYPES,
} from "@/lib/okrhub/fields";

/** Spread into an opportunity form's zod object. */
export const okrhubOpportunitySchema = {
  brand: z.string().nullable().optional(), // "" = none
  service_lines: z.array(z.string()).optional(),
  value_types: z.array(z.string()).optional(),
  lost_reason: z.string().nullable().optional(),
};

const NONE = "__none__";

export function OkrhubOpportunityFields<T extends FieldValues>({
  control,
  disabled,
}: {
  control: Control<T>;
  disabled?: boolean;
}) {
  const single = (
    name: "brand" | "lost_reason",
    label: string,
    options: readonly string[],
    placeholder: string,
  ) => (
    <FormField
      control={control}
      name={name as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            disabled={disabled}
            value={field.value || NONE}
            // "" (not null) so a cleared value survives the server-action call
            onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>
                <span className="text-muted-foreground">{placeholder}</span>
              </SelectItem>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const multi = (
    name: "service_lines" | "value_types",
    label: string,
    options: readonly string[],
    placeholder: string,
  ) => (
    <FormField
      control={control}
      name={name as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <MultiSelect
              options={options}
              value={field.value}
              onChange={field.onChange}
              placeholder={placeholder}
              disabled={disabled}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {single("brand", "Brand", BRANDS, "Choose brand")}
      {multi("service_lines", "Service line", SERVICE_LINES, "Choose service lines")}
      {multi("value_types", "Value type", VALUE_TYPES, "Choose value types")}
      {single("lost_reason", "Lost reason", LOST_REASONS, "No lost reason")}
    </div>
  );
}
