import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/shared";

const PAGE_SIZE = 20;

interface SessionReport {
  id: string;
  authorUserId: string;
  clientId: string;
  title: string;
  summary: string;
  workDone: string[];
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
  worldId: string | null;
  worldName: string | null;
  createdAt: string;
  authorName: string | null;
  clientName: string | null;
}

interface ReportsResponse {
  reports: SessionReport[];
  total: number;
}

interface ReportResponse {
  report: SessionReport;
}

function ReportSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section data-testid={`section-report-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
      )}
    </section>
  );
}

export default function WorldSmithSessionReports() {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ["worldsmith-session-reports", PAGE_SIZE, offset],
    queryFn: () => apiFetch<ReportsResponse>(`/worldsmith/session-reports?limit=${PAGE_SIZE}&offset=${offset}`),
  });
  const detailQuery = useQuery({
    queryKey: ["worldsmith-session-report", selectedId],
    queryFn: () => apiFetch<ReportResponse>(`/worldsmith/session-reports/${encodeURIComponent(selectedId!)}`),
    enabled: selectedId !== null,
  });

  const reports = listQuery.data?.reports ?? [];
  const total = listQuery.data?.total ?? 0;
  const report = detailQuery.data?.report;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;

  const downloadMarkdown = async (id: string) => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(`/api/worldsmith/session-reports/${encodeURIComponent(id)}/markdown`, {
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          response.status === 401 ? "Your session has expired. Sign in again to download this report."
            : typeof body?.error === "string" ? body.error : `Download failed (${response.status})`,
        );
      }
      if (!/^text\/markdown(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
        throw new Error("Download failed: the server did not return a Markdown report.");
      }
      const url = URL.createObjectURL(await response.blob());
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `worldsmith-session-report-${id}.md`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (selectedId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <button
          type="button"
          data-testid="button-back-session-reports"
          onClick={() => { setDownloadError(null); setSelectedId(null); }}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to reports
        </button>
        {detailQuery.isLoading ? (
          <div data-testid="status-report-loading" className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading session report…
          </div>
        ) : detailQuery.error ? (
          <div data-testid="status-report-error" role="alert" className="rounded-xl border border-destructive/30 bg-card p-5 text-sm text-destructive">
            Could not load this session report: {detailQuery.error instanceof Error ? detailQuery.error.message : "Unknown error"}
            <button type="button" onClick={() => detailQuery.refetch()} className="ml-3 underline">Try again</button>
          </div>
        ) : report ? (
          <>
            <PageHeader title={report.title} description={report.summary} scopeLabel="WorldSmith session report" />
            <div>
              <button
                type="button"
                data-testid="button-download-session-report-markdown"
                disabled={downloading}
                onClick={() => void downloadMarkdown(report.id)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? "Downloading…" : "Download Markdown"}
              </button>
              {downloadError && <p role="alert" className="mt-2 text-sm text-destructive">{downloadError}</p>}
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></span>
                <span>Author: {report.authorName ?? report.authorUserId}</span>
                <span>Client: {report.clientName ?? report.clientId}</span>
                {report.worldId && <span>World: {report.worldName ?? report.worldId}</span>}
              </div>
            </div>
            <div className="grid gap-5 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
              <ReportSection title="Work done" items={report.workDone} />
              <ReportSection title="Decisions" items={report.decisions} />
              <ReportSection title="Open questions" items={report.openQuestions} />
              <ReportSection title="Next steps" items={report.nextSteps} />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="WorldSmith session reports"
        description="Review session summaries, decisions, and follow-up work recorded by WorldSmith clients."
        scopeLabel="Platform"
      />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {listQuery.isLoading ? (
          <div data-testid="status-reports-loading" className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading session reports…
          </div>
        ) : listQuery.error ? (
          <div data-testid="status-reports-error" role="alert" className="p-6 text-sm text-destructive">
            Could not load session reports: {listQuery.error instanceof Error ? listQuery.error.message : "Unknown error"}
            <button type="button" onClick={() => listQuery.refetch()} className="ml-3 underline">Try again</button>
          </div>
        ) : reports.length === 0 ? (
          <div data-testid="status-reports-empty" className="flex flex-col items-center px-6 py-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <h2 className="mt-3 text-sm font-semibold text-foreground">No session reports yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reports will appear here when WorldSmith sessions are recorded.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {reports.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid={`button-open-session-report-${item.id}`}
                  onClick={() => { setDownloadError(null); setSelectedId(item.id); }}
                  className="w-full p-4 text-left transition-colors hover:bg-muted/30 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-foreground">{item.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.authorName ?? item.authorUserId}</span>
                        {item.worldId && <span>{item.worldName ?? item.worldId}</span>}
                        <span>{item.clientName ?? item.clientId}</span>
                      </div>
                    </div>
                    <time dateTime={item.createdAt} className="shrink-0 text-right text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</time>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {total > 0 && !listQuery.error && (
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span data-testid="text-report-page">Showing {offset + 1}–{Math.min(offset + reports.length, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="button-previous-report-page"
              disabled={offset === 0 || listQuery.isFetching}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            ><ChevronLeft className="h-4 w-4" /> Previous</button>
            <span className="hidden sm:inline">Page {pageNumber} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button
              type="button"
              data-testid="button-next-report-page"
              disabled={offset + PAGE_SIZE >= total || listQuery.isFetching}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            >Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}