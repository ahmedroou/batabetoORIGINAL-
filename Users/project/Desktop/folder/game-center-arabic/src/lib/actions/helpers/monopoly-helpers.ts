
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import type { Player, BoardProperty } from '@/types';

export const generateMonopolyBoard = (): BoardProperty[] => {
    const board: BoardProperty[] = [];
    const basePrice = 50;
    const priceIncrement = 15;
    const totalTiles = 24; 
    
    const finePositions: Record<number, number> = {
        6: 100, 
        18: 200 
    };
    
    const chancePositions = [4, 10, 16, 22];

    for (let i = 0; i < totalTiles; i++) {
        if (i === 0) {
            board.push({
                id: i,
                type: 'start',
                name: 'خط البداية',
                price: 0,
                rent: 0,
                ownerId: null,
                color: '#16a34a',
            });
        } else if (chancePositions.includes(i)) {
             board.push({
                id: i,
                type: 'chance',
                name: 'بطاقة حظ',
                price: 0,
                rent: 0,
                ownerId: null,
                color: '#f59e0b',
            });
        } else if (i in finePositions) {
            board.push({
                id: i,
                type: 'fine',
                name: `غرامة`,
                price: finePositions[i]!,
                rent: 0,
                ownerId: null,
                color: '#dc2626',
            });
        } else {
            const price = basePrice + Math.floor(i / 4) * priceIncrement * 4 + (i % 4) * priceIncrement;
            board.push({
                id: i,
                type: 'property',
                name: `عقار ${i + 1}`,
                price: price,
                rent: Math.floor(price * 0.20),
                ownerId: null,
                color: null,
            });
        }
    }
    return board;
};


export const checkBankruptcy = (players: Player[], board: BoardProperty[]): { updatedPlayers: Player[], updatedBoard: BoardProperty[], bankruptPlayerName?: string } => {
    let bankruptPlayerName: string | undefined = undefined;
    const updatedPlayers = players.map(p => {
        if (p.status !== 'bankrupt' && (p.balance || 0) < 0) {
            bankruptPlayerName = p.name;
            return { ...p, status: 'bankrupt', properties: [] };
        }
        return p;
    });

    if (bankruptPlayerName) {
        const bankruptPlayer = players.find(p => p.name === bankruptPlayerName);
        if(bankruptPlayer){
            const updatedBoard = board.map(prop => {
                if (prop.ownerId === bankruptPlayer.id) {
                    return { ...prop, ownerId: null, color: null };
                }
                return prop;
            });
            return { updatedPlayers, updatedBoard, bankruptPlayerName };
        }
    }
    
    return { updatedPlayers, updatedBoard: board, bankruptPlayerName };
};


export async function getMonopolyQuestionCategories(): Promise<string[]> {
    const questionsCol = collection(db, 'snakes_and_scissors_questions');
    const snapshot = await getDocs(questionsCol);
    const categories = new Set<string>();
    snapshot.forEach(doc => {
        categories.add(doc.data().category);
    });
    return Array.from(categories);
}
