/**
 * @fileoverview Actions specific to the "Mafia" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    Transaction,
    arrayUnion,
} from 'firebase/firestore';
import type { Game, Player, NightAction, NightResult, Role, MafiaRole, Team } from '@/types';
import { getPlayerFromUserId } from './helpers';
import { MAFIA_ROLES, getRoleDistribution } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';


/**
 * وظيفة لخلط عناصر مصفوفة بشكل عشوائي.
 * @param {any[]} array - المصفوفة المراد خلطها.
 * @returns {any[]} المصفوفة المخلطة.
 */
function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

/**
 * تقوم بتحديث إعدادات اللعبة.
 * @param {string} gameId - معرف اللعبة.
 * @param {string} hostId - معرف المضيف.
 * @param {{ nightDuration: number, discussionDuration: number, votingDuration: number }} settings - الإعدادات الجديدة.
 * @throws {Error} إذا لم يتم العثور على اللعبة، أو إذا لم يكن المستخدم هو المضيف، أو إذا لم تكن اللعبة في مرحلة "الردهة".
 */
export async function updateGameSettings(gameId: string, hostId: string, settings: { nightDuration: number, discussionDuration: number, votingDuration: number }) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'mafiaState.settings': settings });
    });
}

/**
 * تبدأ اللعبة وتوزع الأدوار على اللاعبين.
 * @param {string} gameId - معرف اللعبة.
 * @param {string} hostId - معرف المضيف.
 * @throws {Error} إذا لم يتم العثور على اللعبة، أو إذا لم يكن المستخدم هو المضيف، أو إذا كان عدد اللاعبين أقل من 4.
 */
export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");

        const rolesToDistribute = getRoleDistribution(game.players.length);
        const shuffledRoles = shuffle(rolesToDistribute);
        
        const updatedPlayers = game.players.map((player, index) => {
            const roleId = shuffledRoles[index] as MafiaRole;
            const roleInfo = MAFIA_ROLES.find(r => r.id === roleId);
            if (!roleInfo) throw new Error(`Role with id ${roleId} not found.`); // Defensive check
            return {
                ...player,
                role: roleId,
                team: roleInfo.team,
                status: 'alive' as const,
                isProtected: false,
                apparentRole: roleId,
            };
        });
        
        const roleRevealDuration = 15; // 15 seconds to view roles

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'role_reveal', 
            round: 1,
            playerScores: {}, 
            mafiaState: {
                ...game.mafiaState,
                phase: 'role_reveal', 
                rolesInGame: rolesToDistribute, // Store the initial roles
                night: 1,
                events: [],
                nightActions: {},
                killedPlayer: null,
                savedPlayer: null,
                investigationResult: null,
                spyResult: null,
                lastVotedOut: null,
                timerEndsAt: Timestamp.fromMillis(Date.now() + roleRevealDuration * 1000), 
            }
        });
    });
}

/**
 * يتقدم المضيف إلى المرحلة التالية من اللعبة.
 * يتحقق من انتهاء الوقت أو اكتمال الإجراءات قبل التقدم.
 * @param {string} gameId - معرف اللعبة.
 * @param {string} hostId - معرف المضيف.
 */
export async function hostProgressNextPhase(gameId: string, hostId: string) {
    if (!gameId) {
        console.error("hostProgressNextPhase called with invalid gameId");
        return;
    }

    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                console.warn(`Game ${gameId} not found during phase progression.`);
                return;
            }
            const game = gameDoc.data() as Game;
            if (!game.id) game.id = gameDoc.id; // Ensure game object has id

            if (game.hostId !== hostId) {
                console.warn(`User ${hostId} is not the host of game ${gameId}.`);
                return;
            }

            const timerExpired = !game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis();
            
            if (!timerExpired) return; // Only progress if timer is actually expired

            // منطق التقدم بناءً على الحالة الحالية
            switch (game.gameState) {
                case 'role_reveal':
                    await progressToNight(game.id, transaction);
                    break;
                case 'night':
                    await processNight(game.id, transaction);
                    break;
                case 'discussion':
                    transaction.update(gameRef, {
                        gameState: 'voting',
                        'mafiaState.phase': 'voting',
                        'mafiaState.votes': {},
                        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.mafiaState?.settings?.votingDuration || 60) * 1000)
                    });
                    break;
                case 'voting':
                    await processVotes(game.id, transaction);
                    break;
                case 'voting_results':
                     if (game.id) { // Check if game.id is defined before calling
                         await progressToNight(game.id, transaction);
                    }
                    break;
                case 'final_results':
                    break;
                default:
                    console.warn(`Unhandled game state: ${game.gameState} for game ${gameId}`);
                    break;
            }
        });
    } catch (error) {
        console.error(`Error progressing phase for game ${gameId}:`, error);
        throw error;
    }
}


