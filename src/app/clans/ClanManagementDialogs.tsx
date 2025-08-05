
"use client";

import { useState, useEffect } from 'react';
import type { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createClan } from '@/lib/actions/clans';
import { Loader2, PlusCircle, Users } from 'lucide-react';

interface ClanManagementDialogsProps {
  userProfile: UserProfile | null;
}

export function ClanManagementDialogs({ userProfile }: ClanManagementDialogsProps) {
  const { toast } = useToast();
  const [isCreateClanOpen, setIsCreateClanOpen] = useState(false);
  const [clanName, setClanName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateClan = async () => {
    if (!userProfile || !clanName.trim()) {
      toast({ title: 'الرجاء إدخال اسم للفريق', variant: 'destructive' });
      return;
    }
    if (userProfile.coins < 5) {
        toast({ title: 'ليس لديك ما يكفي من الكوينز', description: 'إنشاء فريق يتطلب 5 كوينز.', variant: 'destructive' });
        return;
    }

    setIsSubmitting(true);
    const result = await createClan(userProfile.uid, clanName.trim());
    if (result.success) {
      toast({ title: 'تم إنشاء الفريق بنجاح!' });
      setIsCreateClanOpen(false);
      setClanName('');
      // Optionally refresh user profile or clan list
    } else {
      toast({ title: 'خطأ في الإنشاء', description: result.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  return (
    <>
        {!userProfile?.clan && (
             <Dialog open={isCreateClanOpen} onOpenChange={setIsCreateClanOpen}>
                <DialogTrigger asChild>
                    <Button>
                        <PlusCircle className="ml-2"/>
                        أنشئ فريقك
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إنشاء فريق جديد</DialogTitle>
                        <DialogDescription>
                            قم بتأسيس فريقك الخاص مقابل 5 كوينز. يمكنك دعوة أصدقائك لاحقًا.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="clan-name">اسم الفريق</Label>
                            <Input
                                id="clan-name"
                                value={clanName}
                                onChange={(e) => setClanName(e.target.value)}
                                placeholder="مثال: فريق الصقور"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateClanOpen(false)}>إلغاء</Button>
                        <Button onClick={handleCreateClan} disabled={isSubmitting || !clanName.trim()}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإنشاء (5 كوينز)'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}

        {userProfile?.clan && (
            <Button>
                <Users className="ml-2" />
                إدارة فريقي (قريبًا)
            </Button>
        )}
    </>
  );
}
