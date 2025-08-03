
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile, City, StoreItem, CityCell } from '@/types';
import {
  getUserCity,
  saveCityLayout,
  getStoreItems,
  purchaseStoreItem,
} from '@/lib/actions/city';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';


// UI Components
import { Loader2, ArrowLeft } from 'lucide-react';
import { ResourceBar } from './components/ResourceBar';
import { Toolbox } from './components/Toolbox';
import { CityGrid } from './components/CityGrid';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface CityClientProps {
  user: User;
  userProfile: UserProfile;
}

export default function CityClient({
  user,
  userProfile: initialProfile,
}: CityClientProps) {
  const [city, setCity] = useState<City | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { refreshUserProfile } = useAuth();
  const [userProfile, setUserProfile] = useState(initialProfile);
  const router = useRouter();


  const fetchCityData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
        const [cityData, itemsData] = await Promise.all([
            getUserCity(user.uid),
            getStoreItems()
        ]);
        
        if (cityData) {
            setCity(cityData);
        }
        
        setStoreItems(itemsData);
    } catch (error) {
        console.error("Error fetching city data:", error);
        toast({ title: 'خطأ', description: 'فشل تحميل بيانات المدينة.', variant: 'destructive' });
    } finally {
        if (isInitialLoad) setLoading(false);
    }
  }, [user.uid, toast]);

  useEffect(() => {
    fetchCityData(true);
    // Set up a poller to refresh data periodically
    const interval = setInterval(() => fetchCityData(false), 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, [fetchCityData]);

  const handlePlaceItem = useCallback(
    (item: StoreItem, position: { x: number; y: number }) => {
      if (!city) return;
      
      const targetCellIndex = city.layout.findIndex(c => c.x === position.x && c.y === position.y);
      if (targetCellIndex === -1 || city.layout[targetCellIndex].item || city.layout[targetCellIndex].isSpecial) {
          toast({ title: 'لا يمكن البناء هنا', description: 'هذه الخلية مشغولة أو خاصة.', variant: 'destructive' });
          return;
      }

      const newLayout = [...city.layout];
      newLayout[targetCellIndex] = { ...newLayout[targetCellIndex], item };


      const oldCity = city;
      // Optimistically update the UI
      setCity({ ...city, layout: newLayout });

      // Save the new layout
      saveCityLayout(user.uid, newLayout)
        .then(result => {
          if (!result.success) {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
            setCity(oldCity); // Revert on failure
          }
        })
        .catch(err => {
          console.error("Failed to save layout:", err);
          setCity(oldCity); // Revert on failure
          toast({ title: 'خطأ', description: 'فشل حفظ المبنى الجديد.', variant: 'destructive' });
        });
    },
    [city, user.uid, toast]
  );

  const handlePurchaseItem = useCallback(
    async (itemId: string) => {
      const result = await purchaseStoreItem(user.uid, itemId);
      if (result.success) {
        toast({
          title: 'تم الشراء بنجاح!',
          description: 'يمكنك الآن وضع العنصر في مدينتك.',
        });

        // Re-fetch all data to get the latest user profile and city state
        if (refreshUserProfile) {
          const newProfile = await refreshUserProfile();
          if (newProfile) setUserProfile(newProfile);
        }
        await fetchCityData();
      } else {
        toast({
          title: 'فشل الشراء',
          description: result.error,
          variant: 'destructive',
        });
      }
    },
    [user.uid, fetchCityData, toast, refreshUserProfile]
  );
  
  const handleSpecialBuildingClick = (path: string) => {
    router.push(path);
  };


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
       <main className="font-sans flex h-screen w-full flex-col bg-gradient-to-br from-[#1A3A3A] via-[#122B2B] to-[#0A1A1A] text-white overflow-hidden relative">
        <Button 
            onClick={() => router.push('/')}
            variant="ghost"
            size="icon"
            className="absolute top-4 left-4 z-20 bg-black/30 hover:bg-black/50 text-white"
        >
            <ArrowLeft />
        </Button>
        <ResourceBar city={city} userProfile={userProfile} />
        <div className="flex flex-grow overflow-hidden">
          <div className="flex-grow flex items-center justify-center relative">
            <CityGrid city={city} onPlaceItem={handlePlaceItem} onSpecialClick={handleSpecialBuildingClick} />
          </div>
          <Toolbox
            storeItems={storeItems}
            unlockedItems={city.unlockedItems}
            onPurchase={handlePurchaseItem}
          />
        </div>
      </main>
    </DndProvider>
  );
}
