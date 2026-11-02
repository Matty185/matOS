import { Megaphone } from "lucide-react";
import { formatSessionDate } from "@matos/shared";

export type AnnouncementView = {
  id: string;
  title: string;
  body: string | null;
  show_until: string;
  created_at: string;
};

/**
 * Flow audit 7.1: one gym announcement. Coach-written text is rendered as
 * plain React text (escaped), with line breaks kept.
 */
export function AnnouncementCard({
  announcement,
  today,
  footer,
}: {
  announcement: AnnouncementView;
  today: string;
  footer?: React.ReactNode;
}) {
  const { title, body, show_until } = announcement;
  return (
    <article className="flex gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="break-words font-medium">{title}</h3>
        {body ? (
          <p className="whitespace-pre-line break-words text-sm text-foreground/90">{body}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {show_until < today
            ? `Ended ${formatSessionDate(show_until)}`
            : show_until === today
              ? "Showing until today"
              : `Showing until ${formatSessionDate(show_until)}`}
        </p>
        {footer}
      </div>
    </article>
  );
}
