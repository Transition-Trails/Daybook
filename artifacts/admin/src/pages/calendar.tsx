import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useState } from 'react';
import {
  format, startOfWeek, endOfWeek, addWeeks, addDays,
  parseISO, getHours, getMinutes, differenceInMinutes, isSameDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoogleReconnectBanner } from '@/components/GoogleReconnectBanner';

// ── Types ─────────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
};

// ── Layout constants ──────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56; // px per hour
const DAY_START   = 6;  // 6 am
const DAY_END     = 22; // 10 pm
const HOURS       = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

function formatHourLabel(h: number) {
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function eventTop(start: Date) {
  const h = Math.max(getHours(start), DAY_START);
  const m = getMinutes(start);
  return (h - DAY_START) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
}

function eventHeight(start: Date, end: Date) {
  const maxMins = (DAY_END - DAY_START) * 60;
  const mins = Math.min(differenceInMinutes(end, start), maxMins);
  return Math.max((mins / 60) * HOUR_HEIGHT, 28);
}

// ── Error helpers (avoids needing to export ApiError from the package) ────────

function isApiErrorWithStatus(err: unknown, status: number): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === status
  );
}

function isReconnectRequired(err: unknown): boolean {
  if (!isApiErrorWithStatus(err, 401)) return false;
  const data = (err as { data?: unknown }).data;
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).error === 'reconnect_required';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const today    = new Date();
  const weekBase = addWeeks(today, weekOffset);
  const wStart   = startOfWeek(weekBase, { weekStartsOn: 1 }); // Monday
  const wEnd     = endOfWeek(weekBase, { weekStartsOn: 1 });
  const days     = Array.from({ length: 7 }, (_, i) => addDays(wStart, i));

  const startISO = wStart.toISOString();
  const endISO   = wEnd.toISOString();

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar-events', startISO, endISO],
    queryFn: () =>
      customFetch<{ events: CalEvent[] }>(
        `/api/sync/calendar/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
      ),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const needsReconnect  = isReconnectRequired(error);
  const notConnected    = !needsReconnect && !!error;
  const events: CalEvent[]  = data?.events ?? [];
  const timedEvents         = events.filter((e: CalEvent) => !e.allDay);
  const allDayEvents        = events.filter((e: CalEvent) => e.allDay);
  const gridHeight      = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Reconnect banner */}
      <GoogleReconnectBanner visible={needsReconnect} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            {format(wStart, 'MMM d')}–{format(wEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Not-connected prompt */}
      {notConnected && (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border rounded-lg bg-card">
          <Calendar className="w-12 h-12 mb-3 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Connect Google to see your calendar</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-xs">
            Link your Google account to pull events into the day and week views.
          </p>
          <Button onClick={() => { window.location.href = '/api/auth/google'; }}>
            Connect Google
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 border border-border rounded-lg bg-card">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Week grid */}
      {!isLoading && !error && (
        <div className="border border-border rounded-lg overflow-hidden bg-card">

          {/* Day header row */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border bg-muted/30">
            <div className="border-r border-border" />
            {days.map(day => {
              const isToday = isSameDay(day, today);
              return (
                <div key={day.toISOString()} className="py-3 text-center border-r border-border last:border-r-0">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {format(day, 'EEE')}
                  </div>
                  <div className={[
                    'text-sm font-semibold mt-1 w-7 h-7 mx-auto flex items-center justify-center rounded-full',
                    isToday ? 'bg-primary text-primary-foreground' : '',
                  ].join(' ')}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* All-day row (only when there are all-day events) */}
          {allDayEvents.length > 0 && (
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border bg-muted/10">
              <div className="border-r border-border flex items-center justify-end pr-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">all‑day</span>
              </div>
              {days.map(day => {
                const dayAll = allDayEvents.filter((e: CalEvent) => isSameDay(parseISO(e.start), day));
                return (
                  <div key={day.toISOString()} className="border-r border-border last:border-r-0 px-1 py-1 min-h-[32px]">
                    {dayAll.map(e => (
                      <div
                        key={e.id}
                        className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border-l-2 border-primary truncate mb-0.5"
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Timed grid */}
          <div className="overflow-y-auto max-h-[560px]">
            <div className="grid grid-cols-[64px_repeat(7,1fr)]">
              {/* Time labels */}
              <div className="border-r border-border" style={{ height: gridHeight }}>
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    className="flex items-start justify-end pr-2 pt-1 border-b border-border/40 last:border-b-0"
                  >
                    <span className="text-[10px] text-muted-foreground">{formatHourLabel(h)}</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map(day => {
                const dayTimed = timedEvents.filter((e: CalEvent) => isSameDay(parseISO(e.start), day));
                return (
                  <div
                    key={day.toISOString()}
                    className="relative border-r border-border last:border-r-0"
                    style={{ height: gridHeight }}
                  >
                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-b border-border/40"
                        style={{ top: (h - DAY_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      />
                    ))}

                    {/* Events */}
                    {dayTimed.map((e: CalEvent) => {
                      const start  = parseISO(e.start);
                      const end    = parseISO(e.end);
                      const top    = eventTop(start);
                      const height = eventHeight(start, end);
                      return (
                        <div
                          key={e.id}
                          className="absolute left-1 right-1 rounded bg-primary/10 border-l-2 border-primary px-1.5 py-0.5 overflow-hidden hover:bg-primary/20 transition-colors cursor-default group"
                          style={{ top, height, zIndex: 1 }}
                          title={[e.title, e.location].filter(Boolean).join(' · ')}
                        >
                          <p className="text-xs font-semibold text-primary leading-tight truncate">
                            {e.title}
                          </p>
                          {height > 44 && (
                            <p className="text-[10px] text-primary/70 mt-0.5">
                              {format(start, 'h:mm a')}
                            </p>
                          )}
                          {e.location && height > 56 && (
                            <p className="text-[10px] text-primary/60 truncate">{e.location}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 border-t border-border text-muted-foreground/60">
              <Calendar className="w-6 h-6 mb-1.5" />
              <p className="text-sm">No events this week</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
