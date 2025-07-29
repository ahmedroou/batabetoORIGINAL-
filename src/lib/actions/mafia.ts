
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
            const roleId = shuffledRoles[index];
            const roleInfo = MAFIA_ROLES.find(r => r.id === roleId) as Role;
            return {
                ...player,
                role: roleId,
                status: 'alive' as const,
                isProtected: false,
                apparentRole: roleId,
                team: roleInfo.team,
            };
        });

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'role_reveal', // مرحلة الكشف عن الأدوار
            round: 1,
            playerScores: {}, // إعادة تعيين النقاط
            mafiaState: {
                ...game.mafiaState,
                phase: 'night', // تبدأ الليلة الأولى بعد كشف الأدوار
                night: 1,
                events: [],
                nightActions: {},
                killedPlayer: null,
                savedPlayer: null,
                investigationResult: null,
                spyResult: null,
                lastVotedOut: null,
                timerEndsAt: Timestamp.fromMillis(Date.now() + 15 * 1000), // 15 ثانية للكشف عن الأدوار
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

            // منطق التقدم بناءً على الحالة الحالية
            switch (game.gameState) {
                case 'role_reveal':
                    if (timerExpired) {
                        await progressToNight(game.id, transaction);
                    }
                    break;
                case 'night':
                    const alivePlayers = game.players.filter(p => p.status === 'alive');
                    const nightActionsDone = alivePlayers.every(p => {
                        const role = MAFIA_ROLES.find(r => r.id === p.role);
                        // الأدوار التي تتطلب إجراء ليلي: القاتل، الطبيب، المحقق، الجاسوس، المتفجر، المتحول
                        const canAct = role && ['killer', 'doctor', 'detective', 'spy', 'explosive', 'shifter'].includes(role.id);
                        return !canAct || (game.mafiaState?.nightActions?.[p.id] !== undefined);
                    });
                    if (timerExpired || nightActionsDone) {
                        await processNight(game.id, transaction);
                    }
                    break;
                case 'discussion':
                    if (timerExpired) {
                        transaction.update(gameRef, {
                            gameState: 'voting',
                            'mafiaState.phase': 'voting',
                            'mafiaState.votes': {}, // إعادة تعيين الأصوات لكل مرحلة تصويت جديدة
                            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.mafiaState?.settings?.votingDuration || 60) * 1000)
                        });
                    }
                    break;
                case 'voting':
                    const aliveVotingPlayers = game.players.filter(p => p.status === 'alive');
                    // كل اللاعبين الأحياء الذين لم يصوتوا بعد، يجب أن يصوتوا أو ينتهي المؤقت
                    const votingDone = aliveVotingPlayers.every(p => game.mafiaState?.votes?.[p.id] !== undefined);
                    if (timerExpired || votingDone) {
                        await processVotes(game.id, transaction);
                    }
                    break;
                case 'voting_results':
                    if (timerExpired) {
                        // بعد عرض نتائج التصويت، ننتقل إلى الليل التالي أو نهاية اللعبة
                        await progressToNight(game.id, transaction);
                    }
                    break;
                case 'final_results':
                    // لا تفعل شيئاً، اللعبة انتهت
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

        if (game.gameState !== 'night') return; // يمكن للاعبين إرسال الإجراءات فقط في مرحلة الليل

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("You cannot perform an action.");

        const role = MAFIA_ROLES.find(r => r.id === player.role);
        if (!role || !['killer', 'doctor', 'detective', 'spy', 'explosive', 'shifter'].includes(role.id)) {
            throw new Error("Your role does not have a night action.");
        }

        // تحققات إضافية للإجراءات المحددة
        if (role.id === 'killer' && !action.killTarget) throw new Error("Killer action requires a kill target.");
        if (role.id === 'doctor' && !action.targetId) throw new Error("Doctor action requires a target to save.");
        if (role.id === 'detective' && !action.targetId) throw new Error("Detective action requires a target to investigate.");
        if (role.id === 'spy' && !action.targetId) throw new Error("Spy action requires a target to spy on.");
        if (role.id === 'explosive' && !action.targetId) throw new Error("Explosive action requires a target for the trap.");
        if (role.id === 'shifter' && !action.disguiseAs) throw new Error("Shifter action requires a role to disguise as.");


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

    const nightDuration = game.mafiaState?.settings?.nightDuration || 70; // 70 ثانية كقيمة افتراضية

    // إعادة تعيين حالة الليلة لبدء ليلة جديدة
    transaction.update(gameRef, {
        gameState: 'night',
        'mafiaState.phase': 'night',
        'mafiaState.night': (game.mafiaState?.night || 0) + 1, // زيادة رقم الليلة
        'mafiaState.nightActions': {}, // مسح إجراءات الليلة السابقة
        'mafiaState.events': [], // مسح أحداث الليلة السابقة
        'mafiaState.killedPlayer': null, // إعادة تعيين اللاعب المقتول
        'mafiaState.savedPlayer': null, // إعادة تعيين اللاعب الذي تم إنقاذه
        'mafiaState.investigationResult': null, // إعادة تعيين نتيجة التحقيق
        'mafiaState.spyResult': null, // إعادة تعيين نتيجة التجسس
        'mafiaState.lastVotedOut': null, // مسح آخر لاعب تم التصويت عليه
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightDuration * 1000)
    });

    // إعادة تعيين isProtected لجميع اللاعبين في بداية كل ليلة
    const playersResetProtection = game.players.map(p => ({ ...p, isProtected: false }));
    transaction.update(gameRef, { players: playersResetProtection });
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
    const nightResults: NightResult[] = [];

    // البحث عن اللاعبين الأحياء ذوي الأدوار الخاصة
    const alivePlayers = updatedPlayers.filter(p => p.status === 'alive');
    const killer = alivePlayers.find(p => p.role === 'killer');
    const doctor = alivePlayers.find(p => p.role === 'doctor');
    const detective = alivePlayers.find(p => p.role === 'detective');
    const spy = alivePlayers.find(p => p.role === 'spy');
    const explosive = alivePlayers.find(p => p.role === 'explosive');
    
    const shfIndex = updatedPlayers.findIndex(p => p.role === 'shifter' && p.status === 'alive');


    let killedPlayerId: string | null = null;
    let savedPlayerId: string | null = null;
    let investigationResult: { playerId: string; role: MafiaRole; team: Team } | null = null;
    let spyResult: { playerId: string; role: MafiaRole; isShifter: boolean; isSoldier: boolean } | null = null;
    let explosiveDetonationTargetId: string | null = null;


    // 1. إجراءات المتحول (Shifter): تغيير الدور الظاهري
    if (shfIndex !== -1) {
        const shifter = updatedPlayers[shfIndex];
        if (shifter && nightActions[shifter.id]?.disguiseAs) {
            updatedPlayers[shfIndex].apparentRole = nightActions[shifter.id]!.disguiseAs as MafiaRole;
        }
    }


    // 2. إجراءات الطبيب: الحماية
    if (doctor && nightActions[doctor.id]?.targetId) {
        savedPlayerId = nightActions[doctor.id]!.targetId!;
        const savedPlayerIndex = updatedPlayers.findIndex(p => p.id === savedPlayerId);
        if (savedPlayerIndex !== -1) {
            updatedPlayers[savedPlayerIndex].isProtected = true; // يتم وضع علامة على اللاعب المحمي
            nightResults.push({ type: 'save_attempt', targetId: savedPlayerId, message: `The Doctor attempted to save someone.` });
        }
    }

    // 3. إجراءات القاتل: القتل
    if (killer && nightActions[killer.id]?.killTarget) {
        const targetId = nightActions[killer.id]!.killTarget!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);

        if (targetPlayer) {
            if (targetPlayer.isProtected) {
                // اللاعب محمي من قبل الطبيب
                nightResults.push({ type: 'save_success', targetId: targetId, message: `The Doctor successfully saved ${targetPlayer.name}!` });
            } else if (targetPlayer.role === 'soldier') {
                // الجندي لا يتأثر بالقتل الليلي
                nightResults.push({ type: 'soldier_save', targetId: targetId, message: `${targetPlayer.name}, the Soldier, survived the attack!` });
            } else {
                // القتل يتم بنجاح
                killedPlayerId = targetId;
            }
        }
    }

    // 4. معالجة "المفجر" (Explosive) إذا تم قتله
    // هذا يجب أن يحدث قبل تطبيق القتل الفعلي
    if (explosive && killedPlayerId && killedPlayerId === explosive.id) {
        const expAction = nightActions[explosive.id];
        if (expAction?.targetId) {
            explosiveDetonationTargetId = expAction.targetId;
            nightResults.push({ type: 'explosive_activated', message: `${explosive.name}, the Explosive, activated their trap!` });
        }
    }
    
    // 5. تطبيق القتل الرئيسي (القاتل)
    if (killedPlayerId) {
        const killedPlayerIndex = updatedPlayers.findIndex(p => p.id === killedPlayerId);
        if (killedPlayerIndex !== -1) {
            updatedPlayers[killedPlayerIndex].status = 'killed';
            nightResults.push({ type: 'death', playerId: killedPlayerId, message: `${updatedPlayers[killedPlayerIndex].name} was killed during the night.` });
        }
    }

    // 6. تطبيق انفجار المفجر (بعد القتل الرئيسي)
    if (explosiveDetonationTargetId) {
        const finalTargetIndex = updatedPlayers.findIndex(p => p.id === explosiveDetonationTargetId);
        if (finalTargetIndex !== -1 && updatedPlayers[finalTargetIndex].status === 'alive') { // تأكد أن الهدف لا يزال حيا
            updatedPlayers[finalTargetIndex].status = 'killed';
            nightResults.push({ type: 'death', playerId: explosiveDetonationTargetId, message: `${updatedPlayers[finalTargetIndex].name} was taken down by the Explosive's trap!` });
        }
    }


    // 7. إجراءات المحقق: التحقيق
    if (detective && nightActions[detective.id]?.targetId) {
        const targetId = nightActions[detective.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
            const roleInfo = MAFIA_ROLES.find(r => r.id === targetPlayer.role)!; // يجب أن يكون موجوداً
            investigationResult = { playerId: targetId, role: targetPlayer.role!, team: roleInfo.team };
            nightResults.push({ type: 'investigation_attempt', targetId: targetId, message: `The Detective investigated ${targetPlayer.name}.` });
        }
    }

    // 8. إجراءات الجاسوس: التجسس
    if (spy && nightActions[spy.id]?.targetId) {
        const targetId = nightActions[spy.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
            if (targetPlayer.role === 'soldier') {
                spyResult = { playerId: targetId, role: 'soldier', isShifter: false, isSoldier: true };
            } else {
                const apparentRole = targetPlayer.apparentRole || targetPlayer.role;
                spyResult = { playerId: targetId, role: apparentRole!, isShifter: targetPlayer.role === 'shifter', isSoldier: false };
            }
            nightResults.push({ type: 'spy_attempt', targetId: targetId, message: `The Spy spied on ${targetPlayer.name}.` });
        }
    }

    const discussionDuration = game.mafiaState?.settings?.discussionDuration || 180; // 180 ثانية كقيمة افتراضية

    // تحديث حالة اللعبة بعد معالجة الليل
    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        'mafiaState.phase': 'discussion',
        'mafiaState.events': nightResults,
        'mafiaState.killedPlayer': killedPlayerId, // اللاعب المقتول فعلياً
        'mafiaState.savedPlayer': savedPlayerId, // اللاعب الذي حاول الطبيب إنقاذه (قد لا يكون هو نفسه من نجا)
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

        if (game.gameState !== 'voting') return; // يمكن التصويت فقط في مرحلة التصويت

        const player = game.players.find(p => p.id === voterId);
        if (!player || player.status !== 'alive') throw new Error("Only alive players can vote.");

        // إذا كان targetId موجوداً، يجب أن يكون لاعباً حياً آخر
        if (targetId) {
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
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    const totalVotesAvailable = alivePlayers.length;

    // حساب الأصوات لكل لاعب
    Object.values(votes).forEach(targetId => {
        if (targetId) { // تجاهل الأصوات الفارغة (عدم التصويت)
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const playersWithMaxVotes = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    let playerVotedOutId: string | null = null;
    let updatedPlayers = [...game.players];
    let isTie = playersWithMaxVotes.length !== 1;

    // If maxVotes is less than half the total votes, it's considered a tie (no majority)
    if (maxVotes <= Math.floor(totalVotesAvailable / 2)) {
        isTie = true;
    }

    if (!isTie) {
        playerVotedOutId = playersWithMaxVotes[0];
        const votedPlayerIndex = updatedPlayers.findIndex(p => p.id === playerVotedOutId);
        if (votedPlayerIndex !== -1) {
            updatedPlayers[votedPlayerIndex].status = 'voted_out';
        }
    }

    // Check for win conditions AFTER processing the vote
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

    // If game is not over, proceed to voting_results
    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'voting_results',
        'mafiaState.phase': 'voting_results',
        'mafiaState.votes': {}, // Clear votes for next round
        'mafiaState.lastVotedOut': {
            playerId: playerVotedOutId,
            tie: isTie,
        },
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + 10 * 1000) // 10s to show results
    });
}


