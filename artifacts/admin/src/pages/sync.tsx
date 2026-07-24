import { useState } from 'react';
import {
  useGetSyncStatus, usePushPlannerToCalendar, useDriveBackup,
  getGetSyncStatusQueryKey,
} from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Calendar, CheckSquare, FileText, HardDrive,
  CheckCircle2, AlertCircle, Plus, Trash2, ExternalLink, Check,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { GoogleReconnectBanner } from '@/components/GoogleReconnectBanner';

// ── Types ─────────────────────────────────────────────────────────────────────

type GoogleTask = {
  googleTaskId: string;
  title: string;
  notes: string | null;
  completed: boolean;
  dueDate: string | null;
};

type GoogleDoc = {
  id: string;
  noteKey: string;
  title: string;
  docId: string;
  docUrl: string;
  createdAt: string;
};

type CalendarPush = {
  id: string;
  localBlockKey: string;
  eventTitle: string;
  startDate: string;
  endDate: string;
  pushedAt: string;
};

// ── Reconnect check ───────────────────────────────────────────────────────────

function isReconnectRequired(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = (err as { status?: number }).status;
  if (status !== 401) return false;
  const data = (err as { data?: unknown }).data;
  return typeof data === 'object' && data !== null &&
    (data as Record<string, unknown>).error === 'reconnect_required';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SyncDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading, error: statusError } = useGetSyncStatus();

  const pushPlanner = usePushPlannerToCalendar();
  const backupDrive = useDriveBackup();

  const needsReconnect = isReconnectRequired(statusError);
  const tokenExpired   = (status as unknown as Record<string, unknown>)?.tokenExpired === true;
  const disconnected   = !status?.connected || tokenExpired;

  const invalidateStatus = () => queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <GoogleReconnectBanner visible={needsReconnect || tokenExpired} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Google Sync</h1>
          <p className="text-muted-foreground mt-1">Manage Workspace integrations and system backups.</p>
        </div>
        <Badge
          variant={status?.connected && !tokenExpired ? 'default' : 'destructive'}
          className="text-sm py-1 px-3"
        >
          {status?.connected && !tokenExpired
            ? <><CheckCircle2 className="w-4 h-4 mr-2" />Connected</>
            : <><AlertCircle   className="w-4 h-4 mr-2" />{tokenExpired ? 'Token expired' : 'Disconnected'}</>}
        </Badge>
      </div>

      {/* Not-connected empty state */}
      {!status?.connected && (
        <div className="flex flex-col items-center justify-center py-20 border border-border rounded-xl bg-card text-center">
          <div className="flex gap-3 mb-4 text-muted-foreground/40">
            <Calendar className="w-8 h-8" />
            <CheckSquare className="w-8 h-8" />
            <FileText className="w-8 h-8" />
          </div>
          <p className="font-semibold text-lg">Connect Google Workspace</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            Sign in with Google to sync Calendar events, Tasks, and create Google Docs from your notes.
          </p>
          <Button onClick={() => { window.location.href = '/api/auth/google'; }}>
            Connect Google
          </Button>
        </div>
      )}

      {status?.connected && (
        <div className="grid grid-cols-1 gap-6">
          {/* Calendar card */}
          <CalendarPushCard
            lastSync={status.calendarLastSynced}
            disabled={disconnected}
            onInvalidate={invalidateStatus}
          />

          {/* Tasks card */}
          <TasksCard
            lastSync={status.tasksLastSynced}
            disabled={disconnected}
            onInvalidate={invalidateStatus}
          />

          {/* Docs card */}
          <DocsCard
            lastSync={status.docsLastSynced}
            disabled={disconnected}
            onInvalidate={invalidateStatus}
          />

          {/* Drive backup card */}
          <Card className={disconnected ? 'opacity-60' : ''}>
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="w-5 h-5 text-primary" /> Google Drive Backup
              </CardTitle>
              <CardDescription>
                {status.driveFolder
                  ? `Daybook folder: ${status.driveFolder}`
                  : 'Backup PDFs and planner configs to your Drive.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex items-center justify-between">
              <LastSynced ts={status.driveLastSynced} />
              <Button
                variant="outline"
                disabled={backupDrive.isPending || disconnected}
                onClick={() => {
                  backupDrive.mutate(undefined, {
                    onSuccess: () => {
                      toast({ title: 'Drive backup complete' });
                      invalidateStatus();
                    },
                    onError: (err) => {
                      if (!isReconnectRequired(err)) {
                        toast({ title: 'Backup failed', description: String(err), variant: 'destructive' });
                      } else {
                        invalidateStatus();
                      }
                    },
                  });
                }}
              >
                {backupDrive.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <RefreshCw className="w-4 h-4 mr-2" />}
                Backup Now
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Last-synced helper ────────────────────────────────────────────────────────

function LastSynced({ ts }: { ts?: string | null }) {
  if (!ts) return <span className="text-sm text-muted-foreground">Never synced</span>;
  return (
    <span className="text-sm text-muted-foreground">
      Last synced{' '}
      <span className="font-medium text-foreground">
        {formatDistanceToNow(new Date(ts), { addSuffix: true })}
      </span>
    </span>
  );
}

// ── Calendar Push Card ────────────────────────────────────────────────────────

function CalendarPushCard({
  lastSync, disabled, onInvalidate,
}: { lastSync?: string | null; disabled: boolean; onInvalidate: () => void }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: pushData, refetch: refetchPushes, isFetching } = useQuery({
    queryKey: ['calendar-pushes'],
    queryFn: () => customFetch<{ pushes: CalendarPush[] }>('/api/sync/calendar/pushes'),
    staleTime: 60_000,
  });
  const pushes = pushData?.pushes ?? [];

  const pushMutation = useMutation({
    mutationFn: (blocks: { title: string; startDate: string; endDate: string }[]) =>
      customFetch<{ success: boolean; itemCount: number; syncedAt: string }>('/api/sync/calendar/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannerConfigId: 'manual', blocks }),
      }),
    onSuccess: (data) => {
      toast({ title: `${data.itemCount} event${data.itemCount !== 1 ? 's' : ''} pushed to Google Calendar` });
      setShowForm(false);
      setTitle(''); setStartDate(''); setEndDate('');
      refetchPushes();
      onInvalidate();
    },
    onError: (err) => {
      if (!isReconnectRequired(err)) {
        toast({ title: 'Push failed', description: String(err), variant: 'destructive' });
      } else {
        onInvalidate();
      }
    },
  });

  const handlePush = () => {
    if (!title.trim() || !startDate || !endDate) return;
    pushMutation.mutate([{ title: title.trim(), startDate, endDate }]);
  };

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-primary" /> Google Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <LastSynced ts={lastSync} />
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4 mr-1" /> Push Event
            </Button>
          </div>
        </div>
        <CardDescription>Push planner events to Google Calendar. Previously pushed events are updated, not duplicated.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Push form */}
        {showForm && (
          <div className="mb-4 p-4 border border-border rounded-lg bg-muted/30 space-y-3">
            <p className="text-sm font-medium">New calendar event</p>
            <div className="space-y-2">
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!title.trim() || !startDate || !endDate || pushMutation.isPending}
                onClick={handlePush}
              >
                {pushMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Push to Calendar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Pushed events list */}
        {isFetching && pushes.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {!isFetching && pushes.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground/60">
            <Calendar className="w-6 h-6 mb-1.5" />
            <p className="text-sm">No events pushed yet</p>
          </div>
        )}
        {pushes.length > 0 && (
          <ul className="space-y-2">
            {pushes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-muted/30 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="font-medium truncate">{p.eventTitle}</span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    {p.startDate} → {p.endDate}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  synced {formatDistanceToNow(new Date(p.pushedAt), { addSuffix: true })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tasks Card ────────────────────────────────────────────────────────────────

function TasksCard({
  lastSync, disabled, onInvalidate,
}: { lastSync?: string | null; disabled: boolean; onInvalidate: () => void }) {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');

  const {
    data: tasksData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['google-tasks'],
    queryFn: () => customFetch<{ tasks: GoogleTask[]; syncedAt: string }>('/api/sync/tasks'),
    staleTime: 60_000,
    enabled: !disabled,
  });
  const tasks = tasksData?.tasks ?? [];

  const createMutation = useMutation({
    mutationFn: (body: { title: string; dueDate?: string }) =>
      customFetch<GoogleTask>('/api/sync/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setNewTitle(''); setNewDue('');
      refetch();
      onInvalidate();
    },
    onError: (err) => {
      if (!isReconnectRequired(err)) {
        toast({ title: 'Could not create task', description: String(err), variant: 'destructive' });
      } else {
        onInvalidate();
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ googleTaskId, completed }: { googleTaskId: string; completed: boolean }) =>
      customFetch(`/api/sync/tasks/${encodeURIComponent(googleTaskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      }),
    onSuccess: () => { refetch(); onInvalidate(); },
    onError: (err) => {
      if (!isReconnectRequired(err)) {
        toast({ title: 'Could not update task', description: String(err), variant: 'destructive' });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (googleTaskId: string) =>
      customFetch(`/api/sync/tasks/${encodeURIComponent(googleTaskId)}`, { method: 'DELETE' }),
    onSuccess: () => { refetch(); onInvalidate(); },
    onError: (err) => {
      if (!isReconnectRequired(err)) {
        toast({ title: 'Could not delete task', description: String(err), variant: 'destructive' });
      }
    },
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim(), dueDate: newDue || undefined });
  };

  const activeTasks    = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckSquare className="w-5 h-5 text-primary" /> Google Tasks
          </CardTitle>
          <div className="flex items-center gap-2">
            <LastSynced ts={lastSync} />
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching || disabled}
              onClick={() => { refetch(); onInvalidate(); }}
            >
              {isFetching
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <RefreshCw className="w-4 h-4 mr-1" />}
              Sync
            </Button>
          </div>
        </div>
        <CardDescription>Two-way sync with your default Google Tasks list. Changes you make here are written back to Google immediately.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* New task input */}
        <div className="flex gap-2">
          <Input
            placeholder="New task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            disabled={disabled}
          />
          <Input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className="w-36"
            disabled={disabled}
          />
          <Button
            size="sm"
            disabled={!newTitle.trim() || createMutation.isPending || disabled}
            onClick={handleCreate}
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* Task list */}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Fetching tasks from Google…
          </div>
        )}
        {!isLoading && tasks.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground/60">
            <CheckSquare className="w-6 h-6 mb-1.5" />
            <p className="text-sm">No tasks found — add one above or sync to pull from Google</p>
          </div>
        )}

        {activeTasks.length > 0 && (
          <ul className="space-y-1">
            {activeTasks.map((task) => (
              <TaskRow
                key={task.googleTaskId}
                task={task}
                onToggle={() => toggleMutation.mutate({ googleTaskId: task.googleTaskId, completed: true })}
                onDelete={() => deleteMutation.mutate(task.googleTaskId)}
                busy={toggleMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </ul>
        )}

        {completedTasks.length > 0 && (
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">
              {completedTasks.length} completed
            </summary>
            <ul className="mt-1 space-y-1 opacity-60">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.googleTaskId}
                  task={task}
                  onToggle={() => toggleMutation.mutate({ googleTaskId: task.googleTaskId, completed: false })}
                  onDelete={() => deleteMutation.mutate(task.googleTaskId)}
                  busy={toggleMutation.isPending || deleteMutation.isPending}
                />
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task, onToggle, onDelete, busy,
}: { task: GoogleTask; onToggle: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <li className="flex items-center gap-2 group px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors">
      <button
        onClick={onToggle}
        disabled={busy}
        className={[
          'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
          task.completed
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border hover:border-primary',
        ].join(' ')}
      >
        {task.completed && <Check className="w-2.5 h-2.5" />}
      </button>
      <span className={['text-sm flex-1 min-w-0 truncate', task.completed ? 'line-through text-muted-foreground' : ''].join(' ')}>
        {task.title}
      </span>
      {task.dueDate && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {format(new Date(task.dueDate + 'T00:00:00'), 'MMM d')}
        </span>
      )}
      <button
        onClick={onDelete}
        disabled={busy}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

// ── Docs Card ─────────────────────────────────────────────────────────────────

function DocsCard({
  lastSync, disabled, onInvalidate,
}: { lastSync?: string | null; disabled: boolean; onInvalidate: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');

  const { data: docsData, isLoading, refetch } = useQuery({
    queryKey: ['google-docs'],
    queryFn: () => customFetch<{ docs: GoogleDoc[] }>('/api/sync/docs'),
    staleTime: 60_000,
    enabled: !disabled,
  });
  const docs = docsData?.docs ?? [];

  const createMutation = useMutation({
    mutationFn: (body: { title: string; content: string; noteKey: string }) =>
      customFetch<{ success: boolean; docId: string; docUrl: string; existing: boolean }>('/api/sync/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast({
        title: data.existing ? 'Doc already exists' : 'Google Doc created',
        description: (
          <a href={data.docUrl} target="_blank" rel="noreferrer" className="underline">
            Open in Google Docs
          </a>
        ),
      });
      setOpen(false);
      setDocTitle(''); setDocContent('');
      refetch();
      onInvalidate();
    },
    onError: (err) => {
      if (!isReconnectRequired(err)) {
        toast({ title: 'Doc creation failed', description: String(err), variant: 'destructive' });
      } else {
        onInvalidate();
      }
    },
  });

  const handleCreate = () => {
    if (!docTitle.trim() || !docContent.trim()) return;
    createMutation.mutate({
      title:   docTitle.trim(),
      content: docContent.trim(),
      noteKey: `${docTitle.trim()}|${Date.now()}`,
    });
  };

  return (
    <>
      <Card className={disabled ? 'opacity-60' : ''}>
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-primary" /> Google Docs
            </CardTitle>
            <div className="flex items-center gap-2">
              <LastSynced ts={lastSync} />
              <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Create Doc
              </Button>
            </div>
          </div>
          <CardDescription>Convert notes and brain-dumps into Google Docs stored in your Daybook Drive folder.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading docs…
            </div>
          )}
          {!isLoading && docs.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center text-muted-foreground/60">
              <FileText className="w-6 h-6 mb-1.5" />
              <p className="text-sm">No docs created yet — click Create Doc to export a note</p>
            </div>
          )}
          {docs.length > 0 && (
            <ul className="space-y-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Created {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <a
                    href={doc.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Create Doc dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Google Doc</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Meeting notes, brain dump…"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                placeholder="Write your note here. It will be imported as plain text into a new Google Doc."
                className="min-h-[140px] resize-none"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!docTitle.trim() || !docContent.trim() || createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create Doc
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
