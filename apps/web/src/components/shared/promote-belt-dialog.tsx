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
};

export function PromoteBeltDialog({
  memberId,
  currentBelt,
  currentStripes,
}: PromoteBeltDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [belt, setBelt] = useState<BeltColor>(currentBelt);
  const [stripes, setStripes] = useState(currentStripes);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setCelebrating(false);
    setBelt(currentBelt);
    setStripes(currentStripes);
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
        if (!next) resetAndClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">
          Promote belt
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
                        {n}
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
