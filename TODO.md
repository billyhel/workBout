# Productivity Suite - TODO

## Phase 1: SQL Schema with RLS ✅

- [x] 1. Create `supabase/migrations/001_initial_schema.sql`
  - [x] Create `priority_level` ENUM type
  - [x] Create `task_status` ENUM type
  - [x] Create `tasks` table (id, title, description, priority, status, energy_req, user_id, created_at, updated_at)
  - [x] Create `energy_map` table (id, user_id, energy_level, notes, created_at)
  - [x] Add `updated_at` auto-update trigger for `tasks`
  - [x] Enable RLS on `tasks`
  - [x] Enable RLS on `energy_map`
  - [x] Add CRUD RLS policies for `tasks` (SELECT, INSERT, UPDATE, DELETE)
  - [x] Add CRUD RLS policies for `energy_map` (SELECT, INSERT, UPDATE, DELETE)

- [x] 2. Update `types/index.ts`
  - [x] Add `user_id: string` to the `Task` interface

- [x] 3. Create `.env.local.example`
  - [x] Add `NEXT_PUBLIC_SUPABASE_URL` placeholder
  - [x] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` placeholder

## Phase 2: Supabase Client Setup (@supabase/ssr)

- [x] 4. Install `@supabase/supabase-js` and `@supabase/ssr` (added to package.json — run `npm install`)
- [x] 5. Create `utils/supabase/client.ts` (browser client)
- [x] 6. Create `utils/supabase/server.ts` (server client)
- [x] 7. Create `middleware.ts` (session refresh)
- [x] 8. Create `utils/supabase/tasks.ts` (fetch/insert/update/delete task helpers)

## Phase 3: useTasks Hook + Test Page ✅

- [x] 9. Create `hooks/useTasks.ts`
  - [x] `useMemo` Supabase browser client (stable reference across renders)
  - [x] `tasks: TaskRow[]`, `loading: boolean`, `error: string | null` state
  - [x] `loadTasks` — calls `fetchTasks`, sets state, exposed as `refresh`
  - [x] `useEffect` — calls `loadTasks` on mount
  - [x] `addTask(payload: InsertTaskPayload)` — calls `insertTask`, prepends to state, re-throws on error
  - [x] `toggleComplete(id)` — optimistic status flip ('todo' ↔ 'completed'), reverts on failure
  - [x] Returns `{ tasks, loading, error, addTask, toggleComplete, refresh }`

- [x] 10. Create `app/tasks/TasksClient.tsx` (Client Component)
  - [x] Add Task form: title, priority select, energy range slider (1–5)
  - [x] Success / form-level error banners
  - [x] Loading skeleton (3 animated placeholder rows)
  - [x] Empty state with call-to-action
  - [x] Task list: toggle button, priority badge, energy level, status chip
  - [x] Global error banner for connection / RLS / auth issues

- [x] 11. Create `app/tasks/page.tsx` (Server Component guard)
  - [x] Checks `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` at render time
  - [x] Shows step-by-step setup instructions when credentials are missing (HTTP 200, no crash)
  - [x] Renders `<TasksClient />` when credentials are present

- [x] 12. Fix `middleware.ts` — early return when env vars are absent (prevents 500 in dev)

- [x] 13. Verified: `tsc --noEmit` → zero errors; `GET /tasks` → HTTP 200

## Phase 4: Go Live ✅

- [x] 14. Write `.env.local` with live Supabase credentials
  - [x] `NEXT_PUBLIC_SUPABASE_URL=https://rslvewoufivqmegkelmd.supabase.co`
  - [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...` (publishable/anon key — safe for browser)
- [x] 15. Restart dev server to pick up new env vars
- [x] 16. Run SQL migration in Supabase SQL Editor (`supabase/migrations/001_initial_schema.sql`)
- [x] 17. Verified: `GET /tasks` → HTTP 200, renders "My Tasks" + "Add a Task" (no setup screen)
- [x] 18. Verified: `GET /rest/v1/tasks` → HTTP 200, returns `[]` (RLS active, table exists)
- [x] 19. Verified: `GET /rest/v1/energy_map` → HTTP 200, returns `[]` (RLS active, table exists)
- [x] 20. Verified: unauthenticated `POST /rest/v1/tasks` → HTTP 401 (RLS INSERT policy blocks correctly)

## Phase 5: Auth Flow (Login / Sign Up / Sign Out) ✅

- [x] 21. Create `app/login/page.tsx` (Client Component)
  - [x] Toggle between Sign In / Sign Up modes
  - [x] Email + password fields with validation
  - [x] `signInWithPassword` → redirect to `/tasks` on success
  - [x] `signUp` → show "check your email" confirmation message
  - [x] Error banner for auth failures
  - [x] Loading spinner during submission

- [x] 22. Update `middleware.ts` — auth-based route protection
  - [x] `/tasks` (protected): unauthenticated → redirect to `/login?redirectTo=/tasks`
  - [x] `/login` (auth route): already authenticated → redirect to `/tasks`

- [x] 23. Update `app/tasks/TasksClient.tsx` — Sign Out button
  - [x] Calls `supabase.auth.signOut()` then redirects to `/login`
  - [x] Placed alongside Refresh button in the header

- [x] 24. Verified: `tsc --noEmit` → zero errors
- [x] 25. Verified: `GET /tasks` (unauthenticated) → HTTP 307 → `/login?redirectTo=%2Ftasks`
- [x] 26. Verified: `GET /login` → HTTP 200

## Phase 6: Schema Extension — estimated_duration & deadline ✅

- [x] 27. Create `supabase/migrations/002_add_task_columns.sql`
  - [x] `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_duration INT CHECK (> 0 or NULL)`
  - [x] `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ`
  - [x] Inline RLS analysis comment: no policy changes needed (row-level policies cover all columns)
  - [x] Verification query included as a comment

- [x] 28. Update `utils/supabase/tasks.ts`
  - [x] `TaskRow`: added `estimated_duration: number | null` and `deadline: string | null`
  - [x] `InsertTaskPayload`: added `estimated_duration?: number` and `deadline?: string`
  - [x] `insertTask`: passes `estimated_duration` and `deadline` to INSERT (null if omitted)
  - [x] `updateTask`: spreads `estimated_duration` and `deadline` into UPDATE payload

- [x] 29. Update `types/index.ts`
  - [x] `Task.estimatedDuration` — aligned comment to DB column `estimated_duration`
  - [x] `Task.dueDate` renamed to `Task.deadline` — aligned to DB column `deadline TIMESTAMPTZ`
  - [x] All fields annotated with their DB column names for traceability

- [x] 30. Verified: `tsc --noEmit` → zero errors

## Phase 7: UI — Duration & Deadline Fields ✅

- [x] 31. Update `app/tasks/TasksClient.tsx`
  - [x] Added `estimatedDuration` and `deadline` state variables
  - [x] Added `todayDateString()`, `formatDeadline()`, `isOverdue()` helper functions
  - [x] Added Duration number input (min=1, step=5, positive-only guard)
  - [x] Added Deadline date input (`type="date"`, `min={todayDateString()}`, `[color-scheme:dark]`)
  - [x] Past-date validation in submit handler with user-facing error message
  - [x] New fields included in `InsertTaskPayload` (omitted if empty)
  - [x] Form reset clears `estimatedDuration` and `deadline` on success
  - [x] Task list: `🕐 {n}m` duration badge (shown only when set)
  - [x] Task list: `📅 {date}` deadline badge — red + "· overdue" when past due, grey otherwise

- [x] 32. Rewrite `components/TaskForm.tsx`
  - [x] Clean rewrite replacing corrupted file
  - [x] Added `estimatedDuration` and `deadline` to `TaskFormData` interface
  - [x] Duration number input (min=1, step=5)
  - [x] Deadline date input with `min={todayDateString()}` and inline error message
  - [x] Past-date validation in submit handler
  - [x] `isSubmitting` prop for external loading state control

- [x] 33. Verified: `tsc --noEmit` → zero errors
- [x] 34. Verified: `GET /tasks` → HTTP 307 (auth redirect still working)
- [x] 35. Verified: `GET /login` → HTTP 200
- [x] 36. Verified: all new fields present in TasksClient.tsx source (grep confirmed)