/**
 * تتحقق من شروط الفوز في اللعبة.
 * @param {Game} game - كائن اللعبة الحالي.
 * @returns {{ isGameOver: boolean; winner?: 'good' | 'mafia'; message?: string }} - كائن يشير إلى ما إذا كانت اللعبة قد انتهت، ومن هو الفائز، ورسالة الفوز.
 */
function checkWinConditions(game: Game): { isGameOver: boolean; winner?: 'good' | 'mafia'; message?: string } {
    const alivePlayers = game.players.filter(p => p.status === 'alive');

    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');
    
    // شرط فوز فريق "الخير": جميع أفراد المافيا (القتلة) خارج اللعبة
    const aliveKillers = alivePlayers.filter(p => p.role === 'killer');
    if (aliveKillers.length === 0) {
        return { isGameOver: true, winner: 'good', message: 'لقد نجح فريق الخير في القضاء على جميع القتلة!' };
    }

    // شرط فوز فريق "المافيا": عدد أفراد المافيا الأحياء أكبر من أو يساوي عدد أفراد فريق "الخير" الأحياء
    if (mafiaTeam.length >= goodTeam.length) {
        return { isGameOver: true, winner: 'mafia', message: 'لقد سيطرت المافيا على المدينة!' };
    }
    
    // إذا لم يتحقق أي من الشروط أعلاه، تستمر اللعبة
    return { isGameOver: false };
}
