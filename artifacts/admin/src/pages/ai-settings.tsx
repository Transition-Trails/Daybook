import { useGetAiSettings, useUpdateAiSettings, useAiChat, getGetAiSettingsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Settings, Sparkles, MessageSquare, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function AiSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useGetAiSettings();
  const updateSettings = useUpdateAiSettings();
  const chat = useAiChat();

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<'claude' | 'chatgpt' | 'gemini'>('claude');

  const [prompt, setPrompt] = useState('');
  const [chatResponse, setChatResponse] = useState('');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setProvider(settings.provider as any);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ data: { enabled, provider } }, {
      onSuccess: () => {
        toast({ title: 'Settings saved' });
        queryClient.invalidateQueries({ queryKey: getGetAiSettingsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleTestChat = () => {
    if (!prompt.trim()) return;
    chat.mutate({ 
      data: { 
        messages: [{ role: 'user', content: prompt }],
        provider 
      } 
    }, {
      onSuccess: (res) => {
        setChatResponse(res.text);
        setPrompt('');
      },
      onError: (err: any) => {
        toast({ title: 'Chat failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">AI Settings</h1>
        <p className="text-muted-foreground mt-1">Configure AI integration for drafting and planner generation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Provider Configuration
            </CardTitle>
            <CardDescription>Select and enable the primary AI provider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base">Enable AI Features</Label>
                <p className="text-sm text-muted-foreground">Allow AI generation across the platform.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-3">
              <Label>Primary Provider</Label>
              <Select value={provider} onValueChange={(v: any) => setProvider(v)} disabled={!enabled}>
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
          </CardContent>
          <CardFooter className="border-t bg-muted/20 px-6 py-4">
            <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> Test Integration
            </CardTitle>
            <CardDescription>Run a quick test prompt through the active provider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Test Prompt</Label>
              <div className="flex gap-2">
                <Input 
                  value={prompt} 
                  onChange={e => setPrompt(e.target.value)} 
                  placeholder="Say hello..." 
                  onKeyDown={e => e.key === 'Enter' && handleTestChat()}
                  disabled={!enabled || chat.isPending}
                />
                <Button onClick={handleTestChat} disabled={!enabled || chat.isPending || !prompt.trim()}>
                  {chat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {chatResponse && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap font-mono border">
                {chatResponse}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
