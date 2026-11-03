// Flow audit 9.3: a waiver version's text, as written by the owner. Plain
// text with its line breaks kept (never HTML). Scrolls inside its box so a
// long waiver doesn't push the signing form off the screen.
export function WaiverText({ body, version }: { body: string; version: number }) {
  return (
    <section
      className="flex flex-col gap-2 rounded-md border bg-muted/40 p-4"
      aria-label={`Waiver, version ${version}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Version {version}
      </p>
      <div
        className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed"
        tabIndex={0}
      >
        {body}
      </div>
    </section>
  );
}
