
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile, City, StoreItem, CityCell } from '@/types';
import { getUserCity, saveCityLayout, getStoreItems, purchaseStoreItem } from '@/lib/actions/city';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { motion } from 'framer-motion';

// UI Components
import { Loader2 } from 'lucide-react';
import { ResourceBar } from './components/ResourceBar';
import { Toolbox } from './components/Toolbox';
import { CityGrid } from './components/CityGrid';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';


interface CityClientProps {
  user: User;
  userProfile: UserProfile;
}

export default function CityClient({ user, userProfile: initialProfile }: CityClientProps) {
  const [city, setCity] = useState<City | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { refreshUserProfile } = useAuth();
  const [userProfile, setUserProfile] = useState(initialProfile);


  const fetchCityData = useCallback(async () => {
    // No need to set loading to true here on subsequent fetches to avoid flicker
    const [cityData, itemsData] = await Promise.all([
        getUserCity(user.uid),
        getStoreItems()
    ]);
    setCity(cityData);
    setStoreItems(itemsData);
    setLoading(false);
  }, [user.uid]);

  useEffect(() => {
    setLoading(true);
    fetchCityData();
  }, [fetchCityData]);

  const handlePlaceItem = useCallback(async (item: StoreItem, position: { x: number; y: number }) => {
    if (!city) return;

    // Create a new layout array to avoid direct mutation
    const newLayout = city.layout.map(cell => {
      if (cell.x === position.x && cell.y === position.y) {
        // Only place if the cell is empty
        if (cell.item) return cell; 
        return { ...cell, item };
      }
      return cell;
    });
    
    // Optimistically update the UI
    const updatedCity = { ...city, layout: newLayout };
    setCity(updatedCity);

    // Save the new layout to the backend without waiting
    saveCityLayout(user.uid, newLayout);
  }, [city, user.uid]);

  const handlePurchaseItem = useCallback(async (itemId: string) => {
      const result = await purchaseStoreItem(user.uid, itemId);
      if (result.success) {
          toast({title: "تم الشراء بنجاح!", description: "يمكنك الآن وضع العنصر في مدينتك."});
          
          // Re-fetch data to get the latest user profile (coins) and city state (unlocked items)
          if(refreshUserProfile) {
            await refreshUserProfile();
          }
          await fetchCityData(); 
      } else {
          toast({title: "فشل الشراء", description: result.error, variant: "destructive"});
      }
  }, [user.uid, fetchCityData, toast, refreshUserProfile]);


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
        <ResourceBar city={city} userProfile={userProfile} />
        <div className="flex flex-grow overflow-hidden">
          <div className="flex-grow flex items-center justify-center relative">
              <CityGrid city={city} onPlaceItem={handlePlaceItem} />
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
