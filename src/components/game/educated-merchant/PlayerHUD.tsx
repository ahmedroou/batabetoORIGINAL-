"use client";

import React, { useMemo, useState } from 'react';
import type { Player, Property } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skull, Crown, Activity, Building2, Search, RotateCw, List } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface PlayerHUDProps {
  players: Player[];
  balances: Record<string, number>;
  board: Property[];
  currentTurnPlayerId?: string;
  activityLog?: string[];
  compact?: boolean; 
  onPlayerClick?: (player: Player) => void;
  onInspectProperty?: (prop: Property) => void;
}

const nf = new Intl.NumberFormat('ar-EG');

export function PlayerHUD({ players = [], balances = {}, board = [], currentTurnPlayerId, activityLog = [], compact = false, onPlayerClick, onInspectProperty }: PlayerHUDProps) {
  const [showBankrupt, setShowBankrupt] = useState(true);
  const [search, setSearch] = useState('');
  const [isCompact, setIsCompact] = useState(compact);
  const [sortMode, setSortMode] = useState<'default' | 'balance' | 'properties'>('default');

  const ownedMap = useMemo(() => {
    const map = new Map<string, Property[]>();
    for (const p of board) {
      if (!p?.ownerId) continue;
      const arr = map.get(p.ownerId) ?? [];
      arr.push(p);
      map.set(p.ownerId, arr);
    }
    return map;
  }, [board]);

  const visiblePlayers = useMemo(() => {
    let list = players.slice();
    if (!showBankrupt) list = list.filter(p => p.status !== 'bankrupt');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => (p.name ?? '').toLowerCase().includes(q));
    }
    if (sortMode === 'balance') {
      list.sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0));
    } else if (sortMode === 'properties') {
      list.sort((a, b) => (ownedMap.get(b.id)?.length ?? 0) - (ownedMap.get(a.id)?.length ?? 0));
    }
    return list;
  }, [players, balances, ownedMap, showBankrupt, search, sortMode]);

  return (
    <Card className={cn('w-full h-full flex flex-col', isCompact ? 'text-sm' : 'text-base')}>
      <CardHeader className="shrink-0 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <List className="w-6 h-6 text-violet-700" />
              <CardTitle className="text-lg">اللاعبون</CardTitle>
            </div>
            <div className="text-xs text-gray-500">({players.length})</div>
          </div>

          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800" aria-label="تبديل العرض المضغوط" onClick={() => setIsCompact(v => !v)}>
                    <RotateCw className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تبديل وضع العرض المضغوط</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex items-center gap-1">
              <div className="text-xs">عرض المفلسين</div>
              <Switch checked={showBankrupt} onCheckedChange={(v) => setShowBankrupt(Boolean(v))} />
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." className="h-8" />
            <div className="flex items-center gap-1 shrink-0">
                <button className={cn('px-2 py-1 text-xs rounded-md', sortMode === 'default' ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-800')} onClick={() => setSortMode('default')}>الترتيب الأصلي</button>
                <button className={cn('px-2 py-1 text-xs rounded-md', sortMode === 'balance' ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-800')} onClick={() => setSortMode('balance')}>الأغنى</button>
                <button className={cn('px-2 py-1 text-xs rounded-md', sortMode === 'properties' ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-800')} onClick={() => setSortMode('properties')}>الأكثر أملاكًا</button>
            </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow p-2 flex flex-col min-h-0">
        <ScrollArea className="flex-grow">
          <div className="space-y-2 p-2">
            <AnimatePresence>
              {visiblePlayers.map((player, index) => {
                const isCurrentTurn = player.id === currentTurnPlayerId;
                const isBankrupt = player.status === 'bankrupt';
                const owned = ownedMap.get(player.id) ?? [];
                const balance = balances[player.id] ?? 0;

                return (
                  <motion.div key={player.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ delay: index * 0.03 }}>
                    <div
                      role="button"
                      onClick={() => onPlayerClick?.(player)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onPlayerClick?.(player); }}
                      className={cn('p-3 rounded-lg border-2 transition-all duration-200 flex flex-col gap-2', isBankrupt ? 'bg-red-900/30 border-red-700/40 opacity-75' : 'bg-white dark:bg-gray-900/50', isCurrentTurn ? 'ring-2 ring-offset-2 ring-violet-500' : 'border-transparent')}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-12 h-12 rounded-full overflow-hidden border-2 flex items-center justify-center', isBankrupt ? 'border-red-600' : 'border-white')}>
                            <PlayerAvatar avatarId={player.avatarId} className="w-full h-full" />
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <div className="font-bold">{player.name}</div>
                              {isCurrentTurn && !isBankrupt && <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />}
                              {isBankrupt && <Skull className="w-5 h-5 text-red-500" />}
                            </div>
                            <div className="text-xs text-gray-500">{player.id}</div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-green-600 dark:text-green-400">{nf.format(balance)} د.ع</div>
                          <div className="text-xs text-gray-500">{isBankrupt ? 'مفلس' : `${owned.length} ممتلكات`}</div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {owned.length > 0 ? (
                          owned.slice(0, 6).map(prop => (
                            <TooltipProvider key={prop.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => onInspectProperty?.(prop)} className="w-8 h-8 rounded-md flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: player.color }} aria-label={`عرض ${prop.name}`}>
                                    <Building2 className="w-4 h-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-sm">
                                    <div className="font-bold">{prop.name}</div>
                                    {prop.type === 'property' && <div>السعر: {nf.format(prop.price ?? 0)} د.ع</div>}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))
                        ) : (
                          !isBankrupt && <div className="text-xs text-muted-foreground">لا ممتلكات</div>
                        )}

                        {owned.length > 6 && <div className="text-xs text-gray-500">+{owned.length - 6}</div>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {visiblePlayers.length === 0 && (
              <div className="p-3 text-center text-sm text-gray-500">لا توجد لاعبين مطابقين للفلتر الحالي.</div>
            )}
          </div>
        </ScrollArea>
        
        <div className="mt-3 shrink-0">
          <h3 className="text-center font-bold text-sm mb-2 flex items-center justify-center gap-2"><Activity className="w-4 h-4" /> آخر الأحداث</h3>
          <ScrollArea className="h-32 p-2 bg-gray-100 dark:bg-gray-900/40 rounded-md">
            <div className="space-y-1.5 text-xs text-right">
              {activityLog.length > 0 ? (
                activityLog.slice().reverse().map((log, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-6 mt-0.5 text-gray-400">•</div>
                    <div className="flex-1 break-words">{log}</div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground">لم تبدأ الأحداث بعد.</div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
