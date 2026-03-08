import CalendarGrid from '@/components/CalendarGrid';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Calendar</h1>
        <p className="mt-1 text-sm text-slate-400">
          24-hour timeline with 30-minute slots and live current-time indicator.
        </p>
      </header>

      <CalendarGrid />
    </div>
  );
}
