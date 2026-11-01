"use client";

import { useState } from "react";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { usePolicy } from "@/hooks/usePolicy";

/**
 * Whether the core's file page draws the knowledge editor for this drive.
 *
 * False until both reads have answered. `usePolicy` answers enabled while it
 * loads, and again on each background refetch, so the last answer is kept
 * rather than letting the controls flicker. A failed policy read comes back
 * enabled, as it does on the file page.
 */
export function useEditorAvailable(drive: string): boolean {
  const { loading, addons } = useAddonSlots();
  const policy = usePolicy(drive, "knowledge", "editor");
  const [decided, setDecided] = useState<boolean | null>(null);

  const answer = loading || policy.isLoading ? null : "knowledge" in addons && policy.enabled;
  if (answer !== null && answer !== decided) setDecided(answer);
  return answer ?? decided ?? false;
}
