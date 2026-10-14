export function StatusBadge({ value }: { value: string }) {
  const tone = /APPROVED|VERIFIED|PLACED|COMPLETED|ACTIVE/.test(value) ? "good" : /PENDING|REVIEW|ACCEPTED/.test(value) ? "pending" : /REJECTED|DECLINED|CANCELLED/.test(value) ? "bad" : "muted";
  return <span className={`badge ${tone}`}>{value.replaceAll("_", " ")}</span>;
}
