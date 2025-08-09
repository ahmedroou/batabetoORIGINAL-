
import { createChallenge, joinChallenge, getChallenges, deleteChallenge, updateChallenge } from '@/lib/actions/challenges';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import type { Challenge, ChallengePrize } from '@/types';

// Mock the withAdminAuth decorator to bypass actual auth checks in tests
jest.mock('@/lib/actions/helpers', () => ({
    ...jest.requireActual('@/lib/actions/helpers'),
    withAdminAuth: <T extends any[], R>(action: (adminId: string, ...args: T) => Promise<R>) => {
        return (adminId: string, ...args: T) => action(adminId, ...args);
    },
}));


describe('Challenge System', () => {
  const adminId = 'admin_test_user';
  const userId = 'player_test_user';
  let createdChallengeId: string | null = null;
  
  const challengeData: Omit<Challenge, 'id' | 'createdAt' | 'endsAt' | 'participantIds'> & { durationInHours: number } = {
    title: 'بطولة الاختبار',
    targetPoints: 50,
    specificGameType: 'trap-answer',
    firstPlacePrize: [{ type: 'coins', value: 100 }],
    secondPlacePrize: [{ type: 'diamonds', value: 10 }],
    thirdPlacePrize: [],
    durationInHours: 1,
  };

  afterAll(async () => {
    // Cleanup: delete all challenges created during the tests
    const q = query(collection(db, "challenges"), where("title", "==", "بطولة الاختبار"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  });

  test('should create a new challenge successfully', async () => {
    const result = await createChallenge(adminId, challengeData);
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify the challenge was created in the database
    const q = query(collection(db, "challenges"), where("title", "==", "بطولة الاختبار"));
    const snapshot = await getDocs(q);
    expect(snapshot.empty).toBe(false);
    
    const docData = snapshot.docs[0].data();
    createdChallengeId = snapshot.docs[0].id; // Save for next tests

    expect(docData.title).toBe(challengeData.title);
    expect(docData.targetPoints).toBe(challengeData.targetPoints);
    expect(docData.participantIds).toEqual([]);
    expect(docData.firstPlacePrize[0].value).toBe(100);
  });
  
  test('should allow a player to join an active challenge', async () => {
    expect(createdChallengeId).not.toBeNull(); // Ensure we have a challenge to join
    const joinResult = await joinChallenge(createdChallengeId!, userId);
    
    expect(joinResult.success).toBe(true);
    expect(joinResult.error).toBeUndefined();
    
    const activeChallenges = await getChallenges();
    const joinedChallenge = activeChallenges.find(c => c.id === createdChallengeId);

    expect(joinedChallenge).toBeDefined();
    expect(joinedChallenge?.participantIds).toContain(userId);
  });
  
   test('should retrieve active challenges', async () => {
    const activeChallenges = await getChallenges();
    expect(activeChallenges.length).toBeGreaterThan(0);
    expect(activeChallenges.some(c => c.id === createdChallengeId)).toBe(true);
  });

   test('should allow an admin to update a challenge', async () => {
       expect(createdChallengeId).not.toBeNull();
       const updateData = { title: "بطولة الاختبار المحدثة", targetPoints: 150 };
       const result = await updateChallenge(adminId, createdChallengeId!, updateData);
       
       expect(result.success).toBe(true);

       const activeChallenges = await getChallenges();
       const updatedChallenge = activeChallenges.find(c => c.id === createdChallengeId);
       expect(updatedChallenge?.title).toBe("بطولة الاختبار المحدثة");
       expect(updatedChallenge?.targetPoints).toBe(150);
   });
   
    test('should allow an admin to delete a challenge', async () => {
        expect(createdChallengeId).not.toBeNull();
        const result = await deleteChallenge(adminId, createdChallengeId!);

        expect(result.success).toBe(true);
        const activeChallenges = await getChallenges();
        const deletedChallenge = activeChallenges.find(c => c.id === createdChallengeId);
        expect(deletedChallenge).toBeUndefined();
    });

});
