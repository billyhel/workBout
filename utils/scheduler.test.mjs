// utils/scheduler.test.mjs — logic tests for groupTasksIntoWorkBouts
// Run with: node utils/scheduler.test.mjs

const BOUT_DURATION_MINUTES = 90;
const DEFAULT_TASK_DURATION  = 30;
const PRIORITY_WEIGHT = { urgent:4, high:3, medium:2, low:1 };
const ENERGY_LABEL    = { 1:'Minimal Energy',2:'Light Energy',3:'Moderate Energy',4:'High Energy',5:'Intense Focus' };

function isRichEnergyMap(map) { return 'userId' in map; }

function deriveEnergySlots(map) {
  if (isRichEnergyMap(map) && map.weeklyPattern) {
    const day = new Date().getDay();
    const pat = map.weeklyPattern[day];
    if (pat) {
      const h = new Date().getHours();
      const slots = [];
      if (h < 12) slots.push({ energyLevel: pat.morning,   label: 'Morning'   });
      if (h < 18) slots.push({ energyLevel: pat.afternoon, label: 'Afternoon' });
      if (h < 24) slots.push({ energyLevel: pat.evening,   label: 'Evening'   });
      if (slots.length > 0) return slots.sort((a,b) => b.energyLevel - a.energyLevel);
    }
  }
  if (isRichEnergyMap(map) && (map.insights?.bestWorkHours?.length ?? 0) > 0) {
    return [
      { energyLevel:5, label:'Peak Focus'  },
      { energyLevel:3, label:'Steady Work' },
      { energyLevel:1, label:'Light Tasks' },
    ];
  }
  const current = isRichEnergyMap(map) ? (map.currentEnergyLevel ?? 3) : map.energy_level;
  const high = Math.min(5, current), medium = Math.max(1, current-1), low = Math.max(1, current-2);
  const seen = new Set(), tiers = [];
  for (const [level, label] of [[high,'High Energy'],[medium,'Medium Energy'],[low,'Low Energy']]) {
    if (!seen.has(level)) { seen.add(level); tiers.push({ energyLevel: level, label }); }
  }
  return tiers;
}

function buildBoutLabel(slot, i) {
  return ('Bout ' + i + ' · ' + slot.label + ' · ' + (ENERGY_LABEL[slot.energyLevel] ?? '')).trim();
}

