import type { Game, Player, NightAction, PlayerTeam, DayEvent, PrivateEvent, PrivateChat, GameResult } from '@/types';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import { ROLES } from '@/data/mafia-roles';
import { processNightInternal, checkForWinnerInternal, processDayInternal } from '@/lib/actions/helpers/behind-the-mask-helpers';

// --- Jest Tests ---

const createMockPlayer = (id: string, role: Player['role'], team: Player['team']): Player => ({
  id,
  name: `Player ${id}`,
  avatarId: `avatar_${id}`,
  status: 'alive',
  role,
  team,
  leaderboardPoints: 0,
  score: 0,
  position: 0,
});

const createMockGame = (players: Player[], nightActions: Record<string, NightAction> = {}, lastHealedPlayerId?: string | null): Game => ({
  id: 'test-game',
  hostId: 'p1',
  gameType: 'behind-the-mask',
  players,
  playerUids: players.map(p => p.id),
  gameState: 'night',
  createdAt: new Date() as any,
  mafiaState: {
    phase: 'night',
    night: 1,
    nightActions,
    votes: {},
    events: [],
    privateEvents: {},
    privateChats: {},
    publicChat: [],
    lastHealedPlayerId: lastHealedPlayerId,
  },
});

describe('Behind The Mask - Night Phase Logic', () => {
    test('Killer successfully kills a civilian', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'civilian', 'good'),
        ];
        const actions = { p1: { actorId: 'p1', action: 'kill', targetId: 'p2' } as NightAction };
        const game = createMockGame(players, actions);

        const { updatedPlayers, newEvents } = await processNightInternal(game);
        
        expect(updatedPlayers.find(p => p.id === 'p2')?.status).toBe('killed');
        expect(newEvents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'death' })
            ])
        );
    });

    test('Doctor successfully saves a player from the killer', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'doctor', 'good'),
            createMockPlayer('p3', 'civilian', 'good'),
        ];
        const actions = {
            p1: { actorId: 'p1', action: 'kill', targetId: 'p3' } as NightAction,
            p2: { actorId: 'p2', action: 'heal', targetId: 'p3' } as NightAction,
        };
        const game = createMockGame(players, actions);

        const { updatedPlayers, newEvents, newPrivateEvents } = await processNightInternal(game);
        
        expect(updatedPlayers.find(p => p.id === 'p3')?.status).toBe('alive');
        expect(newEvents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'protection' })
            ])
        );
        expect(newPrivateEvents['p2']).toEqual(
             expect.arrayContaining([
                expect.objectContaining({ type: 'doctor_success' })
            ])
        )
    });

    test('Doctor successfully saves themself', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'doctor', 'good'),
        ];
        const actions = {
            p1: { actorId: 'p1', action: 'kill', targetId: 'p2' } as NightAction,
            p2: { actorId: 'p2', action: 'heal', targetId: 'p2' } as NightAction,
        };
        const game = createMockGame(players, actions);
        const { updatedPlayers, newEvents } = await processNightInternal(game);
        
        expect(updatedPlayers.find(p => p.id === 'p2')?.status).toBe('alive');
        expect(newEvents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'protection' })
            ])
        );
    });

    test('Doctor CANNOT save the same player (including themself) twice in a row', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'doctor', 'good'),
        ];
        const actions = {
            p1: { actorId: 'p1', action: 'kill', targetId: 'p2' } as NightAction,
            p2: { actorId: 'p2', action: 'heal', targetId: 'p2' } as NightAction,
        };
        const game = createMockGame(players, actions, 'p2'); 
        const { updatedPlayers: updatedPlayersWithoutHeal } = await processNightInternal(createMockGame(players, { p1: actions.p1 }));

        expect(updatedPlayersWithoutHeal.find(p => p.id === 'p2')?.status).toBe('killed');
    });

    
    test('Detective correctly identifies the killer', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'detective', 'good'),
        ];
        const actions = { p2: { actorId: 'p2', action: 'investigate', targetId: 'p1' } as NightAction };
        const game = createMockGame(players, actions);
        
        const { newPrivateEvents } = await processNightInternal(game);

        expect(newPrivateEvents['p2']).toBeDefined();
        const report = newPrivateEvents['p2'][0];
        expect(report.type).toBe('investigation_result');
        expect(report.message).toContain('فريق الشر');
    });

    test('Spy correctly identifies a civilian and does not open a chat', async () => {
        const players = [
            createMockPlayer('p1', 'spy', 'mafia'),
            createMockPlayer('p2', 'civilian', 'good'),
        ];
        const actions = { p1: { actorId: 'p1', action: 'spy', targetId: 'p2' } as NightAction };
        const game = createMockGame(players, actions);

        const { newPrivateEvents, newPrivateChats } = await processNightInternal(game);
        
        expect(newPrivateEvents['p1'][0].message).toContain(ROLES['civilian'].name);
        expect(Object.keys(newPrivateChats).length).toBe(0);
    });

    test('Spy identifies the killer and opens a private chat', async () => {
         const players = [
            createMockPlayer('p1', 'spy', 'mafia'),
            createMockPlayer('p2', 'killer', 'mafia'),
        ];
        const actions = { p1: { actorId: 'p1', action: 'spy', targetId: 'p2' } as NightAction };
        const game = createMockGame(players, actions);

        const { newPrivateEvents, newPrivateChats } = await processNightInternal(game);
        const chatId = ['p1', 'p2'].sort().join('-');

        expect(newPrivateEvents['p1'][0].message).toContain(ROLES['killer'].name);
        expect(newPrivateChats[chatId]).toBeDefined();
        expect(newPrivateChats[chatId].participants).toContain('p1');
        expect(newPrivateChats[chatId].participants).toContain('p2');
    });

});

