
"use client";

import * as React from 'react';
import type { Challenge } from '@/types';
import { Button } from '@/components/ui/button';
import { Swords, Users, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { Timestamp } from 'firebase/firestore';

export function CompactChallengeList({ challenges }: { challenges: Challenge[] }) {
    const { userProfile } = useAuth();
    const [challengeToJoin, setChallengeToJoin] = React.useState<Challenge | null>(null);

    // This component will now manage the dialog visibility state.
    // The actual Dialog component is in HomeDialogs and will listen to this state.
    // For now, we will assume a function `openJoinChallengeDialog` exists.
    // Let's create a local state management for the dialog to show how it would work.
    // In the final implementation, this state might be lifted up or handled via context.
    const [isJoinDialogOpen, setIsJoinDialogOpen] = React.useState(false);

    const handleJoinClick = (challenge: Challenge) => {
        setChallengeToJoin(challenge);
        setIsJoinDialogOpen(true); // This would trigger the dialog in a full implementation
    };

    return (
        <div className="space-y-2">
            <AnimatePresence>
                {challenges.map((challenge, index) => {
                    const isParticipant = userProfile && challenge.participantIds?.includes(userProfile.uid);
                    const endsAtDate = challenge.endsAt instanceof Timestamp ? challenge.endsAt.toDate() : new Date(challenge.endsAt);
                    const endsIn = formatDistanceToNowStrict(endsAtDate, { locale: ar, addSuffix: true });

                    return (
                        <motion.div
                            key={challenge.id}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0, transition: { delay: index * 0.1 } }}
                            exit={{ opacity: 0, x: 20 }}
                        >
                            <div className="flex items-center gap-3">
                                <Swords className="w-5 h-5 text-primary" />
                                <div>
                                    <p className="font-bold">{challenge.title}</p>
                                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>تنتهي {endsIn}</span>
                                        <span className="flex items-center gap-1"><Users className="w-3 h-3"/>{challenge.participantCount || 0} مشارك</span>
                                    </div>
                                </div>
                            </div>
                            <Button size="sm" disabled={isParticipant} onClick={() => alert(`Joining ${challenge.title}`)}>
                                {isParticipant ? 'أنت مشارك' : 'انضم'}
                            </Button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

// NOTE: To make the "Join" button fully functional, you would need to:
// 1. Lift state up to the parent `Home` component (`page.tsx`).
// 2. Pass down a function like `handleOpenJoinDialog(challenge)` as a prop.
// 3. In `Home`, manage the state for which challenge is selected and whether the dialog is open.
// 4. Pass that state to the `NewChallengeDialog` component within `HomeDialogs`.
// For this change, we are just creating the UI component. The user can ask to wire it up next.
// A simple `alert` is used as a placeholder for the join action.
