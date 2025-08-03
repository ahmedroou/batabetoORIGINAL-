
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from 'firebase/auth';
import type { UserProfile, City, StoreItem, CityCell } from '@/types';
import {
  getUserCity,
  saveCityLayout,
  getStoreItems,
  purchaseStoreItem,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { motion } from 'framer-motion';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Coins,
  Users,
  Store,
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  Building,
  Lock,
} from 'lucide-react';
import { iconMap } from '@/data/icons';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


const GRID_SIZE = 20;
const ITEM_TYPE = 'storeItem';

interface CityClientProps {
  user: User;
  userProfile: UserProfile;
}

const StoreItemDraggable = ({ item, isUnlocked }: { item: StoreItem, isUnlocked: boolean }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ITEM_TYPE,
    item: { ...item, isNewPurchase: !isUnlocked }, // Pass item data
    canDrag: isUnlocked,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const Icon = iconMap[item.icon] || Building;

  return (
    <div
      ref={drag}
      className={cn(
        "relative p-2 flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg transition-all",
        isUnlocked ? "cursor-grab hover:bg-slate-700" : "opacity-50 cursor-not-allowed",
        isDragging && "opacity-75 shadow-lg shadow-primary/50"
      )}
    >
      {!isUnlocked && (
          <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center z-10">
              <Lock className="w-6 h-6 text-yellow-400"/>
          </div>
      )}
      <div className="p-2 bg-slate-900 rounded-md">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-grow">
        <p className="font-bold">{item.name}</p>
        <p className="text-xs text-muted-foreground">+{item.population} سكان</p>
      </div>
      <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm">
        <Coins className="w-4 h-4" />
        <span>{item.price}</span>
      </div>
    </div>
  );
};

const GridCell = ({
  cell,
  onDropItem,
  onRemoveItem,
}: {
  cell: CityCell;
  onDropItem: (x: number, y: number, item: StoreItem) => void;
  onRemoveItem: (x: number, y: number) => void;
}) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: ITEM_TYPE,
    drop: (item: StoreItem) => onDropItem(cell.x, cell.y, item),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [cell.x, cell.y, onDropItem]);

  const Icon = cell.item ? iconMap[cell.item.icon] || Building : null;

  return (
    <div
      ref={drop}
      className={cn(
        'w-12 h-12 border border-gray-700/50 rounded-sm flex items-center justify-center transition-colors relative group bg-gradient-to-br from-green-900/20 to-green-800/10',
        isOver && canDrop && 'bg-primary/30 border-primary',
        !canDrop && isOver && 'bg-destructive/30 border-destructive'
      )}
    >
      {Icon && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-full h-full flex items-center justify-center"
        >
          <Icon className="w-8 h-8 text-white" />
          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Button
              variant="destructive"
              size="icon"
              className="h-5 w-5 rounded-full"
              onClick={() => onRemoveItem(cell.x, cell.y)}
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
  
  const groupedStoreItems = useMemo(() => {
    return storeItems.reduce((acc, item) => {
        (acc[item.type] = acc[item.type] || []).push(item);
        return acc;
    }, {} as Record<StoreItem['type'], StoreItem[]>);
  }, [storeItems]);

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
    setCity((prevCity) => {
      if (!prevCity) return null;
      const newLayout = [...prevCity.layout];
      const cellIndex = newLayout.findIndex((c) => c.x === x && c.y === y);

      if (cellIndex !== -1 && !newLayout[cellIndex].item) { // Can only drop on empty cell
        newLayout[cellIndex].item = item;
         return { ...prevCity, layout: newLayout };
      }
      return prevCity;
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
        description: `لقد اشتريت "${itemToBuy.name}". يمكنك الآن وضعه في مدينتك.`,
      });
      // This is the fix: immediately update the city state on the client
      setCity(prevCity => {
          if (!prevCity) return null;
          return {
              ...prevCity,
              unlockedItems: [...prevCity.unlockedItems, itemToBuy.id]
          }
      });
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
      <main className="font-changa flex min-h-screen w-full bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 text-white">
        {/* Store Sidebar */}
        <aside className="w-80 border-l border-gray-700 bg-black/30 flex flex-col">
          <CardHeader className="flex-shrink-0 border-b border-gray-700">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Store />
              المتجر
            </CardTitle>
             <CardDescription>اسحب العناصر المملوكة إلى الخريطة.</CardDescription>
          </CardHeader>
           <ScrollArea className="flex-grow p-2">
               <Accordion type="multiple" defaultValue={['building', 'road', 'decoration']} className="w-full">
                    {Object.entries(groupedStoreItems).map(([type, items]) => (
                        <AccordionItem key={type} value={type}>
                            <AccordionTrigger className="text-lg font-bold capitalize hover:no-underline">{type}</AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-3">
                                    {items.map((item) => {
                                        const isUnlocked = city?.unlockedItems.includes(item.id) ?? false;
                                        return (
                                            <div key={item.id} onClick={() => !isUnlocked && setItemToBuy(item)}>
                                                <StoreItemDraggable item={item} isUnlocked={isUnlocked} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
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
            <div className="grid gap-0.5 bg-black/20 p-2 rounded-lg" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
              {city?.layout.map((cell) => (
                <GridCell
                  key={`${cell.x}-${cell.y}`}
                  cell={cell}
                  onDropItem={handleDropItem}
                  onRemoveItem={handleRemoveItem}
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
