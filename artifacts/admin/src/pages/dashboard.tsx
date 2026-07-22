import { useGetAdminStats } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Palette, Sticker, FileImage, Package2, BookOpen, Crown, Users, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of catalog and system performance.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Themes" value={stats.themes.total} live={stats.themes.live} draft={stats.themes.draft} icon={Palette} href="/catalog/themes" />
        <StatCard title="Sticker Packs" value={stats.stickerPacks.total} live={stats.stickerPacks.live} draft={stats.stickerPacks.draft} icon={Sticker} href="/catalog/packs" />
        <StatCard title="Inserts" value={stats.inserts.total} live={stats.inserts.live} draft={stats.inserts.draft} icon={FileImage} href="/catalog/inserts" />
        <StatCard title="Products" value={stats.products.total} live={stats.products.live} draft={stats.products.draft} icon={Package2} href="/catalog/products" />
        <StatCard title="Editions" value={stats.editions.total} live={stats.editions.live} draft={stats.editions.draft} icon={BookOpen} href="/editions" />
        <StatCard title="Plans" value={stats.plans.total} live={stats.plans.live} draft={stats.plans.draft} icon={Crown} href="/plans" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium">Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats.users.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.users.staff} Staff • {stats.users.owner} Owner
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium">AI Generations</CardTitle>
            <Sparkles className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats.generations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.generations.thisMonth} this month • {stats.generations.failed} failed
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="flex gap-4">
        <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Link href="/catalog/themes/new">Create Theme</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/editions/new">Create Edition</Link>
        </Button>
        <Button asChild variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100">
          <Link href="/trends">Research Trends</Link>
        </Button>
      </div>
    </div>
  );
}

function StatCard({ title, value, live, draft, icon: Icon, href }: any) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{title}</CardTitle>
          <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono">{value}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {live} live</span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {draft} draft</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}