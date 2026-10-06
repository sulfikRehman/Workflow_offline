/** Ready-made habits for the New Habit window. `icon` must be one of the icons in icons.ts. */
export type HabitTemplate = {
  name: string;
  icon: string;
  unit: string;
  target_value: number;
  color: string;
};

export const TEMPLATES: HabitTemplate[] = [
  { name: 'Drink water', icon: 'Droplet', unit: 'glasses', target_value: 8, color: '#06b6d4' },
  { name: 'Walk', icon: 'Footprints', unit: 'min', target_value: 30, color: '#22c55e' },
  { name: 'Meditate', icon: 'Brain', unit: 'min', target_value: 10, color: '#8b5cf6' },
  { name: 'Read', icon: 'BookMarked', unit: 'pages', target_value: 20, color: '#84cc16' },
  { name: 'Workout', icon: 'Dumbbell', unit: 'min', target_value: 30, color: '#f97316' },
  { name: 'Study', icon: 'BookOpen', unit: 'min', target_value: 60, color: '#3b82f6' },
  { name: 'Sleep', icon: 'Moon', unit: 'hrs', target_value: 8, color: '#14b8a6' },
  { name: 'Cycle', icon: 'Bike', unit: 'min', target_value: 30, color: '#eab308' },
  { name: 'Journal', icon: 'Pencil', unit: 'entry', target_value: 1, color: '#ec4899' },
  { name: 'Eat fruit', icon: 'Apple', unit: 'servings', target_value: 2, color: '#ef4444' },
];
