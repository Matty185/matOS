// Shared by profile-view.tsx and compare-view.tsx — a titled card wrapper
// around a stack of metric rows. Extracted after Stage A6 code review
// flagged near-identical local copies in both files.
export function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
