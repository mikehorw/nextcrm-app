"use client";

// OKR Hub fork (OKR-171): "Mark lost" on the opportunity page. Asks for a
// Lost reason, then marks the deal lost (status INACTIVE).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThumbsDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOST_REASONS } from "@/lib/okrhub/fields";
import { markOpportunityLost } from "@/actions/okrhub/mark-lost";

export function MarkLostButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const onConfirm = async () => {
    setSaving(true);
    try {
      const result = await markOpportunityLost(opportunityId, reason);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Opportunity marked lost");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ThumbsDown className="mr-2 h-4 w-4" />
        Mark lost
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark opportunity lost</DialogTitle>
            <DialogDescription>
              It leaves the open pipeline. Move it to another stage later to reopen it.
            </DialogDescription>
          </DialogHeader>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Lost reason">
              <SelectValue placeholder="Choose a lost reason" />
            </SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={!reason || saving}>
              {saving ? "Saving…" : "Mark lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