/**
 * يرسل اللاعب إجراءه الليلي.
 * @param {string} gameId - معرف اللعبة.
 * @param {string} playerId - معرف اللاعب الذي يرسل الإجراء.
 * @param {NightAction} action - الإجراء الليلي (مثلاً: قتل، حماية، تحقيق).
 * @throws {Error} إذا لم يتم العثور على اللعبة، أو إذا لم تكن اللعبة في مرحلة الليل، أو إذا لم يكن اللاعب موجوداً/حياً.
 */
export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') return; 

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("You cannot perform an action.");

        const role = MAFIA_ROLES.find(r => r.id === player.role);
        if (!role || !['killer', 'doctor', 'detective', 'spy', 'explosive', 'shifter'].includes(role.id)) {
            throw new Error("Your role does not have a night action.");
        }
        
        transaction.update(gameRef, {
            [`mafiaState.nightActions.${playerId}`]: action
        });
    });
}

/**
 * تقوم بتقدم اللعبة إلى مرحلة الليل الجديدة أو إنهاء اللعبة إذا تحققت شروط الفوز.
 * هذه الدالة تُستخدم كجزء من عملية `hostProgressNextPhase` وتُنفذ ضمن `runTransaction`.
 * @param {string} gameId - معرف اللعبة.
 * @param {Transaction} transaction - كائن المعاملة الحالي.
 * @throws {Error} إذا لم يتم العثور على اللعبة.
 */
async function progressToNight(gameId: string, transaction: Transaction) {
    if (!gameId) {
        console.error("progressToNight called with undefined gameId");
        throw new Error("Internal server error: gameId is undefined.");
    }
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for progressing to night");
    const game = gameDoc.data() as Game;

    const winCondition = checkWinConditions(game);
    if (winCondition.isGameOver) {
        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        await updateLeagueScoresForGameEnd(game, transaction);
        return;
    }

    const nightDuration = game.mafiaState?.settings?.nightDuration || 70;

    const playersResetForNight = game.players.map(p => ({
        ...p,
        isProtected: false, 
    }));

    transaction.update(gameRef, {
        players: playersResetForNight,
        gameState: 'night',
        'mafiaState.phase': 'night',
        'mafiaState.night': (game.mafiaState?.night || 0) + 1,
        'mafiaState.nightActions': {}, 
        'mafiaState.events': [], 
        'mafiaState.killedPlayer': null, 
        'mafiaState.savedPlayer': null, 
        'mafiaState.investigationResult': null, 
        'mafiaState.spyResult': null, 
        'mafiaState.lastVotedOut': null, 
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightDuration * 1000)
    });
}

/**
 * تقوم بمعالجة الإجراءات الليلية وتحديث حالة اللعبة.
 * هذه الدالة تُستخدم كجزء من عملية `hostProgressNextPhase` وتُنفذ ضمن `runTransaction`.
 * @param {string} gameId - معرف اللعبة.
 * @param {Transaction} transaction - كائن المعاملة الحالي.
 * @throws {Error} إذا لم يتم العثور على اللعبة.
 */
