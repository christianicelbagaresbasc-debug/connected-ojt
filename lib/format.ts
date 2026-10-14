export const phDate = (value: Date | string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";
export const percent = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;
