import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAiUsageSummary,
  useListAiProviderConfigs,
  useListAiUsage,
  useUpdateAiProviderConfig,
  useTestAiProviderConfig,
  useRemoveAiProviderConfig,
  getGetAiUsageSummaryQueryKey,
  getListAiProviderConfigsQueryKey,
  getListAiUsageQueryKey,
  AiProviderConfigProvider,
  AiProviderConfig,
} from '@workspace/api-client-react';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

import {
  Loader2, Settings2, Activity, AlertCircle, DollarSign,
  Key, Save, Trash2, CheckCircle2, XCircle, RotateCw, Plus, Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Anthropic Claude',
  chatgpt: 'OpenAI ChatGPT',
  gemini: 'Google Gemini',
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'bg-orange-100 text-orange-800 border-orange-200',
  chatgpt: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  gemini: 'bg-blue-100 text-blue-800 border-blue-200',
};

const COST_UNAVAILABLE_LABELS = {
  missing_pricing: {
    label: 'Pricing missing',
    description: 'No active price is configured for this model.',
  },
  missing_usage: {
    label: 'Usage missing',
    description: 'The provider did not return the token usage needed to estimate cost.',
  },
  duplicate: {
    label: 'Not billable',
    description: 'A duplicate request was blocked before another provider call was made.',
  },
  failed_cost_unknown: {
    label: 'Failed — cost unknown',
    description: 'The call failed, and provider billing could not be confirmed.',
  },
  estimate_not_recorded: {
    label: 'Estimate not recorded',
    description: 'This older call has no recorded estimate reason.',
  },
} as const;

interface AiSettingsProps {
  storeId?: string;
}

interface EditingProvider {
  provider: AiProviderConfigProvider;
  enabled: boolean;
  hasCredential?: boolean;
  allowPlatformFallback: boolean;
  credential?: string;
  allowedModels?: string;
  requestsPerDay?: number | '';
  estimatedDollarsPerMonth?: number | '';
}

