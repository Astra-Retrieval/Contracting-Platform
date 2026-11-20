import { Badge } from "@/components/ui";

const labels: Record<string, [string, "gray" | "green" | "amber" | "blue"]> = {
  new: ["Received", "gray"],
  planned: ["Planned", "blue"],
  done: ["Done", "green"],
  declined: ["Not planned", "amber"],
};

export function FeatureStatus({ status }: { status: string }) {
  const [label, tone] = labels[status] ?? labels.new;
  return <Badge tone={tone}>{label}</Badge>;
}
