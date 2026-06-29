import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutDialog } from "./CheckoutDialog";
import { useCatalogStore } from "../../catalogStore";
import type { CatalogGame } from "../../types";

const freeGame: CatalogGame = {
  id: 1,
  publisher_user_id: 2,
  title: "Pixel Knights",
  description: null,
  cover_url: null,
  price_cents: 0,
  created_at: "2026-01-01T00:00:00Z",
  file_url: null,
  file_size_bytes: null,
  version: "0.9.4",
  tags: null,
  status: "approved",
  min_specs: null,
  recommended_specs: null,
  save_path_hint: null,
  avg_rating: null,
  review_count: 0,
};

const paidGame: CatalogGame = { ...freeGame, id: 2, price_cents: 1999 };

beforeEach(() => {
  useCatalogStore.setState({ checkoutGame: null, error: null, purchasingId: null });
});

describe("CheckoutDialog", () => {
  it("disables the confirm button until the terms checkbox is accepted", async () => {
    const user = userEvent.setup();
    render(<CheckoutDialog game={freeGame} />);

    const confirmButton = screen.getByRole("button", { name: /jetzt kostenlos bestellen/i });
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(confirmButton).toBeEnabled();
  });

  it("only calls purchaseGame once both checkboxes are accepted for a paid game", async () => {
    const purchaseGame = vi.fn().mockResolvedValue(undefined);
    useCatalogStore.setState({ purchaseGame });
    const user = userEvent.setup();
    render(<CheckoutDialog game={paidGame} />);

    const confirmButton = screen.getByRole("button", { name: /jetzt zahlungspflichtig bestellen/i });
    expect(confirmButton).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(confirmButton).toBeDisabled();

    await user.click(checkboxes[1]);
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(purchaseGame).toHaveBeenCalledWith(paidGame.id);
  });

  it("shows the Stripe placeholder instead of a real payment method", () => {
    render(<CheckoutDialog game={paidGame} />);
    expect(screen.getByText(/bald über stripe|coming soon/i)).toBeInTheDocument();
  });
});
