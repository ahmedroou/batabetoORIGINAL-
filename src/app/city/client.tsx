
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from 'firebase/auth';
import type { UserProfile, City, StoreItem, CityCell } from '@/types';
import { getUserCity } from '@/lib/actions/city';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { motion } from 'framer-motion';

// UI Components
import { Loader2 } from 'lucide-react';
import { ResourceBar } from './components/ResourceBar';
import { Toolbox } from './components/Toolbox';
import { CityGrid } from './components/CityGrid';


interface CityClientProps {
  user: User;
  userProfile: UserProfile;
}

export default function CityClient({ user, userProfile }: CityClientProps) {
  const [city, setCity] = useState<City | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCityData = useCallback(async () => {
    setLoading(true);
    const cityData = await getUserCity(user.uid);
    setCity(cityData);
    setLoading(false);
  }, [user.uid]);

  useEffect(() => {
    fetchCityData();
  }, [fetchCityData]);

  if (loading || !city) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-900">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
        <p className="ml-4 text-white">جاري تحميل مدينتك...</p>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <main className="font-changa flex h-screen w-full flex-col bg-gradient-to-br from-blue-900 via-slate-900 to-green-900 text-white overflow-hidden">
        <ResourceBar resources={city.resources} />
        <div className="flex flex-grow overflow-hidden">
          <div className="flex-grow flex items-center justify-center relative">
              <CityGrid city={city} setCity={setCity} />
          </div>
          <Toolbox />
        </div>
      </main>
    </DndProvider>
  );
}