function groupTasksIntoWorkBouts(tasks, energyMap) {
  const actionable = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  if (actionable.length === 0) {
    return { bouts:[], unscheduled:[], summary:{ totalBouts:0, totalTasksScheduled:0, totalTasksUnscheduled:0, totalScheduledMinutes:0, averageUtilizationPct:0 } };
  }
  const slots = deriveEnergySlots(energyMap);
  const peakEnergy = slots[0]?.energyLevel ?? 3;
  const sorted = [...actionable].sort((a,b) => {
    const pd = (PRIORITY_WEIGHT[b.priority]??0) - (PRIORITY_WEIGHT[a.priority]??0);
    if (pd !== 0) return pd;
    return Math.abs(a.energy_req - peakEnergy) - Math.abs(b.energy_req - peakEnergy);
  });
  const bouts = slots.map(slot => ({ slot, tasks:[], totalMinutes:0 }));
  const unscheduled = [];
  for (const task of sorted) {
    const duration = task.estimated_duration ?? DEFAULT_TASK_DURATION;
    if (duration > BOUT_DURATION_MINUTES) { unscheduled.push(task); continue; }
    const remaining = b => BOUT_DURATION_MINUTES - b.totalMinutes;
    const candidate = bouts
      .filter(b => remaining(b) >= duration)
      .sort((a,b) => {
        const ed = Math.abs(a.slot.energyLevel - task.energy_req) - Math.abs(b.slot.energyLevel - task.energy_req);
        return ed !== 0 ? ed : remaining(a) - remaining(b);
      })[0];
    if (candidate) {
      candidate.tasks.push(task);
      candidate.totalMinutes += duration;
    } else {
      bouts.push({ slot:{ energyLevel: task.energy_req, label:(ENERGY_LABEL[task.energy_req]??'Energy')+' Overflow' }, tasks:[task], totalMinutes:duration });
    }
  }
  const filledBouts = bouts.filter(b => b.tasks.length > 0).map((b,i) => {
    const totalMinutes     = b.totalMinutes;
    const remainingMinutes = Math.max(0, BOUT_DURATION_MINUTES - totalMinutes);
    const utilizationPct   = Math.min(100, Math.round((totalMinutes / BOUT_DURATION_MINUTES) * 100));
    return { boutIndex:i+1, label:buildBoutLabel(b.slot,i+1), targetEnergyLevel:b.slot.energyLevel, tasks:b.tasks, totalMinutes, remainingMinutes, utilizationPct };
  });
  const totalScheduledMinutes = filledBouts.reduce((s,b) => s+b.totalMinutes, 0);
  const averageUtilizationPct = filledBouts.length > 0
    ? Math.round(filledBouts.reduce((s,b) => s+b.utilizationPct,0) / filledBouts.length) : 0;
  return { bouts:filledBouts, unscheduled, summary:{ totalBouts:filledBouts.length, totalTasksScheduled:filledBouts.reduce((s,b)=>s+b.tasks.length,0), totalTasksUnscheduled:unscheduled.length, totalScheduledMinutes, averageUtilizationPct } };
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let pass=0, fail=0;
function assert(desc, cond) {
  if (cond) { pass++; process.stdout.write('  ✓ ' + desc + '\n'); }
  else       { fail++; process.stderr.write('  ✗ FAIL: ' + desc + '\n'); }
}
let n=0;
function suite(name) { n++; console.log('\nTest ' + n + ': ' + name); }
function makeTask(o={}) {
  return { id:'t'+Math.random(), user_id:'u1', title:'Task', description:null,
    priority:'medium', status:'todo', energy_req:3, estimated_duration:30,
    deadline:null, created_at:'', updated_at:'', ...o };
}
const minimalMap = (lvl=3) => ({ id:'e1', user_id:'u1', energy_level:lvl, created_at:'' });

// ── Test 1: Empty task list ───────────────────────────────────────────────────
suite('Empty task list');
{
  const r = groupTasksIntoWorkBouts([], minimalMap());
  assert('0 bouts',                    r.bouts.length === 0);
  assert('0 scheduled',                r.summary.totalTasksScheduled === 0);
  assert('0 unscheduled',              r.summary.totalTasksUnscheduled === 0);
  assert('0 total minutes',            r.summary.totalScheduledMinutes === 0);
}

// ── Test 2: Completed/cancelled tasks filtered out ────────────────────────────
suite('Completed/cancelled tasks are filtered');
{
  const tasks = [
    makeTask({ status:'completed' }),
    makeTask({ status:'cancelled' }),
    makeTask({ status:'todo', title:'Active' }),
  ];
  const r = groupTasksIntoWorkBouts(tasks, minimalMap());
  assert('Only 1 task scheduled',      r.summary.totalTasksScheduled === 1);
  assert('Scheduled task is Active',   r.bouts[0].tasks[0].title === 'Active');
}

// ── Test 3: Tasks > 90 min go to unscheduled ──────────────────────────────────
suite('Tasks longer than 90 min → unscheduled');
{
  const tasks = [
    makeTask({ title:'Long',  estimated_duration:120 }),
    makeTask({ title:'Short', estimated_duration:30  }),
  ];
  const r = groupTasksIntoWorkBouts(tasks, minimalMap());
  assert('Long task unscheduled',      r.unscheduled.length === 1);
  assert('Unscheduled title correct',  r.unscheduled[0].title === 'Long');
  assert('Short task scheduled',       r.summary.totalTasksScheduled === 1);
}

// ── Test 4: Priority ordering ─────────────────────────────────────────────────
suite('Priority ordering: urgent > high > medium > low');
{
  const tasks = [
    makeTask({ title:'Low',    priority:'low',    energy_req:3, estimated_duration:20 }),
    makeTask({ title:'Urgent', priority:'urgent', energy_req:3, estimated_duration:20 }),
    makeTask({ title:'High',   priority:'high',   energy_req:3, estimated_duration:20 }),
    makeTask({ title:'Medium', priority:'medium', energy_req:3, estimated_duration:20 }),
  ];
  const r = groupTasksIntoWorkBouts(tasks, minimalMap(3));
  const titles = r.bouts[0].tasks.map(t => t.title);
  assert('Urgent is first',            titles[0] === 'Urgent');
  assert('High is second',             titles[1] === 'High');
  assert('Medium is third',            titles[2] === 'Medium');
  assert('Low is last',                titles[3] === 'Low');
}

// ── Test 5: Energy matching — time-independent via bestWorkHours ──────────────
suite('Energy matching: high-energy tasks → high-energy bouts');
{
  // bestWorkHours always produces 3 tiers [5, 3, 1] regardless of time of day,
  // making this test deterministic in any CI / local environment.
  const energyMap = { userId:'u1', insights:{ bestWorkHours:[9,10,11] } };
  const tasks = [
    makeTask({ title:'Intense', energy_req:5, estimated_duration:30 }),
    makeTask({ title:'Light',   energy_req:1, estimated_duration:30 }),
  ];
  const r = groupTasksIntoWorkBouts(tasks, energyMap);
  const highBout = r.bouts.find(b => b.targetEnergyLevel === 5);
  const lowBout  = r.bouts.find(b => b.targetEnergyLevel === 1);
  assert('Intense task in energy-5 bout',    highBout?.tasks.some(t => t.title === 'Intense'));
  assert('Light task in energy-1 bout',      lowBout?.tasks.some(t => t.title === 'Light'));
}

// ── Test 6: Bin-packing — bout fills to 90 min then overflows ─────────────────
suite('Bin-packing: overflow when bout is full');
{
  const tasks = [
    makeTask({ title:'T1', energy_req:3, estimated_duration:45 }),
    makeTask({ title:'T2', energy_req:3, estimated_duration:45 }),
    makeTask({ title:'T3', energy_req:3, estimated_duration:45 }), // overflow
  ];
  const r = groupTasksIntoWorkBouts(tasks, minimalMap(3));
  const fullBout = r.bouts.find(b => b.totalMinutes === 90);
  assert('A bout fills to exactly 90 min',   fullBout !== undefined);
  assert('Overflow creates a second bout',   r.bouts.length >= 2);
  assert('All 3 tasks scheduled',            r.summary.totalTasksScheduled === 3);
  assert('No unscheduled tasks',             r.unscheduled.length === 0);
}

// ── Test 7: Utilization calculation ──────────────────────────────────────────
suite('Utilization and remaining minutes');
{
  const r = groupTasksIntoWorkBouts([ makeTask({ energy_req:3, estimated_duration:45 }) ], minimalMap(3));
  assert('50% utilization for 45/90',        r.bouts[0].utilizationPct === 50);
  assert('45 min remaining',                 r.bouts[0].remainingMinutes === 45);
  assert('totalMinutes = 45',                r.bouts[0].totalMinutes === 45);
}

// ── Test 8: Minimal DB energy map (fallback tiers) ────────────────────────────
suite('Minimal DB energy map — fallback tier derivation');
{
  const r = groupTasksIntoWorkBouts([ makeTask({ energy_req:4, estimated_duration:30 }) ], minimalMap(4));
  assert('Task scheduled',                   r.summary.totalTasksScheduled === 1);
  assert('Bout label starts with Bout 1',    r.bouts[0].label.startsWith('Bout 1'));
  assert('targetEnergyLevel is a number',    typeof r.bouts[0].targetEnergyLevel === 'number');
}

// ── Test 9: insights.bestWorkHours path ───────────────────────────────────────
suite('Rich map with insights.bestWorkHours');
{
  const r = groupTasksIntoWorkBouts(
    [ makeTask({ energy_req:5, estimated_duration:30 }) ],
    { userId:'u1', currentEnergyLevel:3, insights:{ bestWorkHours:[9,10,11] } }
  );
  assert('Task scheduled',                   r.summary.totalTasksScheduled === 1);
  assert('Peak bout energy = 5',             r.bouts[0].targetEnergyLevel === 5);
}

// ── Test 10: Summary totals are internally consistent ─────────────────────────
suite('Summary totals are consistent');
{
  const tasks = [
    makeTask({ energy_req:5, estimated_duration:30 }),
    makeTask({ energy_req:3, estimated_duration:30 }),
    makeTask({ energy_req:1, estimated_duration:30 }),
    makeTask({ energy_req:2, estimated_duration:120 }), // unscheduled
  ];
  const r = groupTasksIntoWorkBouts(tasks, minimalMap(3));
  const boutCount = r.bouts.reduce((s,b) => s+b.tasks.length, 0);
  assert('Bout task count matches summary',  boutCount === r.summary.totalTasksScheduled);
  assert('1 unscheduled (120 min task)',     r.summary.totalTasksUnscheduled === 1);
  assert('scheduled + unscheduled = 4',     r.summary.totalTasksScheduled + r.summary.totalTasksUnscheduled === 4);
  assert('totalScheduledMinutes = 90',      r.summary.totalScheduledMinutes === 90);
}

// ── Test 11: Bout label format ────────────────────────────────────────────────
suite('Bout label format');
{
  const r = groupTasksIntoWorkBouts([ makeTask({ energy_req:3, estimated_duration:30 }) ], minimalMap(3));
  assert('Label contains "Bout 1"',          r.bouts[0].label.includes('Bout 1'));
  assert('Label contains energy description', r.bouts[0].label.includes('Energy'));
}

// ── Test 12: Edge case — energy_level = 1 (deduplication) ────────────────────
suite('Edge case: energy_level = 1 deduplicates tiers');
{
  const r = groupTasksIntoWorkBouts([ makeTask({ energy_req:1, estimated_duration:20 }) ], minimalMap(1));
  assert('Task scheduled',                   r.summary.totalTasksScheduled === 1);
  assert('Only 1 unique tier created',       r.bouts.length === 1);
}

// ── Final report ──────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(pass + '/' + (pass+fail) + ' tests ' + (fail ? 'FAILED ❌' : 'ALL PASS ✅'));
