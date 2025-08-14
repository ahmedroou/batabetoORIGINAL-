"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Coins,
  Shield,
  ArrowRight,
  Handshake,
  Angry,
} from "lucide-react";
import {
  exchangeCoinsForLoyaltyPoints,
  exchangeCoinsForHonor,
  exchangeCoinsForRebellion,
} from "@/lib/actions/user";

// ————————————————————————————————————————————————————————————————
// معدلات التحويل (حافظنا على القيم الأصلية)
// ————————————————————————————————————————————————————————————————
const COIN_TO_LOYALTY_RATE = 3;
const COIN_TO_HONOR_RATE = 2;
const COIN_TO_REBELLION_RATE = 2;

// ————————————————————————————————————————————————————————————————
// أنواع التحويل + إعدادات واجهة موحّدة
// ————————————————————————————————————————————————————————————————
type ExchangeKind = "loyalty" | "honor" | "rebellion";

const EXCHANGE_CONFIG: Record<
  ExchangeKind,
  {
    title: string;
    subtitle: string;
    rate: number;
    color: string; // tailwind text/bg helpers
    icon: (props: any) => JSX.Element;
    calc: (coins: number) => number;
    action: (uid: string, coins: number) => Promise<{ success: boolean; error?: string } | any>;
    targetKey: "loyaltyPoints" | "honorPoints" | "rebellionPoints";
  }
> = {
  loyalty: {
    title: "كوينز → ولاء",
    subtitle: `1 كوينز = ${COIN_TO_LOYALTY_RATE} ولاء`,
    rate: COIN_TO_LOYALTY_RATE,
    color: "blue-400",
    icon: Handshake,
    calc: (c) => c * COIN_TO_LOYALTY_RATE,
    action: exchangeCoinsForLoyaltyPoints,
    targetKey: "loyaltyPoints",
  },
  honor: {
    title: "كوينز → شرف",
    subtitle: `1 كوينز = ${COIN_TO_HONOR_RATE} شرف`,
    rate: COIN_TO_HONOR_RATE,
    color: "amber-400",
    icon: Shield,
    calc: (c) => c * COIN_TO_HONOR_RATE,
    action: exchangeCoinsForHonor,
    targetKey: "honorPoints",
  },
  rebellion: {
    title: "كوينز → تمرد",
    subtitle: `1 كوينز = ${COIN_TO_REBELLION_RATE} تمرد`,
    rate: COIN_TO_REBELLION_RATE,
    color: "red-500",
    icon: Angry,
    calc: (c) => c * COIN_TO_REBELLION_RATE,
    action: exchangeCoinsForRebellion,
    targetKey: "rebellionPoints",
  },
};

