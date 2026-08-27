/**
 * PlannerLibrary — standalone Ink entry point.
 *
 * Gallery of the user's generated planners. Click any card to open it in
 * the standalone Ink editor (/super/ink/:id).
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { BookOpen, PenLine, Plus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlannerDrive { pdfFileId?: string | null; }
interface PlannerSetup { startYear?: number; months?: number; }

interface Planner {
  id: string;
  setup: PlannerSetup;
  editionId?: string | null;
  drive: PlannerDrive;
  createdAt: string;
  generatedAt?: string | null;
}

interface LayerInfo { pageId: string; updatedAt: string; }

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── pdf.js singleton (shared across all thumbnails on this page) ──────────────

const PDFJS_BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";
let pdfjsCache: Promise<unknown> | null = null;
function getPdfjs(): Promise<unknown> {
  if (!pdfjsCache) {
    pdfjsCache = (
      import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`) as Promise<Record<string, unknown>>
    ).then((lib) => {
      (lib.GlobalWorkerOptions as { workerSrc: string }).workerSrc =
        `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsCache;
}

// ── PlannerThumbnail ──────────────────────────────────────────────────────────

function PlannerThumbnail({ plannerId, hasDrive }: { plannerId: string; hasDrive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">(
    hasDrive ? "loading" : "error",
  );

  useEffect(() => {
    if (!hasDrive) return;
    let cancelled = false;

    getPdfjs()
      .then(async (pdfjsLib: unknown) => {
        if (cancelled) return;
        const lib = pdfjsLib as {
          getDocument: (o: unknown) => { promise: Promise<unknown> };
        };
        const pdfDoc = await lib
          .getDocument({ url: `/api/planners/${plannerId}/pdf-proxy`, withCredentials: true })
          .promise as { getPage: (n: number) => Promise<unknown> };
        if (cancelled) return;
        const page = await pdfDoc.getPage(1) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void> };
        };
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = 280 / viewport.width;
        canvas.width  = Math.round(viewport.width  * scale);
        canvas.height = Math.round(viewport.height * scale);
        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: page.getViewport({ scale }),
        }).promise;
        if (!cancelled) setStatus("done");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
  }, [plannerId, hasDrive]);

  const THUMB_H = 190;

  if (status === "error") {
    return (
      <div
        style={{
          height: THUMB_H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#E7DCCB",
          color: "#A8998A",
          fontSize: 12,
          gap: 8,
        }}
      >
        <BookOpen style={{ width: 28, height: 28, opacity: 0.45 }} />
        No preview
      </div>
    );
  }

  return (
    <div style={{ height: THUMB_H, position: "relative", overflow: "hidden", background: "#F0EAE0" }}>
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#A8998A",
            fontSize: 12,
          }}
        >
          Loading preview…
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: status === "done" ? "block" : "none", width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

// ── PlannerCard ───────────────────────────────────────────────────────────────

function PlannerCard({
  planner,
  layers,
  onClick,
}: {
  planner: Planner;
  layers: LayerInfo[] | undefined;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const year   = planner.setup?.startYear ?? "—";
  const months = planner.setup?.months;
  const label  = months ? `${year} · ${months} months` : String(year);

  const hasDrive = Boolean(
    planner.drive?.pdfFileId && !String(planner.drive.pdfFileId).startsWith("pdf-"),
  );

  const annotatedCount = layers?.length ?? null;
  const lastEdited =
    layers && layers.length > 0
      ? new Date(
          Math.max(...layers.map((l) => new Date(l.updatedAt).getTime())),
        ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#FFFDF9",
        border: "1px solid #E7DCCB",
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s, transform 0.12s",
        boxShadow: hovered
          ? "0 6px 20px rgba(0,0,0,0.13)"
          : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
      }}
    >
      <PlannerThumbnail plannerId={planner.id} hasDrive={hasDrive} />

      <div style={{ padding: "14px 16px 16px" }}>
        {/* Name + year */}
        <div
          style={{
            fontFamily: "'Spectral', serif",
            fontWeight: 600,
            fontSize: 17,
            color: "#1B2A4A",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>

        {/* Annotation badge */}
        {annotatedCount !== null && (
          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: annotatedCount > 0 ? "#C87560" : "#A8998A",
                background: annotatedCount > 0 ? "#FEF0ED" : "#F0EAE0",
                padding: "3px 9px",
                borderRadius: 20,
              }}
            >
              {annotatedCount > 0
                ? `${annotatedCount} page${annotatedCount !== 1 ? "s" : ""} annotated`
                : "Not yet annotated"}
            </span>
          </div>
        )}

        {/* Footer row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#C4B8A8" }}>
            {lastEdited
              ? `Last edited ${lastEdited}`
              : `Created ${new Date(planner.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}`}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "#C87560",
            }}
          >
            <PenLine style={{ width: 12, height: 12 }} />
            Annotate
          </span>
        </div>
      </div>
    </div>
  );
}

// ── PlannerLibrary ────────────────────────────────────────────────────────────

export default function PlannerLibrary() {
  const [, navigate] = useLocation();
  const [planners, setPlanners] = useState<Planner[] | null>(null);
  const [layerMap, setLayerMap]  = useState<Record<string, LayerInfo[]>>({});
  const [error, setError]        = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Planner[]>("/planners")
      .then((data) => {
        setPlanners(data);
        // Fetch layer summaries for all planners in parallel (lightweight — counts + timestamps only)
        Promise.allSettled(
          data.map((p) =>
            apiFetch<LayerInfo[]>(`/planners/${p.id}/layers`).then((layers) => ({
              id: p.id,
              layers,
            })),
          ),
        ).then((results) => {
          const map: Record<string, LayerInfo[]> = {};
          results.forEach((r) => {
            if (r.status === "fulfilled") map[r.value.id] = r.value.layers;
          });
          setLayerMap(map);
        });
      })
      .catch((err: unknown) => setError(String(err)));
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!planners && !error) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "#A8998A",
          fontFamily: "'Instrument Sans', sans-serif",
        }}
      >
        Loading your planners…
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "#D32F2F",
          fontFamily: "'Instrument Sans', sans-serif",
        }}
      >
        Could not load planners: {error}
      </div>
    );
  }

  const list = planners!;

  return (
    <div
      style={{
        fontFamily: "'Instrument Sans', sans-serif",
        padding: "36px 40px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Spectral', serif",
              fontSize: 28,
              fontWeight: 600,
              color: "#1B2A4A",
              margin: 0,
              marginBottom: 4,
            }}
          >
            My Planners
          </h1>
          <p style={{ fontSize: 13, color: "#A8998A", margin: 0 }}>
            {list.length > 0
              ? `${list.length} planner${list.length !== 1 ? "s" : ""} — click any to annotate`
              : "No planners yet"}
          </p>
        </div>

        <button
          onClick={() => navigate("/super/studios/planner?mode=build")}
          style={{
            background: "#1B2A4A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          New Planner
        </button>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {list.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "72px 24px",
            background: "#FFFDF9",
            border: "1px dashed #E0D5C8",
            borderRadius: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#F0EAE0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
            }}
          >
            <BookOpen style={{ width: 28, height: 28, color: "#C4B8A8" }} />
          </div>
          <h2
            style={{
              fontFamily: "'Spectral', serif",
              fontSize: 22,
              color: "#1B2A4A",
              margin: "0 0 8px",
            }}
          >
            No planners yet
          </h2>
          <p style={{ fontSize: 14, color: "#A8998A", marginBottom: 24, margin: "0 0 24px" }}>
            Build your first planner to start annotating.
          </p>
          <button
            onClick={() => navigate("/super/studios/planner?mode=build")}
            style={{
              background: "#C87560",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "11px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Build a Planner
          </button>
        </div>
      )}

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {list.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {list.map((p) => (
            <PlannerCard
              key={p.id}
              planner={p}
              layers={layerMap[p.id]}
              onClick={() => navigate(`/super/ink/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
