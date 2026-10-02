import {
  BookOpen,
  Dumbbell,
  BookMarked,
  UtensilsCrossed,
  Moon,
  Droplet,
  Heart,
  Brain,
  Footprints,
  Apple,
  Bike,
  Pencil,
  Clock,
  type LucideIcon,
} from 'lucide-react';

const map: Record<string, LucideIcon> = {
  BookOpen,
  Dumbbell,
  BookMarked,
  UtensilsCrossed,
  Moon,
  Droplet,
  Heart,
  Brain,
  Footprints,
  Apple,
  Bike,
  Pencil,
  Clock,
};

export function getHabitIcon(name: string): LucideIcon {
  return map[name] ?? BookOpen;
}
