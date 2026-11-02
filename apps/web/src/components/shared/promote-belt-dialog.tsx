"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import {
  BeltDisplay,
  ALL_BELTS,
  BELT_LABELS,
  type BeltColor,
} from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PromoteBeltDialogProps = {
  memberId: string;
  currentBelt: BeltColor;
  currentStripes: number;
  // Flow audit 5.3: open pre-filled with the suggested next step (the
  // Promotions page), instead of the current rank.
  suggestedBelt?: BeltColor;
  suggestedStripes?: number;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
};

export function PromoteBeltDialog({
  memberId,
  currentBelt,
  currentStripes,
  suggestedBelt,
  suggestedStripes,
  triggerLabel = "Promote belt",
  triggerVariant = "outline",
}: PromoteBeltDialogProps) {
  const router = useRouter();
  const initialBelt = suggestedBelt ?? currentBelt;
  const initialStripes = suggestedStripes ?? currentStripes;
  const [open, setOpen] = useState(false);
  const [belt, setBelt] = useState<BeltColor>(initialBelt);
  const [stripes, setStripes] = useState(initialStripes);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setCelebrating(false);
    setBelt(initialBelt);
    setStripes(initialStripes);
    setNotes("");
    router.refresh();
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/members/${memberId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belt, stripes, notes }),
      });
      if (res.ok) {
        setCelebrating(true);
      } else {
        const body = await res.json();
        toast.error(body.error ?? "Couldn't save the promotion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          resetAndClose();
        } else {
          // Re-read the rank each time it opens: after a promotion the page
          // refreshes but this component stays mounted, so state from the
          // first render would offer the rank they already hold.
          setBelt(initialBelt);
          setStripes(initialStripes);
          setNotes("");
          setOpen(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className="h-11">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {celebrating ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center duration-500 animate-in fade-in zoom-in-95">
            <PartyPopper className="h-10 w-10 text-primary duration-700 animate-in zoom-in" />
            <p className="text-xl font-semibold">Congratulations!</p>
            <BeltDisplay belt={belt} stripes={stripes} size="lg" showLabel />
            <Button onClick={resetAndClose} className="h-11">
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Promote belt</DialogTitle>
              <DialogDescription>
                Updates their current belt and adds an entry to their belt history.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Belt</Label>
                <Select value={belt} onValueChange={(v) => setBelt(v as BeltColor)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_BELTS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {BELT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Stripes</Label>
                <Select value={String(stripes)} onValueChange={(v) => setStripes(Number(v))}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {String(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex items-center justify-center rounded-md border p-4">
                <BeltDisplay belt={belt} stripes={stripes} size="lg" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="h-11" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button className="h-11" onClick={handleConfirm} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Confirm promotion"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
