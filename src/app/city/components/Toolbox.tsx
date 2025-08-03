
'use client';

import { Button } from '@/components/ui/button';
import {
  Building,
  Hammer,
  Trash2,
  TrendingUp,
  Map,
  Settings,
} from 'lucide-react';

const toolItems = [
    { icon: Hammer, label: 'بناء' },
    { icon: Trash2, label: 'هدم' },
    { icon: TrendingUp, label: 'ترقية' },
    { icon: Building, label: 'إحصائيات' },
    { icon: Map, label: 'توسيع' },
    { icon: Settings, label: 'إعدادات' },
];

export function Toolbox() {
  return (
    <aside className="w-20 bg-black/20 border-r border-white/10 flex flex-col items-center justify-center p-2 gap-4">
      {toolItems.map((item, index) => (
        <Button key={index} variant="ghost" size="icon" className="h-14 w-14 flex flex-col gap-1 text-slate-300 hover:text-white hover:bg-slate-700/50">
          <item.icon className="w-6 h-6" />
          <span className="text-xs">{item.label}</span>
        </Button>
      ))}
    </aside>
  );
}