async function processNight(gameId: string, transaction: Transaction) {
    if (!gameId) {
        console.error("processNight called with undefined gameId");
        throw new Error("Internal server error: gameId is undefined.");
    }
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing night.");
    const game = gameDoc.data() as Game;

    let updatedPlayers = [...game.players];
    const nightActions = game.mafiaState?.nightActions || {};
    const nightEvents: NightResult[] = [];

    const alivePlayers = updatedPlayers.filter(p => p.status === 'alive');
    
    // 1. Shifter's action (choosing disguise)
    const shifter = alivePlayers.find(p => p.role === 'shifter');
    if (shifter && nightActions[shifter.id]?.disguiseAs) {
        const shifterIndex = updatedPlayers.findIndex(p => p.id === shifter.id);
        if(shifterIndex !== -1) {
            updatedPlayers[shifterIndex].apparentRole = nightActions[shifter.id]!.disguiseAs;
        }
    }
    
    // 2. Doctor's action
    const doctor = alivePlayers.find(p => p.role === 'doctor');
    if (doctor && nightActions[doctor.id]?.targetId) {
        const savedPlayerId = nightActions[doctor.id]!.targetId!;
        const savedPlayerIndex = updatedPlayers.findIndex(p => p.id === savedPlayerId);
        if (savedPlayerIndex !== -1) {
            updatedPlayers[savedPlayerIndex].isProtected = true;
        }
    }

    // 3. Spy's action
    let spyResult: { playerId: string; role: MafiaRole; isShifter: boolean; isSoldier: boolean } | null = null;
    const spy = alivePlayers.find(p => p.role === 'spy');
    if (spy && nightActions[spy.id]?.targetId) {
        const targetId = nightActions[spy.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer?.role === 'soldier') {
            nightEvents.push({ type: 'spy_report', message: `فشلت محاولة التجسس! ${targetPlayer.name} جندي وقد كشفك.` });
        } else if (targetPlayer) {
             spyResult = { playerId: targetId, role: targetPlayer.apparentRole!, isShifter: targetPlayer.role === 'shifter', isSoldier: false };
        }
    }

    // 4. Killer's action & Explosive's reaction
    const killer = alivePlayers.find(p => p.role === 'killer');
    if (killer && nightActions[killer.id]?.killTarget) {
        const targetId = nightActions[killer.id]!.killTarget!;
        const targetPlayerIndex = updatedPlayers.findIndex(p => p.id === targetId);

        if (targetPlayerIndex !== -1 && updatedPlayers[targetPlayerIndex].status === 'alive') {
            const targetPlayer = updatedPlayers[targetPlayerIndex];
            if (targetPlayer.isProtected) {
                nightEvents.push({ type: 'save_success', message: `نجا ${targetPlayer.name} من هجوم بفضل الطبيب!` });
            } else {
                updatedPlayers[targetPlayerIndex].status = 'killed';
                nightEvents.push({ type: 'death', message: `قُتل اللاعب ${targetPlayer.name} (${MAFIA_ROLES.find(r => r.id === targetPlayer.role)?.name}) في الليل.` });

                // Check for Explosive retaliation
                const explosive = alivePlayers.find(p => p.id === targetId && p.role === 'explosive');
                if (explosive && nightActions[explosive.id]?.targetId) {
                    const explosiveVictimId = nightActions[explosive.id]!.targetId!;
                    const explosiveVictimIndex = updatedPlayers.findIndex(p => p.id === explosiveVictimId);
                    if (explosiveVictimIndex !== -1 && updatedPlayers[explosiveVictimIndex].status === 'alive') {
                         updatedPlayers[explosiveVictimIndex].status = 'killed';
                         const victim = updatedPlayers[explosiveVictimIndex];
                         nightEvents.push({ type: 'death', message: `قام ${explosive.name} بتفجير ${victim.name} (${MAFIA_ROLES.find(r => r.id === victim.role)?.name}) معه!` });
                    }
                }
            }
        }
    }

    // 5. Detective's action
    let investigationResult: { playerId: string; team: Team; } | null = null;
    const detective = alivePlayers.find(p => p.role === 'detective');
    if (detective && nightActions[detective.id]?.targetId) {
        const targetId = nightActions[detective.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
            investigationResult = { playerId: targetId, team: targetPlayer.team! };
        }
    }
    
    const discussionDuration = game.mafiaState?.settings?.discussionDuration || 180;

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        'mafiaState.phase': 'discussion',
        'mafiaState.events': nightEvents,
        'mafiaState.investigationResult': investigationResult,
        'mafiaState.spyResult': spyResult,
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + discussionDuration * 1000),
    });
}

