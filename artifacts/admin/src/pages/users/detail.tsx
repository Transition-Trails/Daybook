import { useRoute, useParams, Link } from 'wouter';
import { useGetUser, useGetUserPurchases, getGetUserQueryKey, getGetUserPurchasesQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function UserDetail() {
  const params = useParams();
  const id = parseInt(params.id!);

  const { data: user, isLoading: isUserLoading } = useGetUser(id, { query: { enabled: !!id, queryKey: getGetUserQueryKey(id) } });
  const { data: purchases, isLoading: isPurchasesLoading } = useGetUserPurchases(id, { query: { enabled: !!id, queryKey: getGetUserPurchasesQueryKey(id) } });

  if (isUserLoading || isPurchasesLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) return <div className="text-center py-12">User not found.</div>;

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
              <span className="text-muted-foreground">Plan ID</span>
              <span className="font-mono">{user.planId || 'None'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owned Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Editions</span>
              <Badge>{purchases?.editionIds.length || 0}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Themes</span>
              <Badge>{purchases?.themeIds.length || 0}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Packs</span>
              <Badge>{purchases?.stickerPackIds.length || 0}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Inserts</span>
              <Badge>{purchases?.insertIds.length || 0}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}