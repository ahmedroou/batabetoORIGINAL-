"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { ClanWar, Clan, UserProfile } from '@/types';
import { getClans, getClanWarInvites, respondToClanWarInvite, createClanWarInvite } from '@/lib/actions/clans';
import { Loader2, Swords, Shield, Calendar, Gamepad2, Check, X, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { GAME_TYPE_NAMES, Game } from '@/types';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const CreateWarDialog = ({ userProfile, onWarCreated }: { userProfile: UserProfile, onWarCreated: () => void }) => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allClans, setAllClans] = useState<Clan[]>([]);
    const [isLoadingClans, setIsLoadingClans] = useState(false);

    // Form state
    const [challengedClanId, setChallengedClanId] = useState('');
    const [gameType, setGameType] = useState<Game['gameType'] | ''>('');
    const [battleTime, setBattleTime] = useState('');

    const fetchClans = useCallback(async () => {
        setIsLoadingClans(true);
        const clans = await getClans();
        setAllClans(clans.filter(c => c.id !== userProfile.clan?.id));
        setIsLoadingClans(false);
    }, [userProfile.clan?.id]);

    useEffect(() => {
        if (isOpen) {
            fetchClans();
        }
    }, [isOpen, fetchClans]);

    const handleCreateWar = async () => {
        if (!userProfile.clan || !challengedClanId || !gameType || !battleTime) {
            toast({ title: "الرجاء ملء جميع الحقول", variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        const result = await createClanWarInvite({
            challengerClanId: userProfile.clan.id,
            challengedClanId,
            gameType: gameType as Game['gameType'],
            battleTime: new Date(battleTime),
        });

        if (result.success) {
            toast({ title: "تم إرسال تحدي الحرب بنجاح!" });
            onWarCreated();
            setIsOpen(false);
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Swords className="ml-2"/> تحدي فريق آخر
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-purple-500 text-white">
                <DialogHeader>
                    <DialogTitle>إعلان حرب جديدة</DialogTitle>
                    <DialogDescription>
                        تحدى فريقًا آخر في معركة ملحمية.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>اختر الفريق المنافس</Label>
                        <Select onValueChange={setChallengedClanId} value={challengedClanId}>
                            <SelectTrigger className="bg-gray-800 border-gray-600">
                                <SelectValue placeholder="اختر فريقًا..." />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 text-white border-purple-500">
                                {isLoadingClans ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> : allClans.map(clan => (
                                    <SelectItem key={clan.id} value={clan.id}>{clan.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>اختر اللعبة</Label>
                         <Select onValueChange={v => setGameType(v as Game['gameType'])} value={gameType}>
                            <SelectTrigger className="bg-gray-800 border-gray-600">
                                <SelectValue placeholder="اختر لعبة للمعركة..." />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 text-white border-purple-500">
                                {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                                    <SelectItem key={type} value={type}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>اختر وقت المعركة</Label>
                        <Input type="datetime-local" value={battleTime} onChange={e => setBattleTime(e.target.value)} className="bg-gray-800 border-gray-600"/>
                    </div>
                </div>
                <DialogFooter>
                     <Button variant="outline" onClick={() => setIsOpen(false)}>إلغاء</Button>
                     <Button onClick={handleCreateWar} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'إرسال التحدي'}
                     </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function ClanWarsClient() {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [invites, setInvites] = useState<ClanWarInvitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchInvites = useCallback(async () => {
        if (!userProfile?.clan?.id) return;
        setIsLoading(true);
        const fetchedInvites = await getClanWarInvites(userProfile.clan.id);
        setInvites(fetchedInvites);
        setIsLoading(false);
    }, [userProfile?.clan?.id]);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    const handleResponse = async (inviteId: string, response: 'accepted' | 'rejected') => {
        if (!userProfile?.clan?.id) return;
        const result = await respondToClanWarInvite(inviteId, userProfile.clan.id, response);
        if (result.success) {
            toast({ title: `تم ${response === 'accepted' ? 'قبول' : 'رفض'} التحدي بنجاح` });
            fetchInvites();
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
    };
    
    if (!userProfile) {
        return <div className="flex min-h-screen w-full items-center justify-center bg-gray-900"><Loader2 className="h-10 w-10 animate-spin text-purple-400" /></div>
    }

    const pendingInvites = invites.filter(i => i.status === 'pending');
    const acceptedWars = invites.filter(i => i.status === 'accepted');

    return (
         <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                       حروب الفرق
                    </h1>
                     <p className="text-lg text-gray-400 mt-2">تحدى الفرق الأخرى وأثبت من هو الأقوى.</p>
                     {userProfile.clanRole === 'leader' && (
                        <div className="mt-4">
                            <CreateWarDialog userProfile={userProfile} onWarCreated={fetchInvites} />
                        </div>
                    )}
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle>دعوات الحروب المعلقة</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoading ? <Loader2 className="mx-auto animate-spin" /> : pendingInvites.length > 0 ? pendingInvites.map(invite => (
                                <Card key={invite.id} className="bg-gray-900/70 border-gray-700">
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                <PlayerAvatar avatarId={invite.challengerClan.emblem} className="w-12 h-12" />
                                                <div>
                                                    <p className="font-bold">{invite.challengerClan.name}</p>
                                                    <p className="text-sm text-gray-400">يتحدى فريقك</p>
                                                </div>
                                            </div>
                                             {userProfile.clanRole === 'leader' && (
                                                <div className="flex gap-2">
                                                    <Button size="icon" className="bg-green-600 hover:bg-green-700" onClick={() => handleResponse(invite.id, 'accepted')}><Check/></Button>
                                                    <Button size="icon" variant="destructive" onClick={() => handleResponse(invite.id, 'rejected')}><X/></Button>
                                                </div>
                                            )}
                                        </div>
                                         <div className="mt-2 pt-2 border-t border-gray-600 text-sm space-y-1">
                                            <p className="flex items-center gap-2"><Gamepad2/> اللعبة: <span className="font-bold">{GAME_TYPE_NAMES[invite.gameType as Game['gameType']]}</span></p>
                                            <p className="flex items-center gap-2"><Calendar/> الموعد: <span className="font-bold">{format(invite.battleTime, 'd MMMM yyyy, h:mm a', { locale: ar })}</span></p>
                                         </div>
                                    </CardContent>
                                </Card>
                            )) : <p className="text-center text-gray-500">لا توجد دعوات معلقة.</p>}
                        </CardContent>
                    </Card>

                    <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle>المعارك القادمة</CardTitle>
                        </CardHeader>
                         <CardContent className="space-y-4">
                            {isLoading ? <Loader2 className="mx-auto animate-spin" /> : acceptedWars.length > 0 ? acceptedWars.map(war => (
                                <Card key={war.id} className="bg-gray-900/70 border-green-500/50">
                                     <CardContent className="p-4">
                                        <div className="flex justify-center items-center gap-4 mb-2">
                                            <div className="flex flex-col items-center">
                                                <PlayerAvatar avatarId={war.challengerClan.emblem} className="w-12 h-12" />
                                                <p className="font-bold text-sm mt-1">{war.challengerClan.name}</p>
                                            </div>
                                            <Swords className="w-8 h-8 text-red-500" />
                                            <div className="flex flex-col items-center">
                                                <PlayerAvatar avatarId={war.challengedClan.emblem} className="w-12 h-12" />
                                                <p className="font-bold text-sm mt-1">{war.challengedClan.name}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-gray-600 text-sm space-y-1 text-center">
                                            <p className="flex items-center justify-center gap-2"><Gamepad2/> {GAME_TYPE_NAMES[war.gameType as Game['gameType']]}</p>
                                            <p className="flex items-center justify-center gap-2"><Calendar/> {format(war.battleTime, 'd MMMM yyyy, h:mm a', { locale: ar })}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )) : <p className="text-center text-gray-500">لا توجد معارك مؤكدة.</p>}
                        </CardContent>
                    </Card>
                </div>
             </main>
         </div>
    );
}
