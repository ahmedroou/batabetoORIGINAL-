
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { StoreItem } from '@/types';
import * as actions from '@/app/actions';
import { iconMap, ALL_ICONS } from '@/data/icons';

// UI Components
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Loader2,
  PlusCircle,
  Edit,
  Trash2,
  Building,
} from 'lucide-react';

type ItemFormData = Omit<StoreItem, 'id'> & { id?: string };

export default function AdminCityStorePage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemFormData | null>(null);

  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) {
      router.push('/');
    } else if (userProfile?.isAdmin) {
      fetchItems();
    }
  }, [loading, userProfile, router]);

  const fetchItems = async () => {
    setIsLoading(true);
    const storeItems = await actions.getStoreItems();
    setItems(storeItems);
    setIsLoading(false);
  };

  const handleOpenDialog = (item: StoreItem | null = null) => {
    if (item) {
      setEditingItem(item);
    } else {
      setEditingItem({
        name: '',
        type: 'building',
        price: 0,
        population: 0,
        icon: 'Building',
      });
    }
    setIsDialogOpen(true);
  };

  const handleFormChange = (
    field: keyof ItemFormData,
    value: string | number
  ) => {
    if (!editingItem) return;
    setEditingItem({ ...editingItem, [field]: value });
  };

  const handleSubmit = async () => {
    if (!editingItem) return;

    // Validation
    if (
      !editingItem.name.trim() ||
      editingItem.price < 0 ||
      editingItem.population < 0
    ) {
      toast({
        title: 'بيانات غير صالحة',
        description: 'الرجاء ملء جميع الحقول بقيم صحيحة.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const result = await actions.addOrUpdateStoreItem(editingItem);
    if (result.success) {
      toast({ title: 'نجاح', description: 'تم حفظ العنصر بنجاح.' });
      setIsDialogOpen(false);
      setEditingItem(null);
      fetchItems();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (itemId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا.')) {
      return;
    }
    setIsSubmitting(true);
    const result = await actions.deleteStoreItem(itemId);
    if (result.success) {
      toast({ title: 'نجاح', description: 'تم حذف العنصر.' });
      fetchItems();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  if (loading || !userProfile?.isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  return (
    <>
      <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50">
        <div className="w-full max-w-4xl space-y-6">
          <div className="relative text-center">
            <h1 className="text-3xl font-bold">إدارة متجر المدينة</h1>
            <p className="text-muted-foreground">
              أضف، عدل، أو احذف العناصر التي يمكن للاعبين شراؤها لمدنهم.
            </p>
            <Button variant="ghost" size="icon" onClick={() => router.push('/admin')} className="absolute top-0 right-0">
              <ArrowLeft />
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>عناصر المتجر</span>
                <Button onClick={() => handleOpenDialog()}>
                  <PlusCircle className="mr-2" /> إضافة عنصر جديد
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p>جاري تحميل العناصر...</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => {
                    const Icon = iconMap[item.icon] || Building;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <Icon className="w-8 h-8 text-primary" />
                          <div>
                            <p className="font-bold text-lg">{item.name}</p>
                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <span>السعر: {item.price}</span>
                              <span>السكان: +{item.population}</span>
                              <span>النوع: {item.type}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenDialog(item)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            disabled={isSubmitting}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem?.id ? 'تعديل عنصر' : 'إضافة عنصر جديد'}
            </DialogTitle>
            <DialogDescription>
              املأ تفاصيل العنصر أدناه.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">الاسم</Label>
                <Input id="name" value={editingItem.name} onChange={(e) => handleFormChange('name', e.target.value)} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="price" className="text-right">السعر</Label>
                <Input id="price" type="number" value={editingItem.price} onChange={(e) => handleFormChange('price', Number(e.target.value))} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="population" className="text-right">السكان</Label>
                <Input id="population" type="number" value={editingItem.population} onChange={(e) => handleFormChange('population', Number(e.target.value))} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">النوع</Label>
                <Select value={editingItem.type} onValueChange={(v) => handleFormChange('type', v)}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="building">مبنى</SelectItem>
                        <SelectItem value="road">طريق</SelectItem>
                        <SelectItem value="decoration">ديكور</SelectItem>
                    </SelectContent>
                </Select>
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="icon" className="text-right">الأيقونة</Label>
                 <Select value={editingItem.icon} onValueChange={(v) => handleFormChange('icon', v)}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <ScrollArea className="h-72">
                            {ALL_ICONS.map(iconName => {
                                const IconComponent = iconMap[iconName];
                                return (
                                    <SelectItem key={iconName} value={iconName}>
                                        <div className="flex items-center gap-2">
                                            <IconComponent className="w-4 h-4" />
                                            <span>{iconName}</span>
                                        </div>
                                    </SelectItem>
                                )
                            })}
                        </ScrollArea>
                    </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
