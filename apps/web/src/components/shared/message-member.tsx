"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  displayInternational,
  mailtoUrl,
  messageTemplate,
  smsUrl,
  whatsappUrl,
  type MessageKind,
} from "@/lib/messaging";

// Flow audit 6.5 + 7.3: one-tap message to a member, sent from the coach's
// own WhatsApp / SMS / email app with the text filled in (editable). MatOS
// sends nothing and stores nothing.
export function MessageMember({
  firstName,
  phone,
  email,
  gymName,
  kind,
  label,
  variant = "outline",
}: {
  firstName: string;
  phone: string | null;
  email: string | null;
  /** Looked up when not passed (client pages). */
  gymName?: string;
  kind: MessageKind;
  label?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const [open, setOpen] = useState(false);
  const { data: fetchedName } = useQuery({
    // Keyed by the signed-in account's current gym (the switcher can change it).
    queryKey: ["gym-name-current"],
    enabled: !gymName,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data: current } = await supabase.rpc("current_member");
      const gymId = current?.[0]?.gym_id;
      if (!gymId) return "the academy";
      const { data } = await supabase.from("gyms").select("name").eq("id", gymId).maybeSingle();
      return data?.name ?? "the academy";
    },
  });
  const initial = messageTemplate(kind, firstName, gymName ?? fetchedName ?? "the academy");
  const [text, setText] = useState(initial.text);
  const wa = whatsappUrl(phone, text);
  const sms = smsUrl(phone, text);
  const mail = mailtoUrl(email, initial.subject, text);
  const none = !wa && !mail;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied.");
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead.");
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="h-11"
        onClick={() => {
          setText(initial.text);
          setOpen(true);
        }}
      >
        {label ?? (kind === "payment" ? "Send reminder" : "Message")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {kind === "payment" ? `Payment reminder to ${firstName}` : `Message ${firstName}`}
            </DialogTitle>
            <DialogDescription>
              Opens your own WhatsApp, messages or email app with this text — edit it first if you
              like.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="message-text">Message</Label>
            <Textarea
              id="message-text"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
            />
          </div>
          {wa ? (
            <p className="text-xs text-muted-foreground">
              WhatsApp and text go to {displayInternational(phone)}. Check it&apos;s right before
              sending.
            </p>
          ) : null}
          {none ? (
            <p className="text-sm text-muted-foreground">
              No phone number or email on file for {firstName}. Copy the message and send it another
              way, or add their details on their profile.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {wa ? (
              <Button asChild className="h-11">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
            {sms ? (
              <Button asChild variant="outline" className="h-11">
                <a href={sms}>
                  <MessageSquare className="mr-2 h-4 w-4" aria-hidden /> Text message
                </a>
              </Button>
            ) : null}
            {mail ? (
              <Button asChild variant="outline" className="h-11">
                <a href={mail}>
                  <Mail className="mr-2 h-4 w-4" aria-hidden /> Email
                </a>
              </Button>
            ) : null}
            <Button variant="outline" className="h-11" onClick={copy}>
              <Copy className="mr-2 h-4 w-4" aria-hidden /> Copy message
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
