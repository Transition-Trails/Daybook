/**
 * Releases — Super Admin page.
 *
 * Timeline of all platform releases, grouped by date.
 * Super admins can create draft releases, edit them, and publish
 * (which records the current timestamp and pushes to GitHub).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Tag, CheckCircle2, Loader2, X, Trash2 } from "lucide-react";
import { releasesApi, type ReleaseWithNotes } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ──────────────────────────────────────────────────────────────
const INK    = "hsl(221 46% 17%)";
const CLAY   = "#C87560";
const PAPER  = "hsl(38 65% 96%)";
const BORDER = "hsl(38 30% 88%)";
const MUTED  = "hsl(216 15% 52%)";
const SAGE   = "hsl(152 35% 40%)";

const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.18em]";

// ── Type colours ──────────────────────────────────────────────────────────────
function typeStyle(versionType: string): React.CSSProperties {
  if (versionType === "major")  return { background: "hsl(12 70% 92%)",  color: CLAY };
  if (versionType === "minor")  return { background: "hsl(221 60% 92%)", color: INK  };
  return { background: "hsl(152 35% 90%)", color: SAGE };
}

function typeLabel(versionType: string) {
  if (versionType === "major")  return "Major";
  if (versionType === "minor")  return "Minor";
  return "Bug Fix";
}

// ── Auto-bump helper ──────────────────────────────────────────────────────────
function bumpVersion(version: string, type: "major" | "minor" | "bugfix"): string {
  const [maj, min, pat] = version.split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function latestVersion(releases: ReleaseWithNotes[]): string {
  const published = releases
    .filter(r => r.isPublished)
    .sort((a, b) => {
      const [am, an, ap] = a.version.split(".").map(Number);
      const [bm, bn, bp] = b.version.split(".").map(Number);
      return bm - am || bn - an || bp - ap;
    });
  return published[0]?.version ?? "0.0.0";
}

// ── Release card ──────────────────────────────────────────────────────────────
function ReleaseCard({
  release,
  onEdit,
  onPublish,
}: {
  release: ReleaseWithNotes;
  onEdit: (r: ReleaseWithNotes) => void;
  onPublish: (r: ReleaseWithNotes) => void;
}) {
  return (
    <div
      className="rounded-xl border px-5 py-4 space-y-3"
      style={{ background: "white", borderColor: BORDER }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 flex-wrap">
        {/* Semver badge */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold font-mono"
          style={typeStyle(release.versionType)}
        >
          <Tag className="w-3 h-3" />
          v{release.version}
        </span>

        {/* Type label */}
        <span
          className={`${EYEBROW} inline-flex items-center px-2.5 py-1 rounded-full`}
          style={typeStyle(release.versionType)}
        >
          {typeLabel(release.versionType)}
        </span>

        {/* Title */}
        <span className="font-semibold text-sm flex-1 min-w-0" style={{ color: INK }}>
          {release.title}
        </span>

        {/* Status / actions */}
        <div className="flex items-center gap-2 shrink-0">
          {release.isPublished ? (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "hsl(142 50% 90%)", color: "hsl(142 55% 28%)" }}
            >
              <CheckCircle2 className="w-3 h-3" /> Published
            </span>
          ) : (
            <>
              <button
                onClick={() => onEdit(release)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium transition-colors hover:border-[#C87560] hover:text-[#C87560]"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => onPublish(release)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ background: INK }}
              >
                Publish
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      {release.notes.length > 0 && (
        <ul className="space-y-1 pl-1">
          {release.notes.map(n => (
            <li key={n.id} className="flex items-start gap-2 text-sm" style={{ color: MUTED }}>
              <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: MUTED }} />
              {n.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Release drawer ─────────────────────────────────────────────────────────────
function ReleaseDrawer({
  release,
  suggestedVersion,
  onClose,
  onSaved,
}: {
  release: ReleaseWithNotes | null;
  suggestedVersion: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isNew = release === null;

  const [version,     setVersion]     = useState(release?.version ?? suggestedVersion);
  const [versionType, setVersionType] = useState<"major" | "minor" | "bugfix">(
    (release?.versionType as "major" | "minor" | "bugfix") ?? "minor"
  );
  const [title,  setTitle]  = useState(release?.title ?? "");
  const [notes,  setNotes]  = useState<string[]>(
    release?.notes.map(n => n.note) ?? [""]
  );
  const [publishing, setPublishing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const addNote    = () => setNotes(prev => [...prev, ""]);
  const removeNote = (i: number) => setNotes(prev => prev.filter((_, j) => j !== i));
  const setNote    = (i: number, val: string) =>
    setNotes(prev => prev.map((n, j) => (j === i ? val : n)));

  const buildPayload = () => ({
    version:     version.trim(),
    versionType,
    title:       title.trim(),
    notes:       notes.filter(n => n.trim()),
  });

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (!version.trim()) { toast({ title: "Version required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (isNew) {
        await releasesApi.create(buildPayload());
      } else {
        await releasesApi.update(release!.id, buildPayload());
      }
      qc.invalidateQueries({ queryKey: ["releases"] });
      toast({ title: isNew ? "Draft created" : "Release updated" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!release) return;
    if (!confirm(`Publish v${release.version}? This will push to GitHub and cannot be undone.`)) return;
    setPublishing(true);
    try {
      await releasesApi.publish(release.id);
      qc.invalidateQueries({ queryKey: ["releases"] });
      toast({ title: `v${release.version} published!` });
      onSaved();
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!release) return;
    if (!confirm(`Delete draft v${release.version}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await releasesApi.delete(release.id);
      qc.invalidateQueries({ queryKey: ["releases"] });
      toast({ title: "Draft deleted" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C87560]";
  const inputStyle = { borderColor: BORDER, background: "white" };
  const labelCls = `${EYEBROW} block mb-1.5`;

  const busy = saving || publishing || deleting;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "rgba(27,42,74,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ml-auto h-full w-full max-w-lg flex flex-col shadow-2xl overflow-hidden"
        style={{ background: PAPER }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: BORDER }}>
          <div>
            <p className={`${EYEBROW} text-[10px]`} style={{ color: CLAY }}>Platform Release</p>
            <h2 className="text-base font-semibold mt-0.5" style={{ color: INK }}>
              {isNew ? "New draft release" : `Edit · v${release.version}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-sm p-1" style={{ color: MUTED }}><X className="w-4 h-4" /></button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Version + type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: MUTED }}>Version</label>
              <input
                className={inputCls}
                style={inputStyle}
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
            <div>
              <label className={labelCls} style={{ color: MUTED }}>Type</label>
              <div className="flex flex-col gap-1.5 mt-1">
                {(["major", "minor", "bugfix"] as const).map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: INK }}>
                    <input
                      type="radio"
                      name="versionType"
                      value={t}
                      checked={versionType === t}
                      onChange={() => setVersionType(t)}
                    />
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={typeStyle(t)}
                    >
                      {typeLabel(t)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className={labelCls} style={{ color: MUTED }}>Title</label>
            <input
              className={inputCls}
              style={inputStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Planner Studio rewrite"
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls} style={{ color: MUTED }}>Release notes</label>
            <div className="space-y-2">
              {notes.map((note, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full shrink-0 mt-0.5" style={{ background: MUTED }} />
                  <input
                    className={`${inputCls} flex-1`}
                    style={inputStyle}
                    value={note}
                    onChange={e => setNote(i, e.target.value)}
                    placeholder="Describe a change…"
                  />
                  {notes.length > 1 && (
                    <button
                      onClick={() => removeNote(i)}
                      className="p-1 text-sm"
                      style={{ color: MUTED }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addNote}
              className="mt-2 text-xs font-medium flex items-center gap-1"
              style={{ color: CLAY }}
            >
              <Plus className="w-3 h-3" /> Add note
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 space-y-2" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ background: INK }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving…" : isNew ? "Save draft" : "Save changes"}
            </button>

            {!isNew && !release.isPublished && (
              <button
                onClick={handlePublish}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: CLAY }}
              >
                {publishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {publishing ? "Publishing…" : "Publish & Push to GitHub"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-1.5 rounded-lg text-sm border"
              style={{ borderColor: BORDER, color: MUTED }}
            >
              Cancel
            </button>

            {!isNew && !release.isPublished && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-4 py-1.5 rounded-lg text-sm border flex items-center gap-1.5 disabled:opacity-50"
                style={{ borderColor: "hsl(0 70% 88%)", color: "hsl(0 55% 45%)" }}
              >
                <Trash2 className="w-3 h-3" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Date group heading ─────────────────────────────────────────────────────────
function dateGroupKey(release: ReleaseWithNotes): string {
  if (!release.releaseDate) return "Draft";
  const d = new Date(release.releaseDate);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReleasesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReleaseWithNotes | null>(null);
  const [publishTarget, setPublishTarget] = useState<ReleaseWithNotes | null>(null);

  const { data: releases = [], isLoading } = useQuery<ReleaseWithNotes[]>({
    queryKey: ["releases"],
    queryFn: () => releasesApi.list(),
  });

  const latest = latestVersion(releases);

  // Group releases by date string
  const groups: { label: string; items: ReleaseWithNotes[] }[] = [];
  const seen = new Set<string>();
  for (const r of releases) {
    const key = dateGroupKey(r);
    if (!seen.has(key)) {
      seen.add(key);
      groups.push({ label: key, items: [] });
    }
    groups[groups.length - 1].items.push(r);
  }

  const openNew = () => {
    setEditTarget(null);
    setDrawerOpen(true);
  };
  const openEdit = (r: ReleaseWithNotes) => {
    setEditTarget(r);
    setDrawerOpen(true);
  };
  const openPublish = (r: ReleaseWithNotes) => {
    setEditTarget(r);
    setPublishTarget(r);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditTarget(null);
    setPublishTarget(null);
  };

  // Suggested next version defaults to minor bump of latest
  const suggestedVersion = bumpVersion(latest, "minor");

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className={`${EYEBROW} text-[10px]`} style={{ color: CLAY }}>Platform · Super Admin</p>
          <h1 className="text-xl font-bold font-display mt-1" style={{ color: INK }}>Releases</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            Platform version history and release notes.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
          style={{ background: INK }}
        >
          <Plus className="w-4 h-4" /> New Release
        </button>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border animate-pulse" style={{ borderColor: BORDER, background: "white" }} />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <div
          className="rounded-xl border px-8 py-12 text-center"
          style={{ borderColor: BORDER, background: "white" }}
        >
          <Tag className="w-8 h-8 mx-auto mb-3" style={{ color: MUTED }} />
          <p className="font-semibold text-sm" style={{ color: INK }}>No releases yet</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>Create your first release to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              {/* Date heading */}
              <div className="flex items-center gap-3 mb-3">
                <span className={`${EYEBROW} text-[10px]`} style={{ color: MUTED }}>
                  {group.label}
                </span>
                <div className="flex-1 h-px" style={{ background: BORDER }} />
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {group.items.map(r => (
                  <ReleaseCard
                    key={r.id}
                    release={r}
                    onEdit={openEdit}
                    onPublish={openPublish}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <ReleaseDrawer
          release={editTarget}
          suggestedVersion={suggestedVersion}
          onClose={closeDrawer}
          onSaved={closeDrawer}
        />
      )}
    </div>
  );
}
