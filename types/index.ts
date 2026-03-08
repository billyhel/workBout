// Task Management Types
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'todo' | 'in-progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  user_id: string;                    // UUID — references auth.users(id) in Supabase → DB: user_id
  title: string;                      // DB: title
  description?: string;               // DB: description
  priority: Priority;                 // DB: priority (priority_level ENUM)
  status: TaskStatus;                 // DB: status (task_status ENUM)
  energyRequirement: 1 | 2 | 3 | 4 | 5; // Energy level 1–5 → DB: energy_req
  estimatedDuration?: number;         // Minutes (positive int) → DB: estimated_duration (added in migration 002)
  deadline?: Date;                    // Due date/time (UTC) → DB: deadline TIMESTAMPTZ (added in migration 002)
  tags?: string[];                    // Client-side only (not yet persisted to DB)
  createdAt: Date;                    // DB: created_at
  updatedAt: Date;                    // DB: updated_at
  completedAt?: Date;                 // Client-side derived from status === 'completed' + updated_at
}

// Work Bout Types (Pomodoro-style work sessions)
export type WorkBoutStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface WorkBout {
  id: string;
  taskId?: string; // Optional reference to a task
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  status: WorkBoutStatus;
  energyLevelBefore?: 1 | 2 | 3 | 4 | 5; // Energy before the bout
  energyLevelAfter?: 1 | 2 | 3 | 4 | 5; // Energy after the bout
  notes?: string;
  isBreak?: boolean; // True if this is a break period
  createdAt: Date;
  updatedAt: Date;
}

// Energy Tracking Types
export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

export interface EnergyEntry {
  timestamp: Date;
  level: EnergyLevel;
  notes?: string;
  context?: {
    activity?: string;
    location?: string;
    mood?: string;
  };
}

export interface DailyEnergyPattern {
  date: Date;
  hourlyAverages: Map<number, number>; // hour (0-23) -> average energy level
  peakHours: number[]; // Hours with highest energy
  lowHours: number[]; // Hours with lowest energy
  entries: EnergyEntry[];
}

export interface UserEnergyMap {
  userId: string;
  timezone: string;
  // Weekly pattern: day of week (0-6, Sunday-Saturday) -> typical energy pattern
  weeklyPattern: {
    [key: number]: {
      morning: EnergyLevel; // 6am-12pm
      afternoon: EnergyLevel; // 12pm-6pm
      evening: EnergyLevel; // 6pm-12am
    };
  };
  // Historical data
  dailyPatterns: DailyEnergyPattern[];
  // Current state
  currentEnergyLevel?: EnergyLevel;
  lastUpdated: Date;
  // Insights and recommendations
  insights?: {
    bestWorkHours: number[]; // Hours when energy is typically highest
    recommendedBreakTimes: number[]; // When to take breaks
    averageEnergyByDay: Map<number, number>; // day of week -> average energy
  };
}

// Calendar/Scheduling Types
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  type: 'task' | 'work-bout' | 'break' | 'meeting' | 'personal';
  relatedTaskId?: string;
  relatedWorkBoutId?: string;
  color?: string;
  isAllDay?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: Date;
  };
}

// User Preferences
export interface UserPreferences {
  userId: string;
  theme: 'dark' | 'light' | 'auto';
  workBoutDuration: number; // default work session duration in minutes
  breakDuration: number; // default break duration in minutes
  notificationsEnabled: boolean;
  startOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
  defaultPriority: Priority;
  energyTrackingEnabled: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: Date;
}

// Filter and Sort Types
export interface TaskFilters {
  status?: TaskStatus[];
  priority?: Priority[];
  energyRequirement?: {
    min?: EnergyLevel;
    max?: EnergyLevel;
  };
  tags?: string[];
  dueDateRange?: {
    start?: Date;
    end?: Date;
  };
}

export type TaskSortField = 'priority' | 'dueDate' | 'energyRequirement' | 'createdAt' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface TaskSort {
  field: TaskSortField;
  direction: SortDirection;
}
