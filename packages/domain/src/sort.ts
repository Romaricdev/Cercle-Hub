import { ContractError } from "@cercle/contracts";

export type SortColumn = "created_at" | "id";

export function assertSortColumn(value: string): SortColumn {
  if (value !== "created_at" && value !== "id") {
    throw new ContractError("INVALID_SORT", "Le tri demandé n’est pas autorisé.");
  }
  return value;
}
