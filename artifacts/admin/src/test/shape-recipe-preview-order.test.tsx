import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { previewPlatform } = vi.hoisted(() => ({
  previewPlatform: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    shapeRecipesApi: {
      ...actual.shapeRecipesApi,
      listPlatform: vi.fn().mockResolvedValue([]),
      previewPlatform,
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { RecipeCenter } from "@/pages/studios/StickerStudioHub";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("platform shape recipe preview ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    previewPlatform.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the newest validation failure when an older success resolves last", async () => {
    const older = deferred<{ processedImageData: string; cutlineSvg: string }>();
    const newer = deferred<{ processedImageData: string; cutlineSvg: string }>();
    previewPlatform.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <RecipeCenter createTrigger={0} />
      </QueryClientProvider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.change(screen.getByLabelText("SVG template"), { target: { value: "invalid newer svg" } });
    await act(async () => {
      vi.advanceTimersByTime(450);
      newer.reject(new Error("newer recipe is invalid"));
      await Promise.resolve();
    });

    expect(screen.getByText("newer recipe is invalid")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeDisabled();

    await act(async () => {
      older.resolve({ processedImageData: "data:image/svg+xml;base64,older", cutlineSvg: "<svg/>" });
      await Promise.resolve();
    });

    expect(screen.getByText("newer recipe is invalid")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeDisabled();
  });
});