"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createExternalPersonSchema, updateExternalPersonSchema } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type FormValues = { display_name: string; notes?: string };

type ExternalPersonFormDialogProps =
  | { mode: "create"; onSaved: () => void }
  | { mode: "edit"; personId: string; defaultValues: FormValues; onSaved: () => void };

export function ExternalPersonFormDialog(props: ExternalPersonFormDialogProps) {
  const isEdit = props.mode === "edit";
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? updateExternalPersonSchema : createExternalPersonSchema,
    ) as never,
    defaultValues: isEdit ? props.defaultValues : { display_name: "", notes: "" },
  });

  async function onSubmit(data: FormValues) {
    const url = isEdit ? `/api/external-people/${props.personId}` : "/api/external-people";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, notes: data.notes || null }),
    });
    const body = await res.json();

    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }

    toast.success(isEdit ? "Person updated." : "Person added.");
    setOpen(false);
    if (!isEdit) reset();
    props.onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" className="h-11">
            Edit
          </Button>
        ) : (
          <Button className="h-11">Add person</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit person" : "Add external person"}</DialogTitle>
          <DialogDescription>
            A free-named analyst record — not linked to any MatOS account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display_name">Name</Label>
            <Input id="display_name" className="h-11" {...register("display_name")} />
            {errors.display_name ? (
              <p className="text-sm text-destructive">{errors.display_name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" maxLength={1000} {...register("notes")} />
            {errors.notes ? (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
