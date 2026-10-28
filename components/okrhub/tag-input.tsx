"use client";

// OKR Hub fork (OKR-170): free-form tag input with one-click suggestions.
// Enter or comma adds a tag; Backspace on an empty box removes the last one.

import * as React from "react";
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { normaliseTags } from "@/lib/okrhub/fields";

interface TagInputProps {
  value: string[] | null | undefined;
  onChange: (value: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type a tag and press Enter",
  disabled,
  id,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const tags = value ?? [];
  const lower = new Set(tags.map((t) => t.toLowerCase()));

  const add = (raw: string) => {
    const next = normaliseTags([...tags, ...raw.split(",")]);
    onChange(next);
    setDraft("");
  };
  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 rounded-sm px-1.5 font-normal">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => remove(tag)}
                  className="rounded-sm opacity-70 hover:opacity-100"
                >
                  <Cross2Icon className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && add(draft)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            remove(tags[tags.length - 1]);
          }
        }}
      />
      {suggestions.some((s) => !lower.has(s.toLowerCase())) && !disabled && (
        <div className="flex flex-wrap gap-1">
          {suggestions
            .filter((s) => !lower.has(s.toLowerCase()))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-sm border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <PlusIcon className="h-3 w-3" />
                {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
