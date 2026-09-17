import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import ProductionProfiles from "../ProductionProfiles";
import ComponentSpecs from "../ComponentSpecs";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";

// Mock apiFetch
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/current-path", vi.fn()]),
  Link: ({ children }: any) => <a>{children}</a>,
}));

vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-1",
    selectedWorld: { id: "world-1", name: "Test World" },
    worlds: [{ id: "world-1", name: "Test World" }],
    collections: [],
    syncStatus: "synced",
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

describe("Production Profiles & Component Specs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends correct payload for creating a production profile", async () => {
    (apiFetch as any).mockImplementation(async (url: string, options: any) => {
      if (url === "/v1/editorial/worlds") return { worlds: [{ id: "world-1", name: "Test World" }] };
      if (url.includes("/v1/editorial/collections")) return { collections: [] };
      if (url === "/v1/editorial/punch-templates") return { punch_templates: [] };
      if (url === "/v1/editorial/production-profiles") {
        if (!options) return { production_profiles: [] };
        if (options.method === "POST") return { production_profile: { id: "123" } };
      }
      return {};
    });

    renderWithProviders(<ProductionProfiles />);

    fireEvent.click(await screen.findByRole("button", { name: /New Profile/i }));

    await screen.findByRole("heading", { name: "New Production Profile" });

    fireEvent.change(screen.getByLabelText(/Profile Name/i), { target: { value: "Digital Master" } });
    fireEvent.change(screen.getByLabelText(/Profile Code/i), { target: { value: "DIG-MST" } });
    
    // Choose output medium
    fireEvent.change(screen.getByLabelText(/Output Medium/i), { target: { value: "digital" } });
    
    // Save
    fireEvent.click(screen.getByRole("button", { name: /Create Production Profile/i }));

    await waitFor(() => {
      const calls = (apiFetch as any).mock.calls;
      const postCall = calls.find((c: any) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe("Digital Master");
      expect(body.code).toBe("DIG-MST");
      expect(body.outputMedium).toBe("digital");
    });
  });

  it("toggles recto/verso preview correctly", async () => {
    (apiFetch as any).mockImplementation(async (url: string) => {
      if (url === "/v1/editorial/worlds") return { worlds: [{ id: "world-1", name: "Test World" }] };
      if (url.includes("/v1/editorial/collections")) return { collections: [] };
      if (url === "/v1/editorial/punch-templates") return { punch_templates: [] };
      if (url === "/v1/editorial/production-profiles") return { production_profiles: [] };
      return {};
    });

    renderWithProviders(<ProductionProfiles />);

    fireEvent.click(await screen.findByRole("button", { name: /New Profile/i }));
    
    // Fill required dimensions to show preview
    fireEvent.change(screen.getByLabelText(/Finished Width/i), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText(/Finished Height/i), { target: { value: "9.25" } });
    fireEvent.change(screen.getByLabelText(/Binding Edge Behavior/i), { target: { value: "mirrored" } });
    fireEvent.change(screen.getByLabelText(/Binding Safe Zone/i), { target: { value: "0.75" } });

    // Wait for visualization button
    const versoBtn = await screen.findByRole("button", { name: /Verso \(Left\)/i });
    const rectoBtn = screen.getByRole("button", { name: /Recto \(Right\)/i });

    // Initially Recto
    expect(rectoBtn).toHaveClass("bg-white");
    expect(versoBtn).not.toHaveClass("bg-white");

    fireEvent.click(versoBtn);
    expect(versoBtn).toHaveClass("bg-white");
    expect(rectoBtn).not.toHaveClass("bg-white");
  });

  it("allows selecting a production profile in Component Specs", async () => {
    (apiFetch as any).mockImplementation(async (url: string, options: any) => {
      if (url === "/v1/editorial/worlds") return { worlds: [{ id: "world-1", name: "Test World" }] };
      if (url.includes("/v1/editorial/collections")) return { collections: [] };
      if (url.includes("/v1/editorial/production-profiles")) {
        return { production_profiles: [{ id: "prof-1", name: "Classic Print" }] };
      }
      if (url.includes("/v1/editorial/component-specs")) {
        if (!options) return { component_specs: [] };
        if (options.method === "POST") return { component_spec: { id: "cs-1" } };
      }
      return {};
    });

    renderWithProviders(<ComponentSpecs />);
    
    // Select world to enable "New Component Spec" button
    fireEvent.click(await screen.findByRole("button", { name: /New Component Spec/i }));

    await screen.findByRole("heading", { name: "New Component Spec" });
    
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: "Test Spec" } });

    // Wait for the profiles to load and populate the select
    const select = await screen.findByLabelText(/Production Profile \(Optional\)/i);
    expect(screen.getByRole("option", { name: "Classic Print" })).toBeInTheDocument();
    
    fireEvent.change(select, { target: { value: "prof-1" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Create Component Spec/i }));

    await waitFor(() => {
      const calls = (apiFetch as any).mock.calls;
      const postCall = calls.find((c: any) => c[1]?.method === "POST" && c[0].includes("component-specs"));
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.productionProfileId).toBe("prof-1");
    });
  });
});