describe('Behind The Mask - Day Phase & Voting Logic', () => {

    test('A player is executed with a majority vote', async () => {
        const players = [
            createMockPlayer('p1', 'civilian', 'good'),
            createMockPlayer('p2', 'killer', 'mafia'),
            createMockPlayer('p3', 'civilian', 'good'),
        ];
        const votes = { 'p1': 'p2', 'p3': 'p2' }; // p1 and p3 vote for p2
        const game = createMockGame(players);
        if (game.mafiaState) game.mafiaState.votes = votes;

        const { executedPlayer } = await processDayInternal(game);
        expect(executedPlayer?.id).toBe('p2');
    });

    test('No one is executed if there is a tie', async () => {
        const players = [
            createMockPlayer('p1', 'civilian', 'good'),
            createMockPlayer('p2', 'killer', 'mafia'),
            createMockPlayer('p3', 'civilian', 'good'),
            createMockPlayer('p4', 'doctor', 'good'),
        ];
        const votes = { 'p1': 'p2', 'p2': 'p1', 'p3': 'p2', 'p4': 'p1' }; // 2 votes for p1, 2 for p2
        const game = createMockGame(players);
        if (game.mafiaState) game.mafiaState.votes = votes;
        
        const { executedPlayer } = await processDayInternal(game);
        expect(executedPlayer).toBeNull();
    });
});


describe('Behind The Mask - Win Conditions & Awards', () => {
    
    test('Good team wins when all mafia are eliminated', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'detective', 'good'),
            createMockPlayer('p2', 'doctor', 'good'),
            createMockPlayer('p3', 'killer', 'mafia'),
        ];
        players[2].status = 'voted_out'; // Killer is eliminated
        const result = checkForWinnerInternal(players);
        expect(result).not.toBeNull();
        expect(result?.winner).toBe('good');
    });
    
    test('Mafia team wins when they outnumber the good team', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'civilian', 'good'),
        ];
        // Mafia (1) is not greater than good (1), so no win yet. Game continues.
        expect(checkForWinnerInternal(players)).toBeNull(); 

        players.push(createMockPlayer('p3', 'spy', 'mafia')); // Mafia is now 2 vs 1
         const result = checkForWinnerInternal(players);
        expect(result).not.toBeNull();
        expect(result?.winner).toBe('mafia');
    });
    
     test('No winner if mafia and good team numbers are equal', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'civilian', 'good'),
        ];
        const result = checkForWinnerInternal(players);
        expect(result).toBeNull(); // 1v1 is not an automatic win, day phase decides it
    });

    test('should award points to the winning team (Good Team)', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'detective', 'good'),
            createMockPlayer('p2', 'doctor', 'good'),
            createMockPlayer('p3', 'killer', 'mafia'),
        ];
        
        const mockGame: Partial<Game> = {
            gameType: 'behind-the-mask',
            players: players,
            gameResult: { winner: 'good', message: 'Good team wins!' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);
        
        // Good team members get awards
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(updates['p2'].leaderboardPoints).toBe(3);
        expect(updates['p2'].coins).toBe(2);
        
        // Mafia team member (loser) gets no awards
        expect(updates['p3'].leaderboardPoints).toBe(0);
        expect(updates['p3'].coins).toBe(0);
        
        expect(winUpdate).toBeNull(); // No individual winner
    });

     test('should award points to the winning team (Mafia Team)', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'detective', 'good'),
            createMockPlayer('p2', 'killer', 'mafia'),
            createMockPlayer('p3', 'spy', 'mafia'),
        ];
        
        const mockGame: Partial<Game> = {
            gameType: 'behind-the-mask',
            players: players,
            gameResult: { winner: 'mafia', message: 'Mafia team wins!' }
        };

        const { updates } = calculateEndOfGameAwards(mockGame as Game);
        
        // Good team member gets no awards
        expect(updates['p1'].leaderboardPoints).toBe(0);
        expect(updates['p1'].coins).toBe(0);

        // Mafia team members get awards
        expect(updates['p2'].leaderboardPoints).toBe(3);
        expect(updates['p2'].coins).toBe(2);
        expect(updates['p3'].leaderboardPoints).toBe(3);
        expect(updates['p3'].coins).toBe(2);
    });

});