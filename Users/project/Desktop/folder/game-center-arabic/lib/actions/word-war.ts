/**
 * @fileoverview Actions specific to the "Word War" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    query,
    where,
    getDocs,
    Timestamp,
    getDoc,
    FieldValue,
    increment,
    writeBatch,
    setDoc,
    deleteField,
    arrayUnion,
    updateDoc,
} from 'firebase/firestore';
import type { Game, Player, UserProfile, League, WordWarCard } from '@/types';
import { shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';

const generateCards = (): WordWarCard[] => {
    const words = [
        "شمس", "قمر", "نهر", "بحر", "جبل", "مدينة", "قرية", "بيت", "شجرة", "وردة",
        "كتاب", "قلم", "مدرسة", "طالب", "معلم", "درس", "امتحان", "نجاح", "فشل", "لغة",
        "سيارة", "طائرة", "قطار", "سفينة", "دراجة", "شارع", "إشارة", "مرور", "حادث", "طريق",
        "هاتف", "حاسوب", "إنترنت", "بريد", "رسالة", "موقع", "تطبيق", "معلومات", "بيانات", "شبكة",
        "طعام", "ماء", "فاكهة", "خضروات", "لحم", "دجاج", "سمك", "ملح", "سكر", "بهارات",
        "حب", "فرح", "حزن", "غضب", "خوف", "أمل", "سلام", "حرب", "موت", "حياة",
        "ذهب", "فضة", "نحاس", "حديد", "خشب", "زجاج", "ورق", "قماش", "جلد", "بلاستيك",
        "كرة", "لعبة", "فوز", "خسارة", "هدف", "نقطة", "دوري", "بطولة", "منافسة", "فريق",
        "صيف", "شتاء", "ربيع", "خريف", "طقس", "مطر", "ثلج", "ريح", "شمس", "حرارة",
        "أبيض", "أسود", "أحمر", "أخضر", "أزرق", "أصفر", "برتقالي", "بنفسجي", "وردي", "بني"
    ];

    const shuffledWords = shuffle(words).slice(0, 40);

    const redCards = shuffledWords.slice(0, 9).map(word => ({ text: word, color: 'red', revealed: false }));
    const blueCards = shuffledWords.slice(9, 17).map(word => ({ text: word, color: 'blue', revealed: false }));
    const neutralCards = shuffledWords.slice(17, 24).map(word => ({ text: word, color: 'neutral', revealed: false }));
    const assassinCard = { text: shuffledWords[24], color: 'assassin', revealed: false };
    const defaultCards = shuffledWords.slice(25, 40).map(word => ({ text: word, color: 'default', revealed: false }));
    
    const allCards = [...redCards, ...blueCards, ...neutralCards, assassinCard, ...defaultCards];
    return shuffle(allCards);
};

export async function updateGameSettings(gameId: string, hostId: string, settings: Game['wordWarState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'wordWarState.settings': settings });
    });
}

export async function randomizeTeams(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can randomize teams.");
        if (game.gameState !== 'lobby') throw new Error("Can only randomize teams in the lobby.");

        const shuffledPlayers = shuffle(game.players);
        const half = Math.ceil(shuffledPlayers.length / 2);
        const teamRed = shuffledPlayers.slice(0, half).map(p => ({ ...p, team: 'red' }));
        const teamBlue = shuffledPlayers.slice(half).map(p => ({ ...p, team: 'blue' }));

        const updatedPlayers = [...teamRed, ...teamBlue];
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function selectTeam(gameId: string, playerId: string, team: 'red' | 'blue') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("Player not found in game.");

        transaction.update(gameRef, {
            players: game.players.map(p => p.id === playerId ? { ...p, team: team } : p)
        });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");
        if (game.players.some(p => !p.team)) throw new Error("All players must be assigned to a team.");
        
        const cards = generateCards();
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        const redTeam = game.players.filter(p => p.team === 'red');
        const blueTeam = game.players.filter(p => p.team === 'blue');
        
        if (redTeam.length === 0 || blueTeam.length === 0) throw new Error("Each team must have at least one player.");

        const shuffledRedTeam = shuffle(redTeam);
        const shuffledBlueTeam = shuffle(blueTeam);
        const redGuideId = shuffledRedTeam[0].id;
        const blueGuideId = shuffledBlueTeam[0].id;
        
        transaction.update(gameRef, {
            gameState: 'preparation',
            'wordWarState.cards': cards,
            'wordWarState.turn': 'red',
            'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': { red: [], blue: [] },
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000),
        });
    });
}

export async function setGuide(gameId: string, hostId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change guides.");
        if (game.gameState !== 'lobby') throw new Error("Guides can only be changed in the lobby.");
        
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("Player not found.");

        transaction.update(gameRef, {
             players: game.players.map(p => p.id === playerId ? { ...p, team: player.team } : p),
            [`wordWarState.guides.${player.team}`]: playerId
        });
    });
}

export async function submitHint(gameId: string, playerId: string, word: string, count: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guide_turn') return;
        if (game.wordWarState.guides[game.wordWarState.turn] !== playerId) throw new Error("ليس دورك كمرشد.");
        
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guesser_turn',
            'wordWarState.currentHint': { word, count },
            'wordWarState.guessesLeft': count + 1, // +1 free guess.
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function revealCard(gameId: string, playerId: string, cardIndex: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;

        const card = game.wordWarState.cards[cardIndex];
        if (card.revealed) return; // Card already revealed.
        
        const currentTeam = game.wordWarState.turn;
        constguessesLeft = game.wordWarState.guessesLeft;

        const isCorrectTeam = card.color === currentTeam;
        const isNeutral = card.color === 'neutral';
        const isAssassin = card.color === 'assassin';

        let updates: any = {
             [`wordWarState.cards.${cardIndex}.revealed`]: true,
        };

        if (isAssassin) {
             updates.gameState = 'final_results';
             updates.gameResult = { winner: currentTeam === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
        } else if (isCorrectTeam && !isAssassin && guessesLeft > 1) {
             updates['wordWarState.guessesLeft'] = guessesLeft - 1;
        } else {
             const nextTeam = currentTeam === 'red' ? 'blue' : 'red';
             updates.gameState = 'guide_turn';
             updates['wordWarState.turn'] = nextTeam;
             updates['wordWarState.currentHint'] = null;
             updates['wordWarState.guessesLeft'] = 0;
             updates['wordWarState.suspicions'] = { red: [], blue: [] };
             updates['wordWarState.timerEndsAt'] = deleteField();
        }

        transaction.update(gameRef, updates);
    });
}

export async function endTurn(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;

        const currentTeam = game.wordWarState.turn;
        const nextTeam = currentTeam === 'red' ? 'blue' : 'red';

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTeam,
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': { red: [], blue: [] },
            'wordWarState.timerEndsAt': deleteField(),
        });
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return; // Only the host can trigger the timeout.
        if (!game.wordWarState?.timerEndsAt || Date.now() < game.wordWarState.timerEndsAt.toMillis()) {
            return; // Timer hasn't expired server-side.
        }
        
        if (game.gameState === 'preparation') {
             transaction.update(gameRef, {
                 gameState: 'guide_turn',
                  'wordWarState.timerEndsAt': deleteField(),
            });
            return;
        }

        if (game.gameState === 'guide_turn') {
            const playerId = game.wordWarState.guides[game.wordWarState.turn];
            transaction.update(gameRef, {
                gameState: 'guesser_turn',
                'wordWarState.currentHint': { word: 'انتهى الوقت', count: 1 },
                'wordWarState.guessesLeft': 2, // +1 free guess.
            });
        } else if (game.gameState === 'guesser_turn') {
            const currentTeam = game.wordWarState.turn;
            const nextTeam = currentTeam === 'red' ? 'blue' : 'red';

            transaction.update(gameRef, {
                gameState: 'guide_turn',
                'wordWarState.turn': nextTeam,
                'wordWarState.currentHint': null,
                'wordWarState.guessesLeft': 0,
                'wordWarState.suspicions': { red: [], blue: [] },
                'wordWarState.timerEndsAt': deleteField(),
            });
        }
    });
}

export async function toggleSuspicion(gameId: string, playerId: string, cardIndex: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;
        
        const currentTeam = game.players.find(p => p.id === playerId)?.team;
        if (!currentTeam) throw new Error("Player not assigned to a team.");

        const suspicions = game.wordWarState.suspicions || { red: [], blue: [] };
        const teamSuspicions = suspicions[currentTeam] || [];

        const indexInArray = teamSuspicions.indexOf(cardIndex);
        let newTeamSuspicions;

        if (indexInArray === -1) {
            // Card is not suspected, add it
            newTeamSuspicions = [...teamSuspicions, cardIndex];
        } else {
            // Card is already suspected, remove it
            newTeamSuspicions = [...teamSuspicions.slice(0, indexInArray), ...teamSuspicions.slice(indexInArray + 1)];
        }

        transaction.update(gameRef, {
            [`wordWarState.suspicions.${currentTeam}`]: newTeamSuspicions,
        });
    });
}

export async function proceedToFinalResults(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can proceed to final results.");
        if (game.gameState !== 'guesser_turn') throw new Error("Can only proceed to final results from guesser turn.");

        const currentTeam = game.wordWarState.turn;
        const winner = currentTeam === 'red' ? 'blue' : 'red';

        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner: winner, message: 'انتهت اللعبة' },
        });
    });
}

    