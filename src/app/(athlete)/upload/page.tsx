import { Upload } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Video upload stub -> simulated delay -> mock analysis report lands in
// Stage 8. No video is ever stored, per CLAUDE.md's process-and-discard model.
export default function UploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Video Analysis</h1>
      <EmptyState
        icon={Upload}
        title="No analyses yet"
        description="Upload a training clip to get a mock technique breakdown."
        actionLabel="Upload video"
      />
    </div>
  );
}