export default function AiSettingsPage({ storeId }: AiSettingsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isPlatform = !storeId;

  // --- Data Fetching ---
  const { data: summary, isLoading: isLoadingSummary, isError: isErrorSummary } = useGetAiUsageSummary(
    storeId ? { storeId } : {},
    { query: { queryKey: getGetAiUsageSummaryQueryKey(storeId ? { storeId } : {}) } }
  );

  const { data: configs, isLoading: isLoadingConfigs, isError: isErrorConfigs } = useListAiProviderConfigs(
    storeId ? { storeId } : {},
    { query: { queryKey: getListAiProviderConfigsQueryKey(storeId ? { storeId } : {}) } }
  );

  const { data: usageList, isLoading: isLoadingUsage, isError: isErrorUsage } = useListAiUsage(
    storeId ? { storeId, limit: 100 } : { limit: 100 },
    { query: { queryKey: getListAiUsageQueryKey(storeId ? { storeId, limit: 100 } : { limit: 100 }) } }
  );

  // --- Derived State ---
  const records = usageList?.records || [];

  const duplicateCount = useMemo(() => {
    return records.filter(r => r.status === 'duplicate').length;
  }, [records]);

  const failureCount = useMemo(() => {
    return records.filter(r => r.status === 'error' || r.status === 'failed' || !!r.errorCategory).length;
  }, [records]);

  // Rankings
  const topFeatures = useMemo(() => {
    const counts = records.reduce((acc, r) => {
      acc[r.feature] = (acc[r.feature] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [records]);

  // --- Mutations ---
  const updateConfig = useUpdateAiProviderConfig();
  const testConfig = useTestAiProviderConfig();
  const removeConfig = useRemoveAiProviderConfig();

  // --- UI State ---
  const [editingProvider, setEditingProvider] = useState<EditingProvider | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterFeature, setFilterFeature] = useState<string>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');

  const handleOpenDialog = (config?: AiProviderConfig) => {
    if (config) {
      setEditingProvider({
        provider: config.provider as AiProviderConfigProvider,
        enabled: config.enabled,
        hasCredential: config.hasCredential,
        allowPlatformFallback: config.allowPlatformFallback,
        credential: '', // Write-only
        allowedModels: config.allowedModels?.join(', ') || '',
        requestsPerDay: config.requestsPerDay ?? '',
        estimatedDollarsPerMonth: config.estimatedCentsPerMonth ? config.estimatedCentsPerMonth / 100 : '',
      });
    } else {
      setEditingProvider({
        provider: 'claude',
        enabled: true,
        allowPlatformFallback: true,
        credential: '',
        allowedModels: '',
        requestsPerDay: '',
        estimatedDollarsPerMonth: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSaveConfig = () => {
    if (!editingProvider) return;

    let allowedModelsArr: string[] | undefined;
    if (editingProvider.allowedModels && editingProvider.allowedModels.trim()) {
      allowedModelsArr = editingProvider.allowedModels.split(',').map(s => s.trim()).filter(Boolean);
    }

    const requestsPerDay = typeof editingProvider.requestsPerDay === 'number' ? editingProvider.requestsPerDay : undefined;
    const estimatedCentsPerMonth = typeof editingProvider.estimatedDollarsPerMonth === 'number'
      ? Math.round(editingProvider.estimatedDollarsPerMonth * 100)
      : undefined;

    updateConfig.mutate({
      data: {
        provider: editingProvider.provider as AiProviderConfigProvider,
        enabled: editingProvider.enabled,
        allowPlatformFallback: editingProvider.allowPlatformFallback,
        credential: editingProvider.credential || undefined,
        allowedModels: allowedModelsArr,
        requestsPerDay,
        estimatedCentsPerMonth,
        storeId,
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Provider saved successfully' });
        setIsDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getListAiProviderConfigsQueryKey(storeId ? { storeId } : {}) });
      },
      onError: (err: any) => {
        toast({ title: 'Failed to save provider', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleTestProvider = (provider: AiProviderConfigProvider) => {
    testConfig.mutate({
      data: { provider, storeId }
    }, {
      onSuccess: (res) => {
        if (res.ok) {
          toast({ title: 'Test successful', description: `Successfully connected to ${PROVIDER_LABELS[provider] || provider}` });
        } else {
          toast({ title: 'Test failed', description: res.error || 'Unknown error', variant: 'destructive' });
        }
      },
      onError: (err: any) => {
        toast({ title: 'Test request failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleRemoveProvider = (provider: AiProviderConfigProvider) => {
    if (!confirm('Are you sure you want to remove this provider configuration?')) return;
    removeConfig.mutate({
      params: { provider, storeId }
    }, {
      onSuccess: () => {
        toast({ title: 'Provider removed' });
        queryClient.invalidateQueries({ queryKey: getListAiProviderConfigsQueryKey(storeId ? { storeId } : {}) });
      },
      onError: (err: any) => {
        toast({ title: 'Failed to remove provider', description: err.message, variant: 'destructive' });
      }
    });
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterFeature !== 'all' && r.feature !== filterFeature) return false;
      if (filterProvider !== 'all' && r.provider !== filterProvider) return false;
      return true;
    });
  }, [records, filterFeature, filterProvider]);

  const allFeatures = useMemo(() => Array.from(new Set(records.map(r => r.feature))), [records]);
  const allProviders = useMemo(() => Array.from(new Set(records.map(r => r.provider))), [records]);

  if (isLoadingSummary || isLoadingConfigs || isLoadingUsage) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasError = isErrorSummary || isErrorConfigs || isErrorUsage;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">AI Control Plane</h1>
        <p className="text-muted-foreground mt-1">
          {isPlatform
            ? 'Manage platform-wide AI credentials, monitor usage, and track spend.'
            : 'Configure your own AI credentials and monitor your store\'s usage.'}
        </p>
      </div>

      {hasError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md flex items-start gap-3 border border-red-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load AI metrics or configuration</h3>
            <p className="text-sm mt-1">Please try reloading the page or check your connection.</p>
          </div>
        </div>
      )}

      {/* --- OVERVIEW --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.requestCount.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Estimated Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((summary?.estimatedCostCents || 0) / 100).toFixed(4)}
            </div>
            {!!summary?.successfulCallsWithoutCostEstimate && (
              <p className="text-xs text-amber-700 mt-1">
                Excludes {summary.successfulCallsWithoutCostEstimate.toLocaleString()} successful {summary.successfulCallsWithoutCostEstimate === 1 ? 'call' : 'calls'} without an estimate
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Failed Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failureCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of last {records.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Copy className="w-4 h-4" /> Duplicates Caught
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{duplicateCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Prevented extra spend</p>
          </CardContent>
        </Card>
      </div>

      {/* --- CONFIGURATION --- */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" /> Active Providers
            </CardTitle>
            <CardDescription className="mt-1">
              {isPlatform
                ? 'Platform fallback credentials used when stores do not provide their own.'
                : 'Your private credentials. Uncheck "Allow platform fallback" to strictly enforce these.'}
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} variant="secondary" size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add Provider
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {(!configs || configs.length === 0) ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No AI providers configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credential</TableHead>
                  {!isPlatform && <TableHead>Fallback</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.provider}>
                    <TableCell className="font-medium">
                      <span className={cn("px-2 py-1 rounded text-xs font-semibold border", PROVIDER_COLORS[config.provider] || 'bg-gray-100 text-gray-800')}>
                        {PROVIDER_LABELS[config.provider] || config.provider}
                      </span>
                    </TableCell>
                    <TableCell>
                      {config.enabled ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Enabled</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600"><XCircle className="w-3 h-3 mr-1" /> Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.hasCredential ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-mono">{config.maskedCredential || '••••••••'}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-red-500 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Missing</span>
                      )}
                    </TableCell>
                    {!isPlatform && (
                      <TableCell>
                        {config.allowPlatformFallback ? (
                          <span className="text-sm text-muted-foreground">Allowed</span>
                        ) : (
                          <span className="text-sm font-medium">Strictly owned</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleTestProvider(config.provider as AiProviderConfigProvider)} disabled={!config.hasCredential || testConfig.isPending}>
                          <RotateCw className={cn("w-4 h-4", testConfig.isPending && "animate-spin")} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(config)}>
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveProvider(config.provider as AiProviderConfigProvider)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* --- USAGE LOGS & RANKINGS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="shadow-sm h-full">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" /> Recent Activity
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={filterProvider} onValueChange={setFilterProvider}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="All Providers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      {allProviders.map(p => <SelectItem key={p} value={p}>{PROVIDER_LABELS[p] || p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterFeature} onValueChange={setFilterFeature}>
                    <SelectTrigger className="w-[150px] h-8 text-xs">
                      <SelectValue placeholder="All Features" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Features</SelectItem>
                      {allFeatures.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredRecords.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No recent usage found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Feature</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.slice(0, 50).map((record) => (
                        <TableRow key={record.requestId}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {record.feature}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className={cn("text-xs font-semibold",
                                record.provider === 'claude' ? 'text-orange-700' :
                                record.provider === 'chatgpt' ? 'text-emerald-700' : 'text-blue-700'
                              )}>
                                {PROVIDER_LABELS[record.provider]?.split(' ')[1] || record.provider}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">{record.model || 'auto'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              {record.fundingSource}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {record.status === 'success' ? (
                              <span className="text-emerald-600 text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</span>
                            ) : record.status === 'duplicate' ? (
                              <span className="text-amber-600 text-xs font-medium flex items-center gap-1"><Copy className="w-3 h-3" /> Duplicate</span>
                            ) : (
                              <div className="flex flex-col">
                                <span className="text-red-600 text-xs font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span>
                                {record.errorCategory && <span className="text-[10px] text-red-500">{record.errorCategory}</span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">
                            {record.durationMs ? `${(record.durationMs / 1000).toFixed(1)}s` : '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-medium">
                            {record.estimatedCostCents != null ? (
                              `$${(record.estimatedCostCents / 100).toFixed(4)}`
                            ) : record.costUnavailableReason ? (
                              <div className="flex flex-col items-end gap-0.5 font-sans">
                                <span className={cn(
                                  "font-medium",
                                  record.costUnavailableReason === 'duplicate' ? "text-muted-foreground" : "text-amber-700",
                                )}>
                                  {COST_UNAVAILABLE_LABELS[record.costUnavailableReason].label}
                                </span>
                                <span className="max-w-48 text-[10px] leading-tight text-muted-foreground">
                                  {COST_UNAVAILABLE_LABELS[record.costUnavailableReason].description}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unavailable</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm">Top Features</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {topFeatures.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">No data yet</div>
                ) : (
                  topFeatures.map(([feature, count]) => (
                    <div key={feature} className="p-3 flex items-center justify-between text-sm">
                      <span className="font-medium truncate pr-2">{feature}</span>
                      <span className="text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md text-xs">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* --- ADD/EDIT DIALOG --- */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingProvider?.hasCredential ? 'Edit' : 'Add'} Provider</DialogTitle>
            <DialogDescription>
              Configure API access for an AI provider.
            </DialogDescription>
          </DialogHeader>
          {editingProvider && (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={editingProvider.provider}
                  onValueChange={(v) => setEditingProvider({...editingProvider, provider: v as AiProviderConfigProvider})}
                  disabled={editingProvider?.hasCredential}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude">Anthropic Claude</SelectItem>
                    <SelectItem value="chatgpt">OpenAI ChatGPT</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={editingProvider.credential || ''}
                  onChange={(e) => setEditingProvider({...editingProvider, credential: e.target.value})}
                  placeholder={editingProvider.hasCredential ? "••••••••••••••••" : "sk-..."}
                />
                {editingProvider.hasCredential && (
                  <p className="text-xs text-muted-foreground">Leave blank to keep existing key.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Allowed Models</Label>
                <Input
                  value={editingProvider.allowedModels || ''}
                  onChange={(e) => setEditingProvider({...editingProvider, allowedModels: e.target.value})}
                  placeholder="e.g. claude-3-opus-20240229"
                />
                <p className="text-xs text-muted-foreground">Comma-separated. Leave blank to allow all models.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Requests / Day</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingProvider.requestsPerDay ?? ''}
                    onChange={(e) => setEditingProvider({...editingProvider, requestsPerDay: e.target.value ? parseInt(e.target.value, 10) : ''})}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Budget / Mo ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingProvider.estimatedDollarsPerMonth ?? ''}
                    onChange={(e) => setEditingProvider({...editingProvider, estimatedDollarsPerMonth: e.target.value ? parseFloat(e.target.value) : ''})}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border p-3 rounded-lg mt-2">
                <div className="space-y-0.5">
                  <Label className="text-sm">Enable Provider</Label>
                  <p className="text-xs text-muted-foreground">Allow requests to this provider.</p>
                </div>
                <Switch
                  checked={editingProvider.enabled}
                  onCheckedChange={(c) => setEditingProvider({...editingProvider, enabled: c})}
                />
              </div>

              {!isPlatform && (
                <div className="flex items-center justify-between border p-3 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Allow Platform Fallback</Label>
                    <p className="text-xs text-muted-foreground">Use Daybook's keys if yours fail or are disabled.</p>
                  </div>
                  <Switch
                    checked={editingProvider.allowPlatformFallback}
                    onCheckedChange={(c) => setEditingProvider({...editingProvider, allowPlatformFallback: c})}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfig} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
