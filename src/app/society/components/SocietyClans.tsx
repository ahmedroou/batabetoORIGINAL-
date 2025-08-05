
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { Clan, UserProfile } from '@/types';
import { getClans, createClan } from '@/lib/actions/clans';
import { Loader2, Users, Crown, Shield, User, PlusCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function ClanManagementDialogs({ userProfile }: { userProfile: UserProfile | null }) {
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
                    <Button className="bg-purple-600 hover:bg-purple-700">
                        <PlusCircle className="ml-2"/>
                        أنشئ فريقك
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 border-purple-500 text-white">
                    <DialogHeader>
                        <DialogTitle>إنشاء فريق جديد</DialogTitle>
                        <DialogDescription className="text-gray-400">
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
                                className="bg-gray-800 border-gray-600"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateClanOpen(false)}>إلغاء</Button>
                        <Button onClick={handleCreateClan} disabled={isSubmitting || !clanName.trim()} className="bg-purple-600 hover:bg-purple-700">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإنشاء (5 كوينز)'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}

        {userProfile?.clan && (
            <Button className="bg-purple-600 hover:bg-purple-700" disabled>
                <Users className="ml-2" />
                إدارة فريقي (قريبًا)
            </Button>
        )}
    </>
  );
}

export default function SocietyClans() {
    const { userProfile } = useAuth();
    const [clans, setClans] = useState<Clan[]>([]);
    const [isLoadingClans, setIsLoadingClans] = useState(true);

    const memoizedGetClans = useMemo(() => {
        return async () => {
            setIsLoadingClans(true);
            const fetchedClans = await getClans();
            setClans(fetchedClans);
            setIsLoadingClans(false);
        };
    }, []);

    useEffect(() => {
        memoizedGetClans();
    }, [memoizedGetClans]);
    
    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" }
        })
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-center">
                 <ClanManagementDialogs userProfile={userProfile} />
            </div>
            
            <div className="space-y-4">
                 {isLoadingClans ? (
                    [...Array(3)].map((_, i) => (
                       <Card key={i} className="w-full h-24 bg-gray-800/50 animate-pulse" />
                    ))
                ) : clans.length > 0 ? (
                    clans.map((clan, index) => (
                        <motion.div
                            key={clan.id}
                            custom={index}
                            variants={cardVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <Card className={cn(
                                "border-2 bg-gray-800/50 text-white shadow-lg hover:shadow-xl transition-shadow duration-300 backdrop-blur-sm",
                                index === 0 ? "border-red-500 shadow-red-500/20" : 
                                index === 1 ? "border-pink-400 shadow-pink-400/20" :
                                index === 2 ? "border-gray-500 shadow-gray-500/20" :
                                "border-purple-500/30"
                            )}>
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="text-3xl font-bold w-12 text-center text-gray-400">{index + 1}</div>
                                    <div className="relative w-16 h-16 flex-shrink-0">
                                         <PlayerAvatar avatarId={clan.emblem || 'Avatar000.png'} className="w-16 h-16 p-1 rounded-full"/>
                                    </div>
                                    <div className="flex-grow">
                                        <h3 className="text-xl font-bold" style={{ color: clan.color || '#dc2626' }}>{clan.name}</h3>
                                        <p className="text-sm text-gray-400">مجموع النقاط: <span className="font-bold text-gray-200">{clan.totalPoints}</span></p>
                                    </div>
                                    <div className="flex -space-x-4">
                                        {clan.members.slice(0, 5).map(member => {
                                            const Icon = member.role === 'leader' ? Crown : member.role === 'vice-leader' ? Shield : User;
                                            const iconColor = member.role === 'leader' ? "text-yellow-400" : member.role === 'vice-leader' ? "text-gray-400" : "text-gray-500";
                                            return (
                                                <div key={member.id} className="relative group">
                                                     <PlayerAvatar avatarId={member.avatarId} className="w-10 h-10 border-2 border-gray-900 rounded-full"/>
                                                    <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 shadow">
                                                        <Icon className={cn("w-4 h-4", iconColor)} />
                                                    </div>
                                                    <span className="absolute bottom-full mb-2 w-max px-2 py-1 bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                        {member.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                ) : (
                    <div className="col-span-full text-center py-16">
                        <p className="text-2xl text-gray-400">لا توجد فرق متاحة حاليًا.</p>
                        <p className="text-gray-500">كن أول من ينشئ فريقًا جديدًا!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
