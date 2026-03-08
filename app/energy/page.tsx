import EnergyTrackerDial from '@/components/EnergyTrackerDial';

export default function EnergyPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Energy</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live energy dial based on your current time of day.
        </p>
      </header>

      <EnergyTrackerDial />
    </div>
  );
}
