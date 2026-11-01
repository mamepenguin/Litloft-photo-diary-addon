// Stands in for the core's AddonSlotsProvider: the knowledge addon is installed.
const slots = { "file-detail-sections": [{ addon: "knowledge", component: "Editor", priority: 10 }] };
const value = {
  addons: { knowledge: { label: "Knowledge" } },
  slots,
  loading: false,
  getSlotEntries: (id: string) => (slots as Record<string, unknown[]>)[id] ?? [],
  hasSlot: (id: string) => id in slots,
};

export const useAddonSlots = () => value;