/**
 * يرسل اللاعب صوته في مرحلة التصويت.
 * @param {string} gameId - معرف اللعبة.
 * @param {string} voterId - معرف اللاعب المصوت.
 * @param {string | null} targetId - معرف اللاعب الذي تم التصويت عليه، أو null لعدم التصويت.
 * @throws {Error} إذا لم يتم العثور على اللعبة.
 */
export async function submitVote(gameId: string, voterId: string, targetId: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'voting') return; 

        const player = game.players.find(p => p.id === voterId);
        if (!player || player.status !== 'alive') throw new Error("Only alive players can vote.");

        if (targetId && targetId !== "no_one") {
            const targetPlayer = game.players.find(p => p.id === targetId);
            if (!targetPlayer || targetPlayer.status !== 'alive') throw new Error("You can only vote for an alive player.");
        }

        const updatedVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
        transaction.update(gameRef, { 'mafiaState.votes': updatedVotes });
    });
}

/**
 * تعالج الأصوات وتحدد اللاعب الذي تم التصويت عليه.
 * هذه الدالة تُستخدم كجزء من عملية `hostProgressNextPhase` وتُنفذ ضمن `runTransaction`.
 * @param {string} gameId - معرف اللعبة.
 * @param {Transaction} transaction - كائن المعاملة الحالي.
 * @throws {Error} إذا لم يتم العثور على اللعبة.
 */
async function processVotes(gameId: string, transaction: Transaction) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing votes.");
    const game = gameDoc.data() as Game;

    const votes = game.mafiaState?.votes || {};
    const voteCounts: Record<string, number> = {};
    
    Object.values(votes).forEach(targetId => {
        if (targetId && targetId !== "no_one") {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const playersWithMaxVotes = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    let playerVotedOutId: string | null = null;
    let updatedPlayers = [...game.players];

    if (maxVotes > 0 && playersWithMaxVotes.length === 1) {
        playerVotedOutId = playersWithMaxVotes[0];
        const votedPlayerIndex = updatedPlayers.findIndex(p => p.id === playerVotedOutId);
        if (votedPlayerIndex !== -1) {
            updatedPlayers[votedPlayerIndex].status = 'voted_out';
        }
    }

    const freshGameData = { ...game, players: updatedPlayers };
    const winCondition = checkWinConditions(freshGameData);

    if (winCondition.isGameOver) {
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        await updateLeagueScoresForGameEnd(game, transaction);
        return;
    }

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'voting_results',
        'mafiaState.phase': 'voting_results',
        'mafiaState.votes': {}, 
        'mafiaState.lastVotedOut': {
            playerId: playerVotedOutId,
            tie: playersWithMaxVotes.length !== 1,
        },
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + 10 * 1000)
    });
}


/**
 * تتحقق من شروط الفوز في اللعبة.
 * @param {Game} game - كائن اللعبة الحالي.
 * @returns {{ isGameOver: boolean; winner?: 'good' | 'mafia'; message?: string }} - كائن يشير إلى ما إذا كانت اللعبة قد انتهت، ومن هو الفائز، ورسالة الفوز.
 */
function checkWinConditions(game: Game): { isGameOver: boolean; winner?: 'good' | 'mafia' | 'تعادل'; message?: string } {
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    if (alivePlayers.length === 0) {
        return { isGameOver: true, winner: 'تعادل', message: "لم ينجُ أحد!" };
    }

    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');
    
    if (mafiaTeam.length === 0) {
        return { isGameOver: true, winner: 'good', message: 'لقد نجح فريق الخير في القضاء على جميع أفراد المافيا!' };
    }

    if (mafiaTeam.length >= goodTeam.length) {
        return { isGameOver: true, winner: 'mafia', message: 'لقد سيطرت المافيا على المدينة!' };
    }
    
    return { isGameOver: false };
}
