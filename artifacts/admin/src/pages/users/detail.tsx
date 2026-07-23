import { useParams, Link } from 'wouter';
import { useGetUser, getGetUserQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function UserDetail() {
  const params = useParams();
  const id = params.id!;

  const { data: userData, isLoading } = useGetUser(id as any, { query: { enabled: !!id, queryKey: getGetUserQueryKey(id as any) } });
  const user = userData as any;

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) return <div className="text-center py-12">User not found.</div>;

  const owned: string[] = user.owned || [];
  const ownedEditions = owned.filter((id: string) => id.startsWith('e-') || id.startsWith('e'));
  const ownedThemes = owned.filter((id: string) => id.startsWith('t-') || id.startsWith('t'));
  const ownedPacks = owned.filter((id: string) => id.startsWith('p-') || id.startsWith('p'));
  const ownedInserts = owned.filter((id: string) => id.startsWith('i-') || id.startsWith('i'));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/users"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full border shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 text-lg font-bold">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className="capitalize">{user.role}</Badge>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Joined</span>
              <span className="font-mono">{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-mono capitalize">{user.plan || 'Free'}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">AI Enabled</span>
              <Badge variant={user.aiEnabled ? 'default' : 'secondary'}>{user.aiEnabled ? 'Yes' : 'No'}</Badge>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">AI Provider</span>
              <span className="font-mono capitalize">{user.aiProvider || 'claude'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owned Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">All Owned</span>
              <Badge>{owned.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Editions</span>
              <Badge>{ownedEditions.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Themes</span>
              <Badge>{ownedThemes.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Packs</span>
              <Badge>{ownedPacks.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Inserts</span>
              <Badge>{ownedInserts.length}</Badge>
            </div>
            {owned.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {owned.map((itemId: string) => (
                  <Badge key={itemId} variant="outline" className="text-xs font-mono">{itemId}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
