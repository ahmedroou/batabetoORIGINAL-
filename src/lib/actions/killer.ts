
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
import type { Player, Game, GameState, CrimeScene, ChatMessage } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';
import { generateNewCrimeScene } from '@/app/actions';
import { getPlayerNumberMap } from './helpers';

export async function startKillerGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        // Security rule `request.auth.uid == resource.data.hostId` handles authorization
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

            const rolesToAssign: ('killer' | 'detective' | 'witness' | 'civilian')[] = ['killer', 'detective', 'witness'];
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

export async function skipNightKill(gameId: string, killerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك تخطي القتل الآن.");
        const killer = game.players.find(p => p.id === killerId);
        if (!killer || killer.role !== 'killer') throw new Error("لست القاتل.");
        if (game.killerSkipUsed) throw new Error("لقد استخدمت هذه الميزة بالفعل.");

        transaction.update(gameRef, {
            killerSkipUsed: true,
            gameState: 'victim_reveal',
            nightAction: { skipped: true },
            votes: {},
            messages: [],
            lastVoteResult: {},
        });
    });
}

export async function performNightKill(gameId: string, killerId: string, victimId: string, method: string, isTargetingDetective: boolean) {
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

        const victimIndex = game.players.findIndex(p => p.id === victimId);
        if (victimIndex === -1) throw new Error("لم يتم العثور على الضحية.");
        const victim = game.players[victimIndex];
        if (victim.status !== 'alive') throw new Error("هذا اللاعب ليس على قيد الحياة.");
        if (victim.isImmune) throw new Error("لا يمكن استهداف هذا اللاعب مرة أخرى.");

        let updatedPlayers = [...game.players];
        let witnessInfo: Game['witnessInfo'] | undefined = undefined;
        let nightActionResult: Game['nightAction'] = {};

        const witness = updatedPlayers.find(p => p.role === 'witness' && p.status === 'alive');
        const playerNumberMap = getPlayerNumberMap(updatedPlayers);
        const killerPlayerNumber = playerNumberMap[killer.id];

        if (isTargetingDetective) {
            if (victim.role === 'detective') {
                updatedPlayers[victimIndex].status = 'killed';
                nightActionResult = { victimId, method: method.trim(), victimAlias: victim.alias };
            } else {
                if (witness) {
                    witnessInfo = { 
                        killerId: killer.id, 
                        killerAlias: killer.alias || killer.name,
                        killerPlayerNumber: killerPlayerNumber,
                        victimId: victim.id,
                        victimAlias: victim.alias || victim.name,
                        method: method.trim(),
                        reason: 'assassination_failed'
                    };
                }
            }
        } else {
            if (victim.role === 'detective') {
                updatedPlayers[victimIndex].isImmune = true; 
                if (witness) {
                    witnessInfo = {
                        killerId: killer.id,
                        killerAlias: killer.alias || killer.name,
                        killerPlayerNumber: killerPlayerNumber,
                        victimId: victim.id,
                        victimAlias: victim.alias || victim.name,
                        method: method.trim(),
                        reason: 'detective_survived'
                    };
                }
            } else {
                updatedPlayers[victimIndex].status = 'killed';
                nightActionResult = { victimId, method: method.trim(), victimAlias: victim.alias };
            }
        }
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'victim_reveal',
            witnessInfo: witnessInfo || deleteField() as any,
            nightAction: nightActionResult,
            votes: {},
            messages: [],
            lastVoteResult: {},
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

        const { nightAction, players } = game;
        if (!nightAction) throw new Error("Night action details are missing.");

        if (nightAction.skipped || !nightAction.victimId) {
            transaction.update(gameRef, {
                gameState: 'discussion',
                turn: (game.turn || 1) + 1,
                discussionEndsAt: Timestamp.fromMillis(Date.now() + 4 * 60 * 1000),
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
            const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian');
            const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer');
            
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
            });
        }
    });
}

export async function submitMessage(gameId: string, playerId: string, text: string) {
    if (!text.trim()) throw new Error("الرسالة لا يمكن أن تكون فارغة.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.alias) throw new Error("لم يتم العثور على اللاعب.");
        if (player.status === 'killed' || player.status === 'arrested') throw new Error("لا يمكنك إرسال رسائل.");

        const updateData: Partial<Game> = {};
        const message: ChatMessage = {
            senderId: player.id,
            senderAlias: player.alias,
            isDetective: player.role === 'detective',
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
                lastVoteResult = { tied: false, message: `تم التصويت لإقصاء ${eliminatedPlayer.alias}.` };
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

        if (suspect.role === 'killer') {
            updatedPlayers[suspectIndex].status = 'arrested';
            gameResult = {
                winner: 'detective_civilians',
                message: `اعتقال صائب! المحقق ${detective.alias} قبض على القاتل ${suspect.alias}. انتصار ساحق!`,
            }
        } else {
            updatedPlayers[suspectIndex].status = 'arrested';
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
        const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian');
        const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer');
        
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

    