import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StructuredRepeater } from "@/components/worldsmith/editorial/EditorialFields";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

describe("StructuredRepeater", () => {
  it("adds and removes items", () => {
    let items = [{ id: 1 }];
    const handleChange = vi.fn((newItems) => {
      items = newItems;
    });

    const { rerender } = render(
      <StructuredRepeater
        items={items}
        onChange={handleChange}
        defaultNewItem={() => ({ id: 2 })}
        addButtonLabel="Add Item"
        renderItem={(item, idx, update, remove) => (
          <div data-testid={`item-${item.id}`}>
            Item {item.id}
          </div>
        )}
      />
    );

    // Verify one item
    expect(screen.getByTestId("item-1")).toBeInTheDocument();

    // Add item
    fireEvent.click(screen.getByText("Add Item"));
    expect(handleChange).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);

    // Rerender with new items
    rerender(
      <StructuredRepeater
        items={[{ id: 1 }, { id: 2 }]}
        onChange={handleChange}
        defaultNewItem={() => ({ id: 3 })}
        renderItem={(item, idx, update, remove) => (
          <div data-testid={`item-${item.id}`}>
            Item {item.id}
          </div>
        )}
      />
    );

    // Remove first item
    const removeButtons = screen.getAllByRole("button").filter(b => !b.textContent);
    fireEvent.click(removeButtons[0]);
    expect(handleChange).toHaveBeenCalledWith([{ id: 2 }]);
  });
});
