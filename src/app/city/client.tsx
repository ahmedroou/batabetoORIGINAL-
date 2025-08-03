
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from 'firebase/auth';
import type { UserProfile, City, StoreItem } from '@/types';
import {
  getUserCity,
  saveCityLayout,
  getStoreItems,
  purchaseStoreItem,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrop } from 'react-dnd';
import { motion } from 'framer-motion';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Coins,
  Users,
  Store,
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  iconMap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const GRID_SIZE = 20;

interface CityClientProps {
  user: User;
  userProfile: UserProfile;
}

const StoreItemDraggable = ({ item }: { item: StoreItem }) => {
  const Icon = iconMap[item.icon] || Building;
  return (
    <Card className="p-2 flex items-center gap-2 bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700">
      <div className="p-2 bg-slate-900 rounded-md">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-grow">
        <p className="font-bold">{item.name}</p>
        <p className="text-xs text-muted-foreground">+{item.population} سكان</p>
      </div>
      <div className="flex items-center gap-1 text-yellow-400 font-bold">
        <Coins className="w-4 h-4" />
        <span>{item.price}</span>
      </div>
    </Card>
  );
};

const GridCell = ({
  cell,
  onDrop,
  onRemove,
}: {
  cell: { x: number; y: number; item: StoreItem | null };
  onDrop: (item: StoreItem) => void;
  onRemove: () => void;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'storeItem',
    drop: (item: StoreItem) => onDrop(item),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const Icon = cell.item ? iconMap[cell.item.icon] || Building : null;

  return (
    <div
      ref={drop}
      className={cn(
        'w-12 h-12 border border-gray-700/50 rounded-sm flex items-center justify-center transition-colors relative group',
        isOver && canDrop ? 'bg-green-500/20' : 'bg-gray-800/50'
      )}
    >
      {cell.item && Icon && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <Icon className="w-8 h-8 text-white" />
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="destructive"
              size="icon"
              className="h-5 w-5"
              onClick={onRemove}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default function CityClient({ user, userProfile }: CityClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { refreshUserProfile } = useAuth();
  const [city, setCity] = useState<City | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [itemToBuy, setItemToBuy] = useState<StoreItem | null>(null);

  const cityPopulation = useMemo(() => {
    if (!city || !city.layout) return 0;
    return city.layout.reduce(
      (sum, cell) => sum + (cell.item?.population || 0),
      0
    );
  }, [city]);

  const fetchCityData = useCallback(async () => {
    setLoading(true);
    const [cityData, storeData] = await Promise.all([
      getUserCity(user.uid),
      getStoreItems(),
    ]);
    setCity(cityData);
    setStoreItems(storeData);
    setLoading(false);
  }, [user.uid]);

  useEffect(() => {
    fetchCityData();
  }, [fetchCityData]);

  const handleSaveLayout = useCallback(async () => {
    if (!city || !city.layout) return;
    setIsSaving(true);
    const result = await saveCityLayout(user.uid, city.layout);
    if (result.success) {
      toast({ title: 'تم حفظ تصميم المدينة!' });
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
    setIsSaving(false);
  }, [city, user.uid, toast]);

  const handleDropItem = (x: number, y: number, item: StoreItem) => {
    const isUnlocked = city?.unlockedItems.includes(item.id);
    if (!isUnlocked) {
      toast({
        title: 'عنصر غير مملوك',
        description: 'يجب عليك شراء هذا العنصر من المتجر أولاً.',
        variant: 'destructive',
      });
      return;
    }

    setCity((prevCity) => {
      if (!prevCity) return null;
      const newLayout = [...prevCity.layout];
      const cellIndex = newLayout.findIndex((c) => c.x === x && c.y === y);

      if (cellIndex !== -1) {
        newLayout[cellIndex].item = item;
      }
      return { ...prevCity, layout: newLayout };
    });
  };

  const handleRemoveItem = (x: number, y: number) => {
    setCity((prevCity) => {
      if (!prevCity) return null;
      const newLayout = [...prevCity.layout];
      const cellIndex = newLayout.findIndex((c) => c.x === x && c.y === y);

      if (cellIndex !== -1) {
        newLayout[cellIndex].item = null;
      }
      return { ...prevCity, layout: newLayout };
    });
  };

  const handleBuyItem = async () => {
    if (!itemToBuy) return;
    setIsSaving(true);
    const result = await purchaseStoreItem(user.uid, itemToBuy.id);
    if (result.success) {
      toast({
        title: 'تم الشراء بنجاح!',
        description: `لقد اشتريت "${itemToBuy.name}".`,
      });
      await fetchCityData(); // Refetch data to update unlocked items and coins
      if (refreshUserProfile) refreshUserProfile();
    } else {
      toast({ title: 'فشل الشراء', description: result.error, variant: 'destructive' });
    }
    setItemToBuy(null);
    setIsSaving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <main className="font-changa flex min-h-screen w-full bg-gray-900 text-white">
        {/* Store Sidebar */}
        <aside className="w-80 border-l border-gray-700 bg-gray-800/50 flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Store />
              المتجر
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-3">
              {storeItems.length > 0 ? (
                storeItems.map((item) => {
                  const isUnlocked = city?.unlockedItems.includes(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      onClick={() => !isUnlocked && setItemToBuy(item)}
                    >
                      <StoreItemDraggable item={item} />
                    </motion.div>
                  );
                })
              ) : (
                <p className="text-muted-foreground">المتجر فارغ حاليًا.</p>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <div className="flex-grow flex flex-col p-6">
          <header className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-4xl font-bold text-primary">مدينة {userProfile.name}</h1>
              <p className="text-gray-400">ابنِ مدينتك الخاصة واجعلها تزدهر!</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-400">السكان</p>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  <Users />
                  <span>{cityPopulation}</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">الكوينز</p>
                <div className="flex items-center gap-2 text-2xl font-bold text-yellow-400">
                  <Coins />
                  <span>{userProfile.coins}</span>
                </div>
              </div>
              <Button onClick={() => router.push('/')} variant="outline" size="icon">
                <ArrowLeft />
              </Button>
            </div>
          </header>

          <div className="flex-grow flex items-center justify-center">
            <div className="grid gap-1 bg-black/20 p-2 rounded-lg" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
              {city?.layout.map((cell) => (
                <GridCell
                  key={`${cell.x}-${cell.y}`}
                  cell={cell}
                  onDrop={(item) => handleDropItem(cell.x, cell.y, item)}
                  onRemove={() => handleRemoveItem(cell.x, cell.y)}
                />
              ))}
            </div>
          </div>
          <footer className="mt-6 flex justify-end">
            <Button onClick={handleSaveLayout} disabled={isSaving} size="lg">
              {isSaving ? (
                <Loader2 className="mr-2 animate-spin" />
              ) : (
                <Save className="mr-2" />
              )}
              حفظ التخطيط
            </Button>
          </footer>
        </div>
      </main>

      {/* Purchase Confirmation Dialog */}
      <AlertDialog open={!!itemToBuy} onOpenChange={(open) => !open && setItemToBuy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد شراء "{itemToBuy?.name}" مقابل{' '}
              <strong className="text-yellow-400">{itemToBuy?.price} كوينز</strong>؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleBuyItem} disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : 'شراء'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndProvider>
  );
}
