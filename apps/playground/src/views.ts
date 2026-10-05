export const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "bills", label: "Bills" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const viewLabel = (id: ViewId): string => VIEWS.find((view) => view.id === id)!.label;
