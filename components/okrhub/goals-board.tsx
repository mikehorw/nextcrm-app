"use client";

// OKR Hub fork (OKR-171): goal cards with progress bars, plus create/edit/delete.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRANDS } from "@/lib/okrhub/fields";
import {
  createGoal,
  deleteGoal,
  updateGoal,
  type GoalWithProgress,
} from "@/actions/okrhub/goals";

const ALL = "__all__";

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type FormState = {
  id?: string;
  name: string;
  amount: string;
  start_date: string;
  end_date: string;
  brand: string;
};

const blank = (): FormState => {
  // Default to the Aug to Jul year that contains today.
  const now = new Date();
  const y = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    name: `${y}/${String((y + 1) % 100).padStart(2, "0")} revenue`,
    amount: "",
    start_date: `${y}-08-01`,
    end_date: `${y + 1}-07-31`,
    brand: ALL,
  };
};

function GoalCard({
  goal,
  canEdit,
  onEdit,
  onDelete,
}: {
  goal: GoalWithProgress;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const width = Math.min(goal.percent, 100);
  const remaining = Math.max(goal.amount - goal.achieved, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              {goal.name}
            </CardTitle>
            <CardDescription>
              {fmtDay(goal.start_date)} to {fmtDay(goal.end_date)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="font-normal">
              {goal.brand ?? "All brands"}
            </Badge>
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit goal">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} aria-label="Delete goal">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-lg font-semibold">{money(goal.achieved, goal.currency)}</span>
          <span className="text-muted-foreground">
            of {money(goal.amount, goal.currency)} ({goal.percent}%)
          </span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={goal.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.name} progress`}
        >
          <div
            className={`h-full rounded-full ${goal.percent >= 100 ? "bg-emerald-600" : "bg-primary"}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {goal.wonCount} won {goal.wonCount === 1 ? "deal" : "deals"}
          {remaining > 0 ? `, ${money(remaining, goal.currency)} to go` : ", target reached"}
        </p>
      </CardContent>
    </Card>
  );
}

export function GoalsBoard({ goals, canEdit }: { goals: GoalWithProgress[]; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<GoalWithProgress | null>(null);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const input = {
        name: form.name,
        amount: form.amount,
        start_date: form.start_date,
        end_date: form.end_date,
        brand: form.brand === ALL ? null : form.brand,
      };
      const result = form.id ? await updateGoal(form.id, input) : await createGoal(input);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Goal updated" : "Goal created");
      setForm(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (goal: GoalWithProgress) => {
    const result = await deleteGoal(goal.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Goal deleted");
    setToDelete(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button size="sm" onClick={() => setForm(blank())}>
          <Plus className="mr-2 h-4 w-4" />
          New goal
        </Button>
      )}

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No goals yet. A goal counts the value of opportunities moved to the Won stage between its start and end dates.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              canEdit={canEdit}
              onEdit={() =>
                setForm({
                  id: g.id,
                  name: g.name,
                  amount: String(g.amount),
                  start_date: g.start_date,
                  end_date: g.end_date,
                  brand: g.brand ?? ALL,
                })
              }
              onDelete={() => setToDelete(g)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete goal?</DialogTitle>
            <DialogDescription>
              &quot;{toDelete?.name}&quot; will be removed from the Goals page. Opportunities are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => toDelete && remove(toDelete)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              Progress is the value of deals won in this period. Leave Brand as All brands for an overall goal.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="goal-name">Name</Label>
                <Input id="goal-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-amount">Target (£)</Label>
                <Input
                  id="goal-amount"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="goal-start">Start</Label>
                  <Input id="goal-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="goal-end">End</Label>
                  <Input id="goal-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Brand</Label>
                <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                  <SelectTrigger aria-label="Brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All brands</SelectItem>
                    {BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