// ————————————————————————————————————————————————————————————————
// مكوّن بطاقة التحويل الموحّد
// ————————————————————————————————————————————————————————————————
function ExchangeCard({
  kind,
  coins,
  onExchange,
  isBusy,
  setAmount,
  amount,
}: {
  kind: ExchangeKind;
  coins: number;
  onExchange: (kind: ExchangeKind, amount: number) => Promise<void>;
  isBusy: boolean;
  setAmount: (v: string) => void;
  amount: string;
}) {
  const cfg = EXCHANGE_CONFIG[kind];
  const Icon = cfg.icon as any;

  const parsed = Number.isNaN(parseInt(amount)) ? 0 : parseInt(amount);
  const receive = cfg.calc(parsed || 0);
  const remaining = Math.max(0, coins - (parsed || 0));
  const disabled = isBusy || !parsed || parsed <= 0 || parsed > coins;

  const quickAmounts = useMemo(() => {
    const candidates = [10, 25, 50, 100];
    const filtered = candidates.filter((v) => v <= Math.max(10, coins));
    const unique = Array.from(new Set(filtered));
    return unique.slice(0, 4);
  }, [coins]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gray-900/60 p-4 backdrop-blur-md"
    >
      {/* توهج لوني خفيف حسب نوع البطاقة */}
      <div
        className={`pointer-events-none absolute -inset-1 rounded-2xl opacity-20 blur-2xl bg-gradient-to-tr from-${cfg.color} via-transparent to-transparent`}
      />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-wide text-white">
              {cfg.title}
            </h3>
            <p className="text-sm text-gray-400">{cfg.subtitle}</p>
          </div>
          <div className={`rounded-full p-2 bg-black/40 border border-${cfg.color}/40`}>
            <Icon className={`h-6 w-6 text-${cfg.color}`} />
          </div>
        </div>

        {/* مُدخل الكوينز + المخرجات */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <Label htmlFor={`input-${kind}`} className="mb-1 inline-block">
              أدخل الكوينز
            </Label>
            <Coins className="pointer-events-none absolute left-3 top-9 h-5 w-5 text-yellow-400" />
            <Input
              id={`input-${kind}`}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                setAmount(v);
              }}
              className="pl-10 bg-gray-950/70 border-slate-700 text-lg"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {quickAmounts.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="secondary"
                  className="h-8 px-3"
                  onClick={() => setAmount(String(q))}
                >
                  {q}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3"
                onClick={() => setAmount(String(coins))}
                disabled={coins === 0}
              >
                الحدّ الأقصى
              </Button>
            </div>
          </div>

          <div className="relative">
            <Label className="mb-1 inline-block">ستحصل على</Label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-gray-950/70 p-2">
              <Icon className={`h-5 w-5 text-${cfg.color}`} />
              <div className="flex-1 text-right text-2xl font-bold tabular-nums">
                {receive}
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              المعادلة: <span className="text-gray-200">{amount || 0}</span> ×
              <span className="text-gray-200"> {cfg.rate}</span> =
              <span className="text-gray-200"> {receive}</span>
            </div>
          </div>
        </div>

        {/* معاينة الرصيد المتبقي + تحذيرات */}
        <div className="flex flex-wrap items-center justify-between rounded-lg border border-slate-700 bg-black/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-300">الرصيد المتبقي بعد التحويل:</span>
            <span className="font-semibold text-white">{remaining}</span>
          </div>
          {parsed > coins && (
            <span className="text-destructive">المبلغ يتجاوز رصيدك</span>
          )}
          {parsed > 0 && parsed <= coins && (
            <span className="text-gray-400">عملية لا رجعة فيها</span>
          )}
        </div>

        {/* زر التنفيذ */}
        <Button
          onClick={() => onExchange(kind, parsed)}
          disabled={disabled}
          className={`w-full bg-gradient-to-r from-${cfg.color} to-purple-600 text-black hover:opacity-90`}
        >
          {isBusy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              جارِ التنفيذ…
            </span>
          ) : (
            "تأكيد التحويل"
          )}
        </Button>
      </div>
    </motion.div>
  );
}

