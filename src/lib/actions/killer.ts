

/**
 * @fileoverview Actions specific to the "Killer" game.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  arrayUnion,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import type { Player, Game, GameState, CrimeScene, ChatMessage, PlayerLocationChoice, KillerMethod } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';
import { generateNewCrimeScene } from '@/app/actions';
import { getPlayerNumberMap } from './helpers';

export async function startKillerGame(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
        }
        
        if (game.gameType !== 'killer') throw new Error("Invalid action for this game type.");
        if (game.players.length < 4) throw new Error("تحتاج اللعبة إلى 4 لاعبين على الأقل.");

        transaction.update(gameRef, { gameState: 'preparation' });
    });
}

export async function submitAlias(gameId: string, playerId: string, alias: string) {
    if (!alias.trim()) throw new Error("الاسم المستعار مطلوب.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].alias = alias.trim();
        
        const allAliasesSet = updatedPlayers.every(p => p.alias);
        
        if (allAliasesSet) {
            const crimeScene = await generateNewCrimeScene();

            let playersForRoles = [...updatedPlayers];
            const shuffledAvatars = [...AVATAR_IDS].sort(() => 0.5 - Math.random());
            playersForRoles.forEach((player, index) => {
                player.avatarId = shuffledAvatars[index % shuffledAvatars.length];
            });

            playersForRoles.sort(() => Math.random() - 0.5);

            // New role distribution
            const baseRoles: ('killer' | 'detective' | 'cop' | 'witness')[] = ['killer', 'detective', 'cop', 'witness'];
            const rolesToAssign: Player['role'][] = [...baseRoles];
            
            while (rolesToAssign.length < playersForRoles.length) {
                rolesToAssign.push('civilian');
            }
            
            playersForRoles.forEach((player, index) => {
                player.role = rolesToAssign[index];
            });
            
            transaction.update(gameRef, {
                players: playersForRoles.sort((a,b) => a.name.localeCompare(b.name)),
                gameState: 'role_reveal',
                crimeScene: crimeScene,
                turn: 1,
                messages: [],
                detectiveArrest: { used: false },
                copCheck: { used: false },
            });

        } else {
            transaction.update(gameRef, { players: updatedPlayers });
        }
    });
}

export async function progressToDetectiveChoice(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState === 'role_reveal') {
            transaction.update(gameRef, { gameState: 'detective_choice' });
        }
    });
}

export async function detectiveMakesChoice(gameId: string, detectiveId: string, choice: 'discuss' | 'skip') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const detective = game.players.find(p => p.role === 'detective');
        if (!detective || detective.id !== detectiveId) {
            throw new Error("فقط المحقق يمكنه اتخاذ هذا القرار.");
        }

        if (choice === 'discuss') {
            transaction.update(gameRef, { 
                gameState: 'discussion', 
                votes: {},
                discussionEndsAt: Timestamp.fromMillis(Date.now() + 4 * 60 * 1000),
            });
        } else { // skip
            transaction.update(gameRef, { gameState: 'night' });
        }
    });
}

export async function chooseLocation(gameId: string, playerId: string, location: PlayerLocationChoice) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'night') throw new Error("لا يمكنك اختيار موقع الآن.");
    const player = game.players.find(p => p.id === playerId);
    if (!player || player.status !== 'alive') throw new Error("لا يمكنك القيام بهذا الإجراء.");

    const currentLocationChoices = game.locationChoices || {};
    const newLocationChoices = { ...currentLocationChoices, [playerId]: location };

    transaction.update(gameRef, {
      [`locationChoices.${playerId}`]: location,
    });
  });
}


export async function skipNightKill(gameId: string, killerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك تخطي القتل الآن.");
        const killer = game.players.find(p => p.id === killerId);
        if (!killer || killer.role !== 'killer') throw new Error("لست القاتل.");

        transaction.update(gameRef, {
            killerSkipUsed: true,
            gameState: 'victim_reveal',
            nightAction: { skipped: true },
            votes: {},
            messages: [],
            lastVoteResult: {},
            witnessInfo: deleteField() as any,
            copCheckResult: deleteField() as any,
        });
    });
}

export async function performNightKill(
    gameId: string, 
    killerId: string, 
    victimId: string, 
    method: KillerMethod, 
    killerGuessId?: string,
) {
    if (!victimId) throw new Error("يجب اختيار ضحية.");
    if (!method.trim()) throw new Error("يجب تقديم أسلوب القتل.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك القتل الآن.");
        
        const killer = game.players.find(p => p.id === killerId);
        if (!killer || killer.role !== 'killer') throw new Error("لست القاتل.");
        if (killer.status !== 'alive') throw new Error("لا يمكنك القتل، لقد تم إقصائك.");

        const killerLocation = game.locationChoices?.[killerId];
        if (!killerLocation) throw new Error("يجب عليك اختيار موقع أولاً.");

        const victimIndex = game.players.findIndex(p => p.id === victimId);
        if (victimIndex === -1) throw new Error("لم يتم العثور على الضحية.");
        const victim = game.players[victimIndex];
        const victimLocation = game.locationChoices?.[victimId];

        if (killerLocation !== victimLocation) throw new Error("الضحية ليست في نفس موقعك.");
        if (victim.status !== 'alive') throw new Error("هذا اللاعب ليس على قيد الحياة.");
        if (victim.isImmune) throw new Error("لا يمكن استهداف هذا اللاعب مرة أخرى.");

        let updatedPlayers = [...game.players];
        let nightActionResult: Game['nightAction'] = {};
        
        if (killerGuessId) {
            nightActionResult.killerGuess = {
                guessedPlayerId: killerGuessId,
                wasCorrect: killerGuessId === victimId,
            };
        }

        if (victim.role === 'detective') {
            updatedPlayers[victimIndex].isImmune = true; 
            nightActionResult = { ...nightActionResult, victimId: null, method, victimAlias: victim.alias, assassinationFailed: true, detectiveSurvived: true };
        } else {
            updatedPlayers[victimIndex].status = 'killed';
            nightActionResult = { ...nightActionResult, victimId, method, victimAlias: victim.alias };
        }
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'victim_reveal',
            nightAction: nightActionResult,
            votes: {},
            messages: [],
            lastVoteResult: {},
            witnessInfo: deleteField() as any,
            copCheckResult: deleteField() as any,
        });
    });
}

export async function progressAfterVictimReveal(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'victim_reveal') return;

        const { nightAction, players, locationChoices, copCheck } = game;
        if (!nightAction) throw new Error("Night action details are missing.");

        // Cop Check Reveal Logic
        let copCheckRevealData: Game['copCheckResult'] | undefined;
        if (copCheck?.used && copCheck?.targetId) {
             const targetPlayer = players.find(p => p.id === copCheck.targetId);
             if (targetPlayer) {
                 copCheckRevealData = { targetId: targetPlayer.id, targetAlias: targetPlayer.alias!, isKiller: targetPlayer.role === 'killer' };
             }
        }

        // The witness info logic is moved to be calculated on the client-side during the 'night' phase

        if (nightAction.skipped || !nightAction.victimId) {
            transaction.update(gameRef, {
                gameState: 'discussion',
                turn: (game.turn || 1) + 1,
                discussionEndsAt: Timestamp.fromMillis(Date.now() + 4 * 60 * 1000),
                copCheckResult: copCheckRevealData || deleteField() as any,
                locationChoices: {}, // Reset for next night
                copCheck: { used: !!game.copCheck?.used }, // Reset target but keep used status
            });
            return;
        }

        let gameResult: Game['gameResult'] | undefined = undefined;
        
        const victim = players.find(p => p.id === nightAction.victimId);
        if (victim?.status === 'killed' && victim.role === 'detective') {
             gameResult = {
                winner: 'killer',
                message: `لقد نجح القاتل في اغتيال المحقق ${victim.alias}! القاتل ينتصر!`,
            };
        } else {
            const alivePlayers = players.filter(p => p.status === 'alive');
            const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian' || p.role === 'cop');
            const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer' || p.isTraitor);
            
            if (aliveKillerTeam.length >= aliveGoodTeam.length) {
                gameResult = {
                    winner: 'killer',
                    message: `عدد فريق القاتل أصبح مساويًا أو أكبر من الأبرياء. فريق القاتل ينتصر!`,
                };
            }
        }
        
        if (gameResult) {
            transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: gameResult,
            });
        } else {
            transaction.update(gameRef, {
                gameState: 'discussion',
                turn: (game.turn || 1) + 1,
                discussionEndsAt: Timestamp.fromMillis(Date.now() + 4 * 60 * 1000),
                copCheckResult: copCheckRevealData || deleteField() as any,
                locationChoices: {}, // Reset for next night
                copCheck: { used: !!game.copCheck?.used }, // Reset target but keep used status
            });
        }
    });
}

export async function submitMessage(gameId: string, playerId: string, text: string, asDetective: boolean) {
    if (!text.trim()) throw new Error("الرسالة لا يمكن أن تكون فارغة.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.alias) throw new Error("لم يتم العثور على اللاعب.");
        if (player.status !== 'alive') throw new Error("لا يمكنك إرسال رسائل.");

        if (asDetective && player.role !== 'detective') {
            throw new Error("فقط المحقق يمكنه التحدث بهذه الصفة.");
        }

        const updateData: Partial<Game> = {};
        const message: ChatMessage = {
            senderId: player.id,
            senderAlias: player.alias,
            isDetective: asDetective,
            text: text.trim(),
            timestamp: Timestamp.now(),
        };

        updateData.messages = arrayUnion(message) as any;
        transaction.update(gameRef, updateData);
    });
}

function _tallyVotesAndGetUpdates(game: Game, finalVotes: Record<string, string>): Partial<Game> {
    const voteCounts: Record<string, number> = {};
    for (const vote of Object.values(finalVotes)) {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    }

    let maxVotes = 0;
    let winningOptions: string[] = [];
    for (const option in voteCounts) {
        if (voteCounts[option] > maxVotes) {
            maxVotes = voteCounts[option];
            winningOptions = [option];
        } else if (voteCounts[option] === maxVotes && maxVotes > 0) {
            winningOptions.push(option);
        }
    }

    let updatedPlayers = [...game.players];
    let nextGameState: GameState = 'voting_results';
    let lastVoteResult: Game['lastVoteResult'] = { tied: false };
    let gameEndResult: Game['gameResult'] | undefined = undefined;

    if (winningOptions.length > 1) {
        lastVoteResult = { tied: true, message: 'حدث تعادل في الأصوات! لا أحد سيغادر هذه الجولة.' };
    } else if (winningOptions.length === 1) {
        const electedOption = winningOptions[0];

        if (electedOption === '__SKIP_VOTE__') {
            lastVoteResult = { tied: true, message: 'اختار أغلبية اللاعبين عدم التصويت. التحقيق مستمر.' };
        } else {
            const eliminatedPlayerId = electedOption;
            const eliminatedPlayerIndex = updatedPlayers.findIndex(p => p.id === eliminatedPlayerId);
            const eliminatedPlayer = updatedPlayers[eliminatedPlayerIndex];

            if (eliminatedPlayer) {
                updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
                lastVoteResult = { 
                    tied: false, 
                    message: `تم التصويت لإقصاء ${eliminatedPlayer.alias}.`,
                    eliminatedPlayerAlias: eliminatedPlayer.alias,
                    eliminatedPlayerRole: eliminatedPlayer.role,
                    isTraitor: eliminatedPlayer.isTraitor
                };
                if (eliminatedPlayer.role === 'killer') {
                    nextGameState = 'ended';
                    gameEndResult = {
                        winner: 'detective_civilians',
                        message: `تم كشف القاتل ${eliminatedPlayer.alias}! المحقق والمدنيون ينتصرون!`,
                    };
                } else if (eliminatedPlayer.role === 'detective') {
                    nextGameState = 'ended';
                    gameEndResult = {
                        winner: 'killer',
                        message: `تم طرد المحقق ${eliminatedPlayer.alias}! القاتل ينتصر!`,
                    };
                }
            }
        }
    } else {
        lastVoteResult = { tied: true, message: 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.' };
    }

    return {
        players: updatedPlayers,
        gameState: nextGameState,
        lastVoteResult: lastVoteResult,
        gameResult: gameEndResult || (deleteField() as any),
        discussionEndsAt: deleteField() as any,
    };
}


export async function submitVote(gameId: string, voterId: string, votedForId: string) {
    if (!votedForId) throw new Error("يجب عليك اختيار لاعب للتصويت عليه.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'discussion') throw new Error("ليس وقت التصويت الآن.");

        const voter = game.players.find(p => p.id === voterId);
        if (!voter || (voter.status !== 'alive')) {
            throw new Error("لا يمكنك التصويت.");
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
        const eligibleVoters = game.players.filter(p => p.status === 'alive');
        
        if (Object.keys(newVotes).length < eligibleVoters.length) {
            transaction.update(gameRef, { votes: newVotes });
            return;
        }

        const updates = _tallyVotesAndGetUpdates(game, newVotes);
        transaction.update(gameRef, updates);
    });
}

export async function detectiveArrest(gameId: string, detectiveId: string, suspectId: string) {
    if (!suspectId) throw new Error("يجب اختيار مشتبه به للاعتقال.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const detective = game.players.find(p => p.id === detectiveId);
        if (!detective || detective.role !== 'detective' || detective.status !== 'alive') {
            throw new Error("فقط المحقق الحي يمكنه تنفيذ الاعتقال.");
        }
        if (game.detectiveArrest?.used) {
            throw new Error("لقد استخدمت قدرة الاعتقال بالفعل.");
        }
        
        const suspectIndex = game.players.findIndex(p => p.id === suspectId);
        if (suspectIndex === -1) throw new Error("المشتبه به غير موجود.");
        
        let updatedPlayers = [...game.players];
        const suspect = updatedPlayers[suspectIndex];
        if(suspect.status !== 'alive') throw new Error("لا يمكن اعتقال لاعب غير حي.");

        let gameResult: Game['gameResult'];
        let nextGameState: GameState = 'ended';
        updatedPlayers[suspectIndex].status = 'arrested';

        if (suspect.role === 'killer') {
            gameResult = {
                winner: 'detective_civilians',
                message: `اعتقال صائب! المحقق ${detective.alias} قبض على القاتل ${suspect.alias}. انتصار ساحق!`,
            }
        } else {
            gameResult = {
                winner: 'killer',
                message: `اعتقال خاطئ! المحقق ${detective.alias} قبض على البريء ${suspect.alias}. القاتل ينتصر!`,
            }
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            gameResult: gameResult,
            'detectiveArrest.used': true,
            discussionEndsAt: deleteField() as any,
        });
    });
}

export async function continueToNextNight(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'voting_results') throw new Error("لا يمكن بدء الليلة التالية الآن.");
        
        const alivePlayers = game.players.filter(p => p.status === 'alive');
        const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian' || p.role === 'cop');
        const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer' || p.isTraitor);
        
        if (aliveKillerTeam.length >= aliveGoodTeam.length) {
             transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: {
                    winner: 'killer',
                    message: `عدد فريق القاتل أصبح مساويًا أو أكبر من الأبرياء. فريق القاتل ينتصر!`,
                }
             });
        } else {
             transaction.update(gameRef, {
                gameState: 'night',
                turn: (game.turn || 1) + 1,
                nightAction: {},
                votes: {},
                lastVoteResult: {},
                messages: [],
                detectiveAlert: deleteField() as any,
                witnessInfo: deleteField() as any,
                copCheckResult: deleteField() as any,
            });
        }
    });
}

export async function endVoteByTimer(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            
            const game = gameDoc.data() as Game;
            if (game.gameState !== 'discussion' || !game.discussionEndsAt) return;

            if (Date.now() < game.discussionEndsAt.toMillis()) return;

            const eligibleVoters = game.players.filter(p => p.status === 'alive');
            const finalVotes = { ...(game.votes || {}) };

            for (const player of eligibleVoters) {
                if (!finalVotes[player.id]) {
                    finalVotes[player.id] = '__SKIP_VOTE__';
                }
            }
            
            const updates = _tallyVotesAndGetUpdates(game, finalVotes);
            transaction.update(gameRef, updates);
        });
        return { success: true };
    } catch (error) {
        console.error("Error in endVoteByTimer:", error);
        return { error: 'حدث خطأ أثناء إنهاء التصويت.' };
    }
}

export async function witnessSidesWithKiller(gameId: string, witnessId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const witnessIndex = game.players.findIndex(p => p.id === witnessId);
        if (witnessIndex === -1) throw new Error("لم يتم العثور على الشاهد.");
        const witness = game.players[witnessIndex];


        if (!witness || witness.role !== 'witness') {
            throw new Error("Only the witness can perform this action.");
        }
        if (game.players.length < 5) {
            throw new Error("This action is only available for 5 or more players.");
        }
        if (game.turn !== 1) {
            throw new Error("يمكن للشاهد الانحياز للقاتل في اليوم الأول فقط.");
        }

        const updatedPlayers = [...game.players];
        updatedPlayers[witnessIndex].isTraitor = true;

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function copCheckPlayer(gameId: string, copId: string, targetId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const cop = game.players.find(p => p.id === copId);
        if (!cop || cop.role !== 'cop') throw new Error("Only the cop can perform this action.");
        if (game.copCheck?.used) throw new Error("لقد استخدمت قدرة التحقق مرة واحدة بالفعل.");

        const target = game.players.find(p => p.id === targetId);
        if (!target || target.status !== 'alive') throw new Error("Invalid target.");
        if (target.id === copId) throw new Error("You cannot check yourself.");

        transaction.update(gameRef, {
            copCheck: { used: true, targetId: targetId }
        });
    });
}
    