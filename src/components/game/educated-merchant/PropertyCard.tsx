"use client";

import React, { useCallback, useMemo, useState } from 'react';
import type { Game, Player, Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { buyPropertyAttempt, endTurn } from '@/lib/actions/educated-merchant';
import { Building2, CircleDollarSign, Tag, Loader2, Info, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Small accessible confirmation modal used locally
function ConfirmModal({ open, title, description, onCancel, onConfirm, confirmText = 'تأكيد', cancelText = 'إلغاء', loading = false }: {
  open: boolean;
  title: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal
          role="dialog"
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl p-4 w-[min(92vw,520px)]"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600">
                <Info className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">{title}</h3>
                {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
              </div>
              <button onClick={onCancel} aria-label="إغلاق" className="ml-2 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={onCancel} className="px-3 py-1 rounded-md bg-gray-100 dark:bg-gray-800">{cancelText}</button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={cn('px-4 py-1 rounded-md flex items-center gap-2 justify-center bg-green-600 text-white', loading && 'opacity-80')}
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />} {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PropertyCardProps {
  game: Game;
  self: Player;
  onSuccess?: () => void; // optional callback after successful purchase/skip
}

export function PropertyCard({ game, self, onSuccess }: PropertyCardProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState<'buy' | 'skip' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const es = game.educatedMerchantState;
  if (!es || !es.board) return null;

  // support position being either property.id or numeric index
  const currentProperty = useMemo(() => es.board.find(p => String(p.id) === String(self.position)) ?? es.board[Number(self.position) ?? -1], [es.board, self.position]);

  if (!currentProperty || currentProperty.type !== 'property' || currentProperty.ownerId) return null;

  const price = Number(currentProperty.price ?? 0);
  const rent = Number(currentProperty.rent ?? 0);
  const score = Number(game.playerScores?.[self.id] ?? 0);
  const canAfford = score >= price;
  const remaining = score - price;

  const nf = new Intl.NumberFormat('ar-EG');

  const roi = useMemo(() => {
    if (price <= 0) return '—';
    return `${((rent / price) * 100).toFixed(1)}%`;
  }, [price, rent]);

  const handleBuyConfirm = useCallback(async () => {
    setIsSubmitting('buy');
    try {
      const result = await buyPropertyAttempt(game.id, self.id);
      if (result?.error) {
        toast({ title: 'فشل الشراء', description: result.error, variant: 'destructive' });
        setIsSubmitting(null);
        return;
      }
      toast({ title: 'تم الشراء', description: `${currentProperty.name} أصبحت ملكك الآن.`, variant: 'default' });
      setConfirmOpen(false);
      onSuccess?.();
    } catch (e) {
      console.error(e);
      toast({ title: 'خطأ غير متوقع', description: 'حدث خطأ أثناء شراء العقار.', variant: 'destructive' });
    } finally {
      setIsSubmitting(null);
    }
  }, [game.id, self.id, toast, currentProperty, onSuccess]);

  const handleBuyClick = useCallback(() => {
    // open confirmation modal — show expected remaining balance
    setConfirmOpen(true);
  }, []);

  const handleSkip = useCallback(async () => {
    setIsSubmitting('skip');
    try {
      const result = await endTurn(game.id, self.id);
      if (result?.error) {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        setIsSubmitting(null);
        return;
      }
      toast({ title: 'تم التخطي', description: 'تم إنهاء دورك.', variant: 'default' });
      onSuccess?.();
    } catch (e) {
      console.error(e);
      toast({ title: 'خطأ غير متوقع', description: 'فشل أثناء إنهاء الدور.', variant: 'destructive' });
    } finally {
      setIsSubmitting(null);
    }
  }, [game.id, self.id, toast, onSuccess]);

  return (
    <div className="absolute z-30 inset-x-4 bottom-6 flex items-end justify-center pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="pointer-events-auto"
      >
        <Card className="w-96 shadow-2xl border border-violet-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-violet-50 dark:bg-violet-900">
                <Building2 className="w-7 h-7 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{currentProperty.name}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">عقار قابل للشراء — موقعك الحالي</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <div className="flex items-center gap-2"><CircleDollarSign className="w-5 h-5 text-green-500"/> السعر</div>
                <div className="font-bold">{nf.format(price)} د.ع</div>
              </div>

              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <div className="flex items-center gap-2"><Tag className="w-5 h-5 text-red-500"/> الإيجار</div>
                <div className="font-bold">{nf.format(rent)} د.ع</div>
              </div>

              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <div className="text-sm text-gray-500">نسبة العائد</div>
                <div className="font-semibold">{roi}</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800">
                <div className="text-xs text-gray-500">رصيدك الحالي</div>
                <div className="font-bold text-green-600">{nf.format(score)} د.ع</div>
              </div>

              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800">
                <div className="text-xs text-gray-500">بعد الشراء</div>
                <div className={cn('font-bold', remaining < 0 ? 'text-destructive' : 'text-gray-900')}>{nf.format(remaining)} د.ع</div>
              </div>

              <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800">
                <div className="text-xs text-gray-500">الملاحظات</div>
                <div className="text-sm text-gray-600">{canAfford ? 'يمكنك شراء هذا العقار الآن.' : 'لا يكفي الرصيد. يمكنك التخطي أو محاولة التفاوض لاحقاً.'}</div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button
              onClick={handleBuyClick}
              disabled={!!isSubmitting || !canAfford}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isSubmitting === 'buy' ? <Loader2 className="animate-spin w-4 h-4" /> : 'شراء'}
            </Button>

            <Button onClick={handleSkip} disabled={!!isSubmitting} variant="ghost" className="flex-1">
              {isSubmitting === 'skip' ? <Loader2 className="animate-spin w-4 h-4" /> : 'تخطي'}
            </Button>
          </CardFooter>

        </Card>

        {/* Deny/Insufficient funds hint */}
        {!canAfford && (
          <div className="mt-2 text-sm bg-destructive/10 text-destructive p-2 rounded-md text-center">رصيدك لا يكفي لشراء هذا العقار. حاول بيع ممتلكات أو الانتظار.</div>
        )}

      </motion.div>

      <ConfirmModal
        open={confirmOpen}
        title={`تأكيد شراء: ${currentProperty.name}`}
        description={`سيتم خصم ${nf.format(price)} د.ع من رصيدك. سيصبح رصيدك بعد الشراء ${nf.format(remaining)} د.ع. هل تريد المتابعة؟`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBuyConfirm}
        loading={isSubmitting === 'buy'}
        confirmText="نعم اشتري"
        cancelText="لا، إلغاء"
      />
    </div>
  );
}
