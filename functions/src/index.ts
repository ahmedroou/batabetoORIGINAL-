/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import type { GameKing, UserProfile } from "../../src/types";
import { FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Global options
setGlobalOptions({ maxInstances: 10, memory: "256MiB" });

/**
 * A scheduled function that runs every Thursday at 10:00 AM UTC to
 * recalculate and update the "Game Kings". This function is robust and
 * crucial for keeping the leaderboards up-to-date automatically.
 */
export const updateGameKings = onSchedule(
  "every thursday 10:00",
  async (event) => {
    logger.info("Starting weekly recalculation of Game Kings...", { event });

    try {
      const gameTypesSnapshot = await db.collection("game_types").get();
      const gameTypes = gameTypesSnapshot.docs.map((doc) => doc.id);

      const kingsCollectionRef = db.collection("game_kings");
      const usersCollectionRef = db.collection("users");
      const batch = db.batch();

      let updatedCount = 0;

      for (const gameType of gameTypes) {
        const winCountsQuery = usersCollectionRef
          .where(`winCounts.${gameType}`, ">", 0)
          .orderBy(`winCounts.${gameType}`, "desc")
          .limit(1);

        const snapshot = await winCountsQuery.get();

        if (!snapshot.empty) {
          const kingDoc = snapshot.docs[0];
          const kingData = kingDoc.data() as UserProfile;

          const gameKingRef = kingsCollectionRef.doc(gameType);

          const winCounts = kingData.winCounts;
          const winCount =
            (winCounts?.[gameType as keyof typeof winCounts] || 0) as number;

          const newKingData: GameKing = {
            kingId: kingDoc.id,
            name: kingData.name,
            avatarId: kingData.avatarId,
            winCount: winCount,
            updatedAt: FieldValue.serverTimestamp(),
          };

          batch.set(gameKingRef, newKingData, { merge: true });
          updatedCount++;
          const logMessage =
            `New king for ${gameType}: ${kingData.name} ` +
            `with ${newKingData.winCount} wins.`;
          logger.info(logMessage);
        }
      }

      await batch.commit();
      logger.log(`Successfully updated ${updatedCount} game kings.`);
      return;
    } catch (error) {
      logger.error("Error recalculating game kings:", error);
      // Optionally, re-throw the error to have the function execution
      // marked as a failure
      throw new Error("Failed to update game kings.");
    }
  },
);