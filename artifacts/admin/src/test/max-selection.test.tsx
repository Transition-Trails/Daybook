import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiChipSelect } from "@/components/worldsmith/editorial/EditorialFields";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

describe("MultiChipSelect max selection", () => {
  it("prevents selecting more than max options", async () => {
    const handleChange = vi.fn();
    
    render(
      <QueryClientProvider client={queryClient}>
        <MultiChipSelect
          values={["a", "b"]}
          onChange={handleChange}
          max={2}
          options={[
            { key: "a", label: "A" },
            { key: "b", label: "B" },
            { key: "c", label: "C" },
          ]}
        />
      </QueryClientProvider>
    );

    // Open dropdown
    fireEvent.click(screen.getByText("A")); // Click on a chip or the container

    // Check if C is disabled
    const checkbox = screen.getAllByRole("checkbox")[2] as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    // Try to toggle it anyway
    fireEvent.click(checkbox);
    expect(handleChange).not.toHaveBeenCalled();
  });
});
