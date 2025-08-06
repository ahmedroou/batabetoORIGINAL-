
'use client';

import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SnakesAndScissorsGameProps {
    game: Game;
    self: Player;
}

export function SnakesAndScissorsGame({ game, self }: SnakesAndScissorsGameProps) {
    // This is a placeholder component.
    // The actual UI for different game phases will be built here.

    const renderLobby = () => (
        <Card>
            <CardHeader>
                <CardTitle>Lobby for Snakes and Scissors</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Waiting for players...</p>
            </CardContent>
        </Card>
    );

    switch (game.gameState) {
        case 'lobby':
            return renderLobby();
        // Add other game states here
        default:
            return <p>Current game state: {game.gameState}</p>;
    }
}
