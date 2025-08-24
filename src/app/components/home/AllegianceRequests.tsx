
'use client';

import React, { useState, useEffect } from 'react';
import type { AllegianceRequest, UserProfile } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Handshake, X, Check, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { respondToAllegianceRequest, deleteAllegianceRequest } from '@/lib/actions/user';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';

export default function AllegianceRequestsBubble() {
  const { userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const pendingRequests = userProfile?.allegianceRequests?.filter(
    (req) => req.status === 'pending'
  ) || [];

  const handleResponse = async (
    request: AllegianceRequest,
    response: 'accepted' | 'rejected'
  ) => {
    if (!userProfile) return;
    const reqKey = `${request.fromId}-${request.createdAt}`;
    setIsSubmitting(reqKey);
    try {
      const result = await respondToAllegianceRequest(userProfile.uid, request, response);
      if (result.success) {
        toast({ title: response === 'accepted' ? 'تم قبول الولاء' : 'تم رفض الطلب' });
        await refreshUserProfile?.();
      } else {
        throw new Error(result.error);
      }
    } catch (e: any) {
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleDelete = async (request: AllegianceRequest) => {
    if (!userProfile) return;
    const reqKey = `delete-${request.fromId}-${request.createdAt}`;
    setIsSubmitting(reqKey);
    try {
      const result = await deleteAllegianceRequest(userProfile.uid, request);
      if (result.success) {
        toast({ title: 'تم حذف الطلب بنجاح' });
        await refreshUserProfile?.();
      } else {
        throw new Error(result.error);
      }
    } catch (e: any) {
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(null);
    }
  };

  if (!pendingRequests.length) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <motion.div
        drag
        dragMomentum={false}
        className="relative"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 text-black flex items-center justify-center shadow-lg ring-2 ring-white/50"
          aria-label={`لديك ${pendingRequests.length} طلبات ولاء`}
        >
          <Handshake className="w-8 h-8" />
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
            {pendingRequests.length}
          </div>
        </button>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-20 right-0 w-80"
          >
            <Card className="bg-slate-900/80 backdrop-blur-md border-amber-500/50 text-white shadow-xl">
              <CardHeader>
                <CardTitle className="text-amber-300">طلبات الولاء</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-80 overflow-y-auto">
                {pendingRequests.map((req, i) => {
                  const reqKey = `${req.fromId}-${req.createdAt}`;
                  return (
                  <div key={reqKey} className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar avatarId={req.fromAvatar} className="w-8 h-8" />
                      <div>
                        <p className="font-bold">{req.fromName}</p>
                        <p className="text-xs text-slate-400">
                          عرض: {req.offer.amount} كوينز لمدة {req.durationInDays} أيام
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <Button
                        size="icon"
                        className="h-8 w-8 bg-green-600 hover:bg-green-700"
                        onClick={() => handleResponse(req, 'accepted')}
                        disabled={!!isSubmitting}
                      >
                        {isSubmitting === reqKey ? <Loader2 className="animate-spin" /> : <Check />}
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleResponse(req, 'rejected')}
                        disabled={!!isSubmitting}
                      >
                         <X />
                      </Button>
                       <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-slate-400 hover:text-white"
                        onClick={() => handleDelete(req)}
                        disabled={!!isSubmitting}
                        aria-label="حذف الطلب"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