// ————————————————————————————————————————————————————————————————
// الصفحة الرئيسية لمتجر المجتمع (منسّقة ومتحركة)
// ————————————————————————————————————————————————————————————————
export default function SocietyStore() {
  const { userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [amounts, setAmounts] = useState<Record<ExchangeKind, string>>({
    loyalty: "",
    honor: "",
    rebellion: "",
  });

  const [busy, setBusy] = useState<ExchangeKind | null>(null);

  const coins = userProfile?.coins || 0;
  const balances = {
    honor: userProfile?.honorPoints || 0,
    loyalty: userProfile?.loyaltyPoints || 0,
    rebellion: userProfile?.rebellionPoints || 0,
  };

  const handleExchange = async (kind: ExchangeKind, amount: number) => {
    if (!userProfile) return;
    if (!amount || amount <= 0) {
      toast({
        title: "مبلغ غير صالح",
        description: "الرجاء إدخال عدد صحيح موجب.",
        variant: "destructive",
      });
      return;
    }
    if (amount > coins) {
      toast({
        title: "الرصيد غير كافٍ",
        description: "تحاول تحويل مبلغ أكبر من رصيدك الحالي.",
        variant: "destructive",
      });
      return;
    }

    setBusy(kind);

    const action = EXCHANGE_CONFIG[kind].action;
    try {
      const res = await action(userProfile.uid, amount);
      const ok = typeof res?.success === "boolean" ? res.success : true;
      if (ok) {
        toast({
          title: "تم التحويل بنجاح",
          description: `حوّلت ${amount} كوينز إلى ${EXCHANGE_CONFIG[kind].title.split(" → ")[1]}.`,
        });
        await refreshUserProfile?.();
        setAmounts((s) => ({ ...s, [kind]: "" }));
      } else {
        toast({ title: "فشل التحويل", description: res?.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "حدث خطأ غير متوقع", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // ————————————————— UI —————————————————
  return (
    <div className="relative flex w-full justify-center">
      {/* خلفية زخرفية لطيفة */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_10%,rgba(168,85,247,.12),transparent_35%),radial-gradient(ellipse_at_80%_80%,rgba(59,130,246,.12),transparent_40%)]" />

      <Card className="w-full max-w-3xl border border-purple-500/30 bg-gray-900/50 text-white shadow-2xl backdrop-blur-lg">
        <CardHeader className="relative overflow-hidden border-b border-purple-500/20">
          <div className="absolute -inset-x-10 -top-20 h-40 rotate-2 bg-gradient-to-r from-purple-600/20 via-cyan-500/10 to-pink-500/20 blur-2xl" />
          <div className="relative">
            <CardTitle className="text-center text-3xl font-extrabold tracking-wider text-purple-200">
              متجر المجتمع
            </CardTitle>
            <CardDescription className="mt-2 text-center text-gray-400">
              استبدل عملاتك لتعزيز مكانتك الاجتماعية — معاملات فورية وغير قابلة للإلغاء.
            </CardDescription>

            {/* أرصدة المستخدم */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-700 bg-black/30 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-300">
                  <Coins className="h-5 w-5" />
                  <span className="text-sm text-gray-300">كوينز</span>
                </div>
                <div className="mt-1 text-2xl font-mono">{coins}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-black/30 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-300">
                  <Shield className="h-5 w-5" />
                  <span className="text-sm text-gray-300">الشرف</span>
                </div>
                <div className="mt-1 text-2xl font-mono">{balances.honor}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-black/30 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-blue-300">
                  <Handshake className="h-5 w-5" />
                  <span className="text-sm text-gray-300">الولاء</span>
                </div>
                <div className="mt-1 text-2xl font-mono">{balances.loyalty}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-black/30 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-red-400">
                  <Angry className="h-5 w-5" />
                  <span className="text-sm text-gray-300">التمرد</span>
                </div>
                <div className="mt-1 text-2xl font-mono">{balances.rebellion}</div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          {/* مسارات التحويل */}
          <ExchangeCard
            kind="loyalty"
            coins={coins}
            isBusy={busy === "loyalty"}
            onExchange={handleExchange}
            amount={amounts.loyalty}
            setAmount={(v) => setAmounts((s) => ({ ...s, loyalty: v }))}
          />

          <div className="mx-auto my-2 flex max-w-sm items-center justify-center gap-2 text-sm text-gray-500">
            <ArrowRight className="h-4 w-4" />
            <span>نصائح: استخدم الأزرار السريعة أو "الحدّ الأقصى" لتعبئة الحقول فورًا</span>
          </div>

          <ExchangeCard
            kind="honor"
            coins={coins}
            isBusy={busy === "honor"}
            onExchange={handleExchange}
            amount={amounts.honor}
            setAmount={(v) => setAmounts((s) => ({ ...s, honor: v }))}
          />

          <ExchangeCard
            kind="rebellion"
            coins={coins}
            isBusy={busy === "rebellion"}
            onExchange={handleExchange}
            amount={amounts.rebellion}
            setAmount={(v) => setAmounts((s) => ({ ...s, rebellion: v }))}
          />

          {/* تلميحات عامة */}
          <div className="rounded-xl border border-slate-700 bg-black/30 p-4 text-xs text-gray-400">
            <ul className="list-disc space-y-1 pr-5">
              <li>المعاملات فورية وغير قابلة للاسترجاع.</li>
              <li>
                إذا تغيّر رصيدك من نافذة أخرى، حدِّث الصفحة أو أعد فتح المتجر للتأكد من أحدث
                الأرقام.
              </li>
              <li>القيم الظاهرة محسوبة محليًا؛ الرصيد النهائي يُحدّث بعد التأكيد.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
