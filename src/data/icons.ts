
import {
  Home,
  Building,
  Building2,
  Store,
  Factory,
  Castle,
  TowerControl,
  Hospital,
  School,
  FerrisWheel,
  Landmark,
  Trees,
  Car,
  Bus,
  Train,
  Plane,
  Ship,
  TrafficCone,
  MapPin,
  Mountain,
  Wind,
  Shield,
  Swords, // Added for Leagues
  type LucideIcon
} from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
  Home,
  Building,
  Building2,
  Store,
  Factory,
  Castle,
  TowerControl,
  Hospital,
  School,
  FerrisWheel,
  Landmark,
  Trees,
  Car,
  Bus,
  Train,
  Plane,
  Ship,
  TrafficCone,
  MapPin,
  Mountain,
  Wind,
  Shield, // Added for Admin Tower
  Swords, // Added for Leagues Hall
};

export const ALL_ICONS = Object.keys(iconMap);
