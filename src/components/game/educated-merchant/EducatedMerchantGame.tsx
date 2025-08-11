
"use client";

import { useMemo } from "react";
import type { Game, Player } from "@/types";
import { GameBoard } from "./GameBoard";
import { PlayerHUD } from "./PlayerHUD";
import { DiceRoll } from "./DiceRoll";
import { PropertyCard } from "./PropertyCard";
import { QuestionModal } from "./QuestionModal";
import { FinalResults } from "./FinalResults";
import { Lobby } from "./Lobby";
import { motion, AnimatePresence } from "framer-motion";

interface EducatedMerchantGameProps {
  game: Game;
  self: Player;
}

export function EducatedMerchantGame({ game, self }: EducatedMerchantGameProps) {
  const es = game.educatedMerchantState;

  if (!es) {
    return <Lobby game={game} self={self} />;
  }

  const isMyTurn = es.turnOrder?.[es.currentTurnIndex] === self.id;
  const canRoll = game.gameState === "rolling" && isMyTurn;
  const showPropertyInteraction = game.gameState === "property_action" && isMyTurn;
  const showQuestion = game.gameState === "question" && isMyTurn;

  const activePlayerId = es.turnOrder?.[es.currentTurnIndex] || "";

  if (game.gameState === "lobby") {
    return <Lobby game={game} self={self} />;
  }

  if (game.gameState === "final_results") {
    return <FinalResults game={game} />;
  }

  if (!es.board?.length) {
    return <div className="text-center p-6 text-lg">جاري تحميل لوحة اللعب...</div>;
  }

  return (
    <div className="w-full h-screen flex flex-col md:flex-row p-2 gap-4 bg-gray-100 dark:bg-gray-900">
      <div className="flex-grow flex flex-col items-center justify-center relative min-h-0">
          <GameBoard
            board={es.board}
            players={game.players}
            gameId={game.id}
            diceRoll={es.lastDiceRoll ?? null}
            isMyTurn={isMyTurn}
            activePlayerId={activePlayerId}
          />
        
        <AnimatePresence>
          {canRoll && (
            <motion.div
              key="dice-roll"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="absolute z-20"
            >
              <DiceRoll gameId={game.id} selfId={self.id} />
            </motion.div>
          )}

          {showPropertyInteraction && (
            <motion.div
              key="property-card"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute z-20"
            >
              <PropertyCard game={game} self={self} />
            </motion.div>
          )}

          {showQuestion && (
            <motion.div
              key="question-modal"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute z-30"
            >
              <QuestionModal game={game} self={self} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full md:w-[350px] shrink-0">
        <PlayerHUD
          players={game.players}
          balances={game.playerScores || {}}
          currentTurnPlayerId={activePlayerId}
          activityLog={es.activityLog || []}
        />
      </div>
    </div>
  );
}
