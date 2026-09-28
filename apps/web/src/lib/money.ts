export function formatFcfa(value: string | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${BigInt(value).toLocaleString("fr-FR")} FCFA`;
}

export const XAF_NOTES = [
  { valueMinor: "10000", label: "10 000" },
  { valueMinor: "5000", label: "5 000" },
  { valueMinor: "2000", label: "2 000" },
  { valueMinor: "1000", label: "1 000" },
  { valueMinor: "500", label: "500" },
  { valueMinor: "100", label: "100" },
  { valueMinor: "50", label: "50" },
  { valueMinor: "25", label: "25" },
  { valueMinor: "10", label: "10" },
  { valueMinor: "5", label: "5" },
  { valueMinor: "2", label: "2" },
  { valueMinor: "1", label: "1" },
] as const;
