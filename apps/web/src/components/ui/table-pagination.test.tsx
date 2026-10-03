import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TablePagination, useTablePagination } from "./table-pagination";

function Harness() {
  const pagination = useTablePagination(Array.from({ length: 23 }, (_, index) => `Ligne ${index + 1}`));
  return (
    <div>
      <ul>{pagination.pageItems.map((item) => <li key={item}>{item}</li>)}</ul>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={23}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        itemLabel="ligne"
      />
    </div>
  );
}

describe("TablePagination", () => {
  it("change de page et permet de choisir le nombre de lignes", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("1–10 sur 23 lignes")).toBeVisible();
    expect(screen.getByText("Ligne 10")).toBeVisible();
    expect(screen.queryByText("Ligne 11")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Suivante" }));
    expect(screen.getByText("11–20 sur 23 lignes")).toBeVisible();
    expect(screen.getByText("Ligne 11")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Nombre de lignes par page"), "20");
    expect(screen.getByText("1–20 sur 23 lignes")).toBeVisible();
    expect(screen.getByText("Page 1 sur 2")).toBeVisible();
  });
});
