import { useGetSyncStatus, usePullCalendarEvents, usePushPlannerToCalendar, useSyncGoogleTasks, usePushNotesToDocs, useDriveBackup, getGetSyncStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Calendar, CheckSquare, FileText, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function SyncDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: status, isLoading } = useGetSyncStatus();
  
  const pullEvents = usePullCalendarEvents();
  const pushPlanner = usePushPlannerToCalendar();
  const syncTasks = useSyncGoogleTasks();
  const pushNotes = usePushNotesToDocs();
  const backupDrive = useDriveBackup();

  const handleSync = (mutation: any, name: string) => {
    mutation.mutate({ data: {} }, {
      onSuccess: (res: any) => {
        toast({ title: `${name} Successful`, description: res?.message || 'Sync completed.' });
        queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: `${name} Failed`, description: err.message, variant: 'destructive' });
      }
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!status) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Google Sync</h1>
          <p className="text-muted-foreground mt-1">Manage Workspace integrations and system backups.</p>
        </div>
        <Badge variant={status.connected ? 'default' : 'destructive'} className="text-sm py-1 px-3">
          {status.connected ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Connected</> : <><AlertCircle className="w-4 h-4 mr-2" /> Disconnected</>}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SyncCard 
          title="Google Calendar" 
          icon={Calendar} 
          description="Sync planner schedules with Calendar."
          lastSync={status.calendarLastSynced}
          isLoading={pullEvents.isPending || pushPlanner.isPending}
          actions={[
            { label: 'Pull Events', onClick: () => handleSync(pullEvents, 'Pull Events') },
            { label: 'Push Planner', onClick: () => handleSync(pushPlanner, 'Push Planner') }
          ]}
        />
        
        <SyncCard 
          title="Google Tasks" 
          icon={CheckSquare} 
          description="Two-way sync for to-do items."
          lastSync={status.tasksLastSynced}
          isLoading={syncTasks.isPending}
          actions={[
            { label: 'Sync Tasks', onClick: () => handleSync(syncTasks, 'Task Sync') }
          ]}
        />
        
        <SyncCard 
          title="Google Docs" 
          icon={FileText} 
          description="Export meeting notes and journals."
          lastSync={status.docsLastSynced}
          isLoading={pushNotes.isPending}
          actions={[
            { label: 'Push Notes', onClick: () => handleSync(pushNotes, 'Push Notes') }
          ]}
        />
        
        <SyncCard 
          title="Google Drive" 
          icon={HardDrive} 
          description={`Backup PDFs. Folder: ${status.driveFolder || 'Not set'}`}
          lastSync={status.driveLastSynced}
          isLoading={backupDrive.isPending}
          actions={[
            { label: 'Backup Assets', onClick: () => handleSync(backupDrive, 'Drive Backup') }
          ]}
        />
      </div>
    </div>
  );
}

function SyncCard({ title, icon: Icon, description, lastSync, isLoading, actions }: any) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="w-5 h-5 text-primary" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 flex flex-col justify-between h-[120px]">
        <div className="text-sm">
          <span className="text-muted-foreground">Last synced: </span>
          <span className="font-medium">{lastSync ? formatDistanceToNow(new Date(lastSync), { addSuffix: true }) : 'Never'}</span>
        </div>
        <div className="flex gap-2 mt-auto">
          {actions.map((action: any, i: number) => (
            <Button key={i} variant={i === 0 ? "default" : "outline"} className="flex-1" onClick={action.onClick} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}