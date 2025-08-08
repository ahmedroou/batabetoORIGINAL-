
import { processNight, checkForWinnerInternal, processDayInternal } from '@/lib/actions/behind-the-mask';
import type { Game, Player, NightAction, PlayerTeam } from '@/types';
import { ROLES } from '@/data/mafia-roles';

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

const createMockGame = (players: Player[], nightActions: Record<string, NightAction> = {}): Game => ({
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
    publicChat: [],
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

        const { updatedPlayers, newEvents } = await processNight(game);
        
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

        const { updatedPlayers, newEvents, newPrivateEvents } = await processNight(game);
        
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
    
    test('Detective correctly identifies the killer', async () => {
        const players = [
            createMockPlayer('p1', 'killer', 'mafia'),
            createMockPlayer('p2', 'detective', 'good'),
        ];
        const actions = { p2: { actorId: 'p2', action: 'investigate', targetId: 'p1' } as NightAction };
        const game = createMockGame(players, actions);
        
        const { newPrivateEvents } = await processNight(game);

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

        const { newPrivateEvents, newPrivateChats } = await processNight(game);
        
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

        const { newPrivateEvents, newPrivateChats } = await processNight(game);
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

        const { updatedPlayers, executedPlayer } = await processDayInternal(game);
        expect(executedPlayer?.id).toBe('p2');
        expect(updatedPlayers.find(p => p.id === 'p2')?.status).toBe('voted_out');
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


describe('Behind The Mask - Win Conditions', () => {
    
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

});
