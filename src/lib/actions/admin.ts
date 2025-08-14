
'use server';

/**
 * admin-actions.gpt5-refactor.ts
 * ---------------------------------------------------------
 * ملف موحّد ومحسّن لإدارة المحتوى عبر Firestore.
 * يتضمن تحسينات في الأداء، الأمان، القابلية للتوسع، ووضوح الشفرة.
 * - الحفاظ على نفس أسماء الدوال العامة لتوافق الواجهات الحالية.
 * - تحسين التعامل مع الدُفعات (batch) وحدّ 500 عملية في Firestore.
 * - حمايات إضافية، وفحص مُدخلات أساسي، ورسائل أخطاء أوضح.
 * - تجهيزات لمزايا مستقبلية (التقسيم بالصفحات/الفلاتر/التدقيق).
 * ---------------------------------------------------------
 */

import { db } from '@/lib/firebase';
import {
  addDoc,
  aggregate,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  count,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type {
  Article,
  AudienceGroup, // (موجود في المشروع، غير مستخدم هنا)
  AvatarPrice,
  Decree,
  Game,
  GameKing,
  Mail,
  PermissionId,
  PrisonQuestion,
  SocialEvent,
  SocialRank,
  TrapQuestion,
  UserProfile,
} from '@/types';

import {
  DEFAULT_TRAP_ANSWER_CATEGORIES,
  DEFAULT_EDUCATED_MERCHANT_CATEGORIES,
  DEFAULT_SOCIAL_RANKS,
  GAME_TYPE_NAMES,
} from '@/types';

import { PUNISHMENT_AVATAR_IDS } from '@/data/punishment-avatars';

import { isFirebaseError, getSimilaritySignature } from './helpers';

import { generateGeniusChallenge as generateGeniusChallengeFlow } from '@/ai/flows/generate-genius-challenge';
import type {
  GenerateGeniusChallengeInput,
  GenerateGeniusChallengeOutput,
} from '@/ai/flows/generate-genius-challenge';

import { generateNewsArticle } from '@/ai/flows/generate-news-article-flow';
import { getChallenges } from './challenges';

import {
  giveReward as givePlayerReward,
  applyPunishment as applyPlayerPunishment,
  getTopUsers as queryTopUsers,
  getRanks as queryRanks,
  getUsersByRank as queryUsersByRank, // (غير مستخدم هنا لكن الإبقاء عليه لا يضر)
  getTopPunisher as queryTopPunisher,
  getKingsPageData, // (غير مستخدم هنا)
} from './user';

/* ====================== أدوات/مساعدات عامة ====================== */

const BATCH_LIMIT_SAFE = 450; // أقل من 500 احتياطًا للتحديثات المركبة
const NOW = () => new Date();

const toJSDate = (value: any): Date | null => {
  try {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value?.toDate) return value.toDate();
    if (typeof value === 'number') return new Date(value);
    return null;
  } catch {
    return null;
  }
};

const normalize = (s: any) =>
  (typeof s === 'string' ? s : String(s ?? ''))
    .trim()
    .replace(/\s+/g, ' ');

const stringNonEmpty = (s: any) => typeof s === 'string' && normalize(s).length > 0;

function chunkArray<T>(arr: T[], size = BATCH_LIMIT_SAFE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  if (ops.length === 0) return;
  const batches = chunkArray(ops, BATCH_LIMIT_SAFE).map((opsChunk) => {
    const b = writeBatch(db);
    opsChunk.forEach((op) => op(b));
    return b.commit();
  });
  await Promise.all(batches);
}

const indexHintMsg =
  'قد تحتاج إلى إنشاء فهرس مركّب في Firestore لهذه الاستعلامات. راجع سجلات Firebase Console لمعرفة تفاصيل الفهرس المقترح.';

/* ====================== بحث المستخدمين (أدمن) ====================== */

export async function adminSearchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!stringNonEmpty(searchTerm)) return [];
  const term = normalize(searchTerm);
  const usersRef = collection(db, 'users');

  // Create two separate queries for each field
  const nameQuery = query(
    usersRef,
    where('name', '>=', term),
    where('name', '<=', term + '\uf8ff')
  );
  const emailQuery = query(
    usersRef,
    where('email', '>=', term.toLowerCase()),
    where('email', '<=', term.toLowerCase() + '\uf8ff')
  );

  try {
    const [nameSnapshot, emailSnapshot] = await Promise.all([
      getDocs(nameQuery),
      getDocs(emailQuery)
    ]);
    
    const usersMap = new Map<string, UserProfile>();

    nameSnapshot.forEach(doc => {
      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile);
      }
    });

    emailSnapshot.forEach(doc => {
      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile);
      }
    });
    
    const users = Array.from(usersMap.values());

    return users.slice(0, 50); // Limit results for performance
  } catch (error) {
    console.error('Error searching users by specific fields:', error);
    // As a fallback for potential "need index" errors, we can revert to the old method,
    // though this is less efficient. It ensures the feature doesn't completely break.
    console.warn('Falling back to client-side filtering for user search.');
    try {
        const fullSnapshot = await getDocs(usersRef);
        const lowerCaseSearchTerm = term.toLowerCase();
        const filteredUsers = fullSnapshot.docs
            .map((doc) => ({ uid: doc.id, ...doc.data() } as UserProfile))
            .filter(
                (user) =>
                    user.name?.toLowerCase().includes(lowerCaseSearchTerm) ||
                    user.email?.toLowerCase().includes(lowerCaseSearchTerm)
            );
        return filteredUsers.slice(0, 50);
    } catch(fallbackError) {
        console.error('Fallback user search also failed:', fallbackError);
        return [];
    }
  }
}

/* ====================== البريد الإداري ====================== */

export async function adminSendMail(
  recipientIds: string[],
  subject: string,
  body: string,
  coins: number,
): Promise<{ success: boolean; error?: string }> {
  if (!recipientIds?.length || !stringNonEmpty(subject) || !stringNonEmpty(body)) {
    return { success: false, error: 'المعلومات غير كافية لإرسال الرسالة.' };
  }

  try {
    const senderName = 'Admin';
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    for (const recipientId of recipientIds) {
      const mailRef = doc(collection(db, `users/${recipientId}/mail`));
      const mailData: Omit<Mail, 'id'> = {
        senderName,
        subject: normalize(subject),
        body: normalize(body),
        isRead: false,
        createdAt: serverTimestamp() as any,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        coins: coins > 0 ? coins : undefined,
        coinsClaimed: coins > 0 ? false : undefined,
      };
      ops.push((b) => b.set(mailRef, mailData));
    }

    await commitChunks(ops);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending mail:', error);
    return { success: false, error: error?.message || 'فشل إرسال الرسالة.' };
  }
}

/* ====================== رفع أسئلة ومحتوى (دفعات) ====================== */

type QAJson = { question: string; answer: string; dummyAnswers?: string[] };
type PrisonJson = { text: string };

function dedupeLocal<T>(arr: T[], keyer: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyer(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export async function uploadEducatedMerchantQuestionsFromJson(
  questions: QAJson[],
  category: string,
) {
  if (!Array.isArray(questions) || questions.length === 0)
    return { error: 'ملف JSON غير صالح أو فارغ.' };
  if (!stringNonEmpty(category)) return { error: 'يجب تحديد قسم صالح.' };

  try {
    const questionsCol = collection(db, 'educated_merchant_questions');
    let valid = 0;

    // إزالة التكرار داخل الملف نفسه
    const cleaned = dedupeLocal(
      questions.filter(
        (q) => stringNonEmpty(q.question) && stringNonEmpty(q.answer),
      ),
      (q) => getSimilaritySignature(normalize(q.question)),
    );

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    for (const q of cleaned) {
      const docRef = doc(questionsCol);
      const hasDummy =
        Array.isArray(q.dummyAnswers) &&
        q.dummyAnswers.every((d) => stringNonEmpty(d));
      const data: Partial<TrapQuestion> & { similaritySignature: string } = {
        question: normalize(q.question),
        answer: normalize(q.answer),
        category: normalize(category),
        randomKey: Math.random(),
        similaritySignature: getSimilaritySignature(normalize(q.question)),
        ...(hasDummy && { dummyAnswers: q.dummyAnswers!.map((d) => normalize(d)) }),
      };
      ops.push((b) => b.set(docRef, data));
      valid++;
    }

    await commitChunks(ops);
    if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة.' };
    return { success: true, count: valid };
  } catch (e) {
    console.error('Error uploading educated merchant questions:', e);
    return { error: 'حدث خطأ أثناء رفع أسئلة التاجر المتعلم.' };
  }
}

export async function uploadTrapAnswerQuestionsFromJson(
  questions: QAJson[],
  category: string,
) {
  if (!Array.isArray(questions) || questions.length === 0)
    return { error: 'ملف JSON غير صالح أو فارغ.' };
  if (!stringNonEmpty(category)) return { error: 'يجب تحديد قسم صالح.' };

  try {
    const questionsCol = collection(db, 'trap_answer_questions');
    let valid = 0;

    const cleaned = dedupeLocal(
      questions.filter(
        (q) => stringNonEmpty(q.question) && stringNonEmpty(q.answer),
      ),
      (q) => getSimilaritySignature(normalize(q.question)),
    );

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    for (const q of cleaned) {
      const docRef = doc(questionsCol);
      const hasDummy =
        Array.isArray(q.dummyAnswers) &&
        q.dummyAnswers.every((d) => stringNonEmpty(d));
      const data: Partial<TrapQuestion> & { similaritySignature: string } = {
        question: normalize(q.question),
        answer: normalize(q.answer),
        category: normalize(category),
        randomKey: Math.random(),
        similaritySignature: getSimilaritySignature(normalize(q.question)),
        ...(hasDummy && { dummyAnswers: q.dummyAnswers!.map((d) => normalize(d)) }),
      };
      ops.push((b) => b.set(docRef, data));
      valid++;
    }

    await commitChunks(ops);
    if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة.' };
    return { success: true, count: valid };
  } catch (e) {
    console.error('Error uploading trap answer questions:', e);
    return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
  }
}

export async function uploadPrisonQuestionsFromJson(questions: PrisonJson[]) {
  if (!Array.isArray(questions) || questions.length === 0)
    return { error: 'ملف JSON غير صالح أو فارغ.' };

  try {
    const questionsCol = collection(db, 'prison_questions');
    let valid = 0;

    const cleaned = dedupeLocal(
      questions.filter((q) => stringNonEmpty(q.text)),
      (q) => getSimilaritySignature(normalize(q.text)),
    );

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    for (const q of cleaned) {
      const docRef = doc(questionsCol);
      ops.push((b) =>
        b.set(docRef, {
          text: normalize(q.text),
          similaritySignature: getSimilaritySignature(normalize(q.text)),
          createdAt: serverTimestamp(),
        }),
      );
      valid++;
    }

    await commitChunks(ops);
    if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
    return { success: true, count: valid };
  } catch (e) {
    console.error('Error uploading prison questions:', e);
    return { error: 'حدث خطأ أثناء رفع أسئلة السجن.' };
  }
}

export async function uploadWordWarWordsFromJson(words: string[]) {
  if (!Array.isArray(words) || words.length === 0)
    return { error: 'ملف JSON غير صالح أو فارغ.' };

  try {
    const wordsCol = collection(db, 'word_war_words');
    const unique = Array.from(
      new Set(words.map((w) => normalize(w)).filter(Boolean)),
    );

    if (unique.length === 0) return { error: 'لا توجد كلمات صالحة.' };

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const word of unique) {
      const ref = doc(wordsCol);
      ops.push((b) => b.set(ref, { text: word }));
    }
    await commitChunks(ops);
    return { success: true, count: unique.length };
  } catch (e) {
    console.error('Error uploading word war words:', e);
    return { error: 'حدث خطأ أثناء رفع كلمات حرب الكلمات.' };
  }
}

/* ====================== العد والحذف (معايير) ====================== */

type CountCriteria = {
  game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant';
  category?: string;
  searchTerm?: string;
  answerSearchTerm?: string;
  all?: boolean;
  duplicates?: { threshold: number } | 'word_war_duplicates';
};

export async function countQuestions(criteria: CountCriteria) {
  if (
    !criteria.category &&
    !criteria.searchTerm &&
    !criteria.answerSearchTerm &&
    !criteria.all &&
    !criteria.duplicates
  ) {
    return { success: false, error: 'يجب تحديد معيار للعد.' };
  }

  let collectionName = '';
  let textFieldName: 'text' | 'question' = 'text';

  switch (criteria.game) {
    case 'trap-answer':
      collectionName = 'trap_answer_questions';
      textFieldName = 'question';
      break;
    case 'educated-merchant':
      collectionName = 'educated_merchant_questions';
      textFieldName = 'question';
      break;
    case 'prison':
      collectionName = 'prison_questions';
      textFieldName = 'text';
      break;
    case 'word_war':
      collectionName = 'word_war_words';
      textFieldName = 'text';
      break;
    default:
      return { success: false, error: 'نوع لعبة غير مدعوم.' };
  }

  try {
    const itemsCol = collection(db, collectionName);

    if (criteria.all) {
      const snapshot = await getCountFromServer(itemsCol);
      return { success: true, count: snapshot.data().count };
    }

    if (
      criteria.category &&
      (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')
    ) {
      const q = query(itemsCol, where('category', '==', normalize(criteria.category)));
      const snapshot = await getCountFromServer(q);
      return { success: true, count: snapshot.data().count };
    }

    if (criteria.searchTerm) {
      const s = normalize(criteria.searchTerm);
      const q = query(
        itemsCol,
        where(textFieldName, '>=', s),
        where(textFieldName, '<=', s + '\uf8ff'),
      );
      const snapshot = await getDocs(q);
      return { success: true, count: snapshot.size };
    }

    if (
      criteria.answerSearchTerm &&
      (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')
    ) {
      const s = normalize(criteria.answerSearchTerm);
      const q = query(
        itemsCol,
        where('answer', '>=', s),
        where('answer', '<=', s + '\uf8ff'),
      );
      const snapshot = await getDocs(q);
      return { success: true, count: snapshot.size };
    }

    return { success: false, error: 'معايير العد غير صالحة.' };
  } catch (error) {
    console.error('Error counting items:', error);
    return {
      success: false,
      error: `حدث خطأ أثناء عد العناصر. ${indexHintMsg}`,
    };
  }
}

type DeleteCriteria = {
  game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant';
  category?: string;
  searchTerm?: string;
  answerSearchTerm?: string;
  all?: boolean;
};

export async function deleteQuestions(criteria: DeleteCriteria) {
  if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all) {
    return { error: 'يجب تحديد معيار للحذف.' };
  }

  let collectionName = '';
  let textFieldName: 'text' | 'question' = 'text';

  switch (criteria.game) {
    case 'trap-answer':
      collectionName = 'trap_answer_questions';
      textFieldName = 'question';
      break;
    case 'educated-merchant':
      collectionName = 'educated_merchant_questions';
      textFieldName = 'question';
      break;
    case 'prison':
      collectionName = 'prison_questions';
      textFieldName = 'text';
      break;
    case 'word_war':
      collectionName = 'word_war_words';
      textFieldName = 'text';
      break;
    default:
      return { error: 'نوع لعبة غير مدعوم.' };
  }

  try {
    const itemsCol = collection(db, collectionName);
    let q;

    if (criteria.all) {
      q = query(itemsCol);
    } else if (
      criteria.category &&
      (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')
    ) {
      q = query(itemsCol, where('category', '==', normalize(criteria.category)));
    } else if (criteria.searchTerm) {
      const s = normalize(criteria.searchTerm);
      q = query(itemsCol, where(textFieldName, '>=', s), where(textFieldName, '<=', s + '\uf8ff'));
    } else if (
      criteria.answerSearchTerm &&
      (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')
    ) {
      const s = normalize(criteria.answerSearchTerm);
      q = query(itemsCol, where('answer', '>=', s), where('answer', '<=', s + '\uf8ff'));
    } else {
      return { error: 'معايير الحذف غير صالحة.' };
    }

    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: true, count: 0, message: 'لا عناصر مطابقة.' };

    const refs = snapshot.docs.map((d) => d.ref);
    let deleted = 0;

    for (const group of chunkArray(refs)) {
      const b = writeBatch(db);
      group.forEach((r) => b.delete(r));
      await b.commit();
      deleted += group.length;
    }

    return { success: true, count: deleted };
  } catch (error) {
    console.error('Error deleting items:', error);
    return {
      error: `حدث خطأ أثناء حذف العناصر. ${indexHintMsg}`,
    };
  }
}

/* ====================== كشف/حذف المكرر ====================== */

async function findDuplicateQuestionGroups(
  game: 'trap-answer' | 'educated-merchant' | 'prison',
  category?: string,
): Promise<Map<string, { id: string; createdAt: Timestamp }[]>> {
  let collectionName = '';
  switch (game) {
    case 'trap-answer':
      collectionName = 'trap_answer_questions';
      break;
    case 'educated-merchant':
      collectionName = 'educated_merchant_questions';
      break;
    case 'prison':
      collectionName = 'prison_questions';
      break;
  }

  let qRef = query(collection(db, collectionName));
  if (category && (game === 'trap-answer' || game === 'educated-merchant')) {
    qRef = query(qRef, where('category', '==', normalize(category)));
  }

  const snapshot = await getDocs(qRef);
  const groups = new Map<string, { id: string; createdAt: Timestamp }[]>();

  snapshot.forEach((d) => {
    const data = d.data() as any;
    const signature = data.similaritySignature;
    if (!signature) return;
    const createdAt = (data.createdAt as Timestamp) || Timestamp.now();
    const arr = groups.get(signature) || [];
    arr.push({ id: d.id, createdAt });
    groups.set(signature, arr);
  });

  return groups;
}

export async function deleteSimilarQuestions(
  game: 'trap-answer' | 'educated-merchant',
  category?: string,
) {
  try {
    const groups = await findDuplicateQuestionGroups(game, category);
    if (groups.size === 0) return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };

    const collectionName =
      game === 'trap-answer' ? 'trap_answer_questions' : 'educated_merchant_questions';

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    let deleted = 0;

    for (const [, items] of groups) {
      if (items.length > 1) {
        items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()); // احتفظ بالأحدث
        const toDelete = items.slice(1);
        toDelete.forEach((it) => {
          const ref = doc(db, collectionName, it.id);
          ops.push((b) => b.delete(ref));
          deleted++;
        });
      }
    }

    await commitChunks(ops);
    return { success: true, count: deleted };
  } catch (e) {
    console.error('Error deleting similar questions:', e);
    if (isFirebaseError(e)) {
      return { success: false, error: `فشل حذف الأسئلة المكررة: ${e.message}` };
    }
    return { success: false, error: 'حدث خطأ غير متوقع أثناء حذف الأسئلة المكررة.' };
  }
}

export async function deleteSimilarPrisonQuestions() {
  try {
    const groups = await findDuplicateQuestionGroups('prison');
    if (groups.size === 0)
      return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة في السجن.' };

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    let deleted = 0;

    for (const [, items] of groups) {
      if (items.length > 1) {
        items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        const toDelete = items.slice(1);
        toDelete.forEach((it) => {
          const ref = doc(db, 'prison_questions', it.id);
          ops.push((b) => b.delete(ref));
          deleted++;
        });
      }
    }

    await commitChunks(ops);
    return { success: true, count: deleted };
  } catch (e: any) {
    console.error('Error deleting similar prison questions:', e);
    return { success: false, error: e?.message || 'فشل حذف أسئلة السجن المكررة.' };
  }
}

async function findDuplicateWords() {
  const wordsCol = collection(db, 'word_war_words');
  const snapshot = await getDocs(wordsCol);
  const map = new Map<string, string[]>();

  snapshot.forEach((d) => {
    const text = normalize((d.data() as any).text);
    if (!text) return;
    const key = text; // يمكن مستقبلاً اعتماد lower/normalize إضافي
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d.id);
  });

  const groups: string[][] = [];
  let deletedCount = 0;
  map.forEach((ids) => {
    if (ids.length > 1) {
      groups.push(ids);
      deletedCount += ids.length - 1;
    }
  });

  return { groups, count: deletedCount };
}

export async function deleteDuplicateWords() {
  try {
    const { groups, count: deletedCount } = await findDuplicateWords();
    if (groups.length === 0) return { success: true, count: 0, message: 'لم يتم العثور على كلمات مكررة.' };

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    groups.forEach((ids) => {
      ids.sort(); // احتفظ بالأقدم (أول ID)
      ids.shift();
      ids.forEach((id) => {
        const ref = doc(db, 'word_war_words', id);
        ops.push((b) => b.delete(ref));
      });
    });

    await commitChunks(ops);
    return { success: true, count: deletedCount };
  } catch (e) {
    console.error('Error deleting duplicate words:', e);
    if (isFirebaseError(e)) {
      return { error: `فشل حذف الكلمات المكررة: ${e.message}` };
    }
    return { error: 'حدث خطأ غير متوقع أثناء حذف الكلمات المكررة.' };
  }
}

/* ====================== إعلان اللعبة ====================== */

export async function setAnnouncement(text: string) {
  try {
    const ref = doc(db, 'game_settings', 'announcement');
    await setDoc(ref, { text: normalize(text) });
    return { success: true };
  } catch (e) {
    console.error('Error setting announcement:', e);
    return { error: 'فشل حفظ الإعلان.' };
  }
}

export async function getAnnouncement() {
  try {
    const ref = doc(db, 'game_settings', 'announcement');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, text: snap.data().text || '' };
    return { success: true, text: '' };
  } catch (e) {
    console.error('Error getting announcement:', e);
    return { error: 'فشل جلب الإعلان.' };
  }
}

/* ====================== تحديث مستخدم (أدمن) ====================== */

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>) {
  if (!stringNonEmpty(userId)) return { success: false, error: 'User ID is required.' };

  // حماية: منع تغيير الأعلام الحساسة
  const sanitized = { ...data } as Partial<UserProfile> & Record<string, any>;
  delete sanitized.isAdmin;
  delete sanitized.isEditor;

  try {
    const ref = doc(db, 'users', userId);
    await updateDoc(ref, sanitized);
    return { success: true };
  } catch (e) {
    console.error('Error updating user by admin:', e);
    return { success: false, error: 'Failed to update user profile.' };
  }
}

/* ====================== أقسام الجواب المفخخ ====================== */

export async function getTrapAnswerCategories() {
  try {
    const ref = doc(db, 'game_settings', 'trap_answer_categories');
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().list?.length > 0) {
      return { success: true, categories: snap.data().list as string[] };
    }
    await setDoc(ref, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
    return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
  } catch (e) {
    console.error('Error getting trap answer categories:', e);
    return { success: false, error: 'Failed to fetch trap answer categories.' };
  }
}

export async function addTrapAnswerCategory(category: string) {
  if (!stringNonEmpty(category)) return { error: 'اسم القسم غير صالح.' };
  try {
    const ref = doc(db, 'game_settings', 'trap_answer_categories');
    await updateDoc(ref, { list: arrayUnion(normalize(category)) });
    return { success: true };
  } catch (e: any) {
    if (isFirebaseError(e) && e.code === 'not-found') {
      await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), {
        list: [normalize(category)],
      });
      return { success: true };
    }
    console.error('Error adding trap answer category:', e);
    return { success: false, error: 'Failed to add trap answer category.' };
  }
}

export async function editTrapAnswerCategory(oldCategory: string, newCategory: string) {
  if (!stringNonEmpty(oldCategory) || !stringNonEmpty(newCategory))
    return { error: 'الاسم القديم والجديد مطلوبان.' };
  if (normalize(oldCategory) === normalize(newCategory))
    return { error: 'الاسم الجديد يجب أن يختلف عن القديم.' };

  const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
  const batch = writeBatch(db);

  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');

    const categories: string[] = settingsSnap.data().list || [];
    if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
    if (categories.includes(normalize(newCategory)))
      return { error: 'الاسم الجديد للقسم موجود بالفعل.' };

    const updated = categories.map((c) => (c === oldCategory ? normalize(newCategory) : c));
    batch.update(settingsRef, { list: updated });

    const qRef = query(
      collection(db, 'trap_answer_questions'),
      where('category', '==', oldCategory),
    );
    const qs = await getDocs(qRef);
    qs.forEach((d) => batch.update(d.ref, { category: normalize(newCategory) }));

    await batch.commit();
    return { success: true };
  } catch (e) {
    console.error('Error editing category:', e);
    return { success: false, error: 'فشل تعديل قسم الجواب المفخخ.' };
  }
}

export async function deleteTrapAnswerCategory(categoryToDelete: string) {
  if (!stringNonEmpty(categoryToDelete)) return { error: 'يجب تحديد قسم للحذف.' };

  const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
  const batch = writeBatch(db);

  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');

    const categories: string[] = snap.data().list || [];
    if (categories.length <= 1) return { error: 'لا يمكن حذف آخر قسم متبقٍ.' };
    if (!categories.includes(categoryToDelete)) return { error: 'القسم المحدد غير موجود.' };

    batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });

    const qRef = query(
      collection(db, 'trap_answer_questions'),
      where('category', '==', categoryToDelete),
    );
    const qs = await getDocs(qRef);
    qs.forEach((d) => batch.delete(d.ref));

    await batch.commit();
    return { success: true, count: qs.size };
  } catch (e) {
    console.error('Error deleting category:', e);
    return { success: false, error: 'فشل حذف قسم الجواب المفخخ والأسئلة المرتبطة به.' };
  }
}

/* ====================== أقسام التاجر المتعلم ====================== */

export async function getEducatedMerchantCategories() {
  try {
    const ref = doc(db, 'game_settings', 'educated_merchant_categories');
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().list?.length > 0) {
      return { success: true, categories: snap.data().list as string[] };
    }
    await setDoc(ref, { list: DEFAULT_EDUCATED_MERCHANT_CATEGORIES });
    return { success: true, categories: DEFAULT_EDUCATED_MERCHANT_CATEGORIES };
  } catch (e) {
    console.error('Error getting educated merchant categories:', e);
    return { success: false, error: 'Failed to fetch educated merchant categories.' };
  }
}

export async function addEducatedMerchantCategory(category: string) {
  if (!stringNonEmpty(category)) return { error: 'اسم القسم غير صالح.' };
  try {
    const ref = doc(db, 'game_settings', 'educated_merchant_categories');
    await updateDoc(ref, { list: arrayUnion(normalize(category)) });
    return { success: true };
  } catch (e: any) {
    if (isFirebaseError(e) && e.code === 'not-found') {
      await setDoc(doc(db, 'game_settings', 'educated_merchant_categories'), {
        list: [normalize(category)],
      });
      return { success: true };
    }
    console.error('Error adding educated merchant category:', e);
    return { success: false, error: 'Failed to add educated merchant category.' };
  }
}

export async function editEducatedMerchantCategory(oldCategory: string, newCategory: string) {
  if (!stringNonEmpty(oldCategory) || !stringNonEmpty(newCategory))
    return { error: 'الاسم القديم والجديد مطلوبان.' };
  if (normalize(oldCategory) === normalize(newCategory))
    return { error: 'الاسم الجديد يجب أن يختلف عن القديم.' };

  const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
  const batch = writeBatch(db);

  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');

    const categories: string[] = settingsSnap.data().list || [];
    if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
    if (categories.includes(normalize(newCategory)))
      return { error: 'الاسم الجديد للقسم موجود بالفعل.' };

    const updated = categories.map((c) => (c === oldCategory ? normalize(newCategory) : c));
    batch.update(settingsRef, { list: updated });

    const qRef = query(
      collection(db, 'educated_merchant_questions'),
      where('category', '==', oldCategory),
    );
    const qs = await getDocs(qRef);
    qs.forEach((d) => batch.update(d.ref, { category: normalize(newCategory) }));

    await batch.commit();
    return { success: true };
  } catch (e) {
    console.error('Error editing category:', e);
    return { success: false, error: 'فشل تعديل قسم التاجر المتعلم.' };
  }
}

export async function deleteEducatedMerchantCategory(categoryToDelete: string) {
  if (!stringNonEmpty(categoryToDelete)) return { error: 'يجب تحديد قسم للحذف.' };

  const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
  const batch = writeBatch(db);

  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');

    const categories: string[] = snap.data().list || [];
    if (categories.length <= 1) return { error: 'لا يمكن حذف آخر قسم متبقٍ.' };
    if (!categories.includes(categoryToDelete)) return { error: 'القسم المحدد غير موجود.' };

    batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });

    const qRef = query(
      collection(db, 'educated_merchant_questions'),
      where('category', '==', categoryToDelete),
    );
    const qs = await getDocs(qRef);
    qs.forEach((d) => batch.delete(d.ref));

    await batch.commit();
    return { success: true, count: qs.size };
  } catch (e) {
    console.error('Error deleting category:', e);
    return { success: false, error: 'فشل حذف قسم التاجر المتعلم والأسئلة المرتبطة به.' };
  }
}

/* ====================== أسعار الأفاتارات والعقوبات ====================== */

export async function setAvatarPrices(prices: AvatarPrice[]) {
  try {
    const ref = doc(db, 'game_settings', 'avatar_prices');
    await setDoc(ref, { prices: prices || [] });
    return { success: true };
  } catch (e) {
    console.error('Error setting avatar prices:', e);
    return { success: false, error: 'Failed to save avatar prices.' };
  }
}

export async function getAvatarPrices() {
  try {
    const ref = doc(db, 'game_settings', 'avatar_prices');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
    return { success: true, prices: [] };
  } catch (e) {
    console.error('Error getting avatar prices:', e);
    return { success: false, error: 'Failed to fetch avatar prices.' };
  }
}

export async function setPunishmentAvatarPrices(prices: AvatarPrice[]) {
  try {
    const ref = doc(db, 'game_settings', 'punishment_avatar_prices');
    await setDoc(ref, { prices: prices || [] });
    return { success: true };
  } catch (e) {
    console.error('Error setting punishment avatar prices:', e);
    return { success: false, error: 'Failed to save punishment avatar prices.' };
  }
}

export async function getPunishmentAvatarPrices() {
  try {
    const ref = doc(db, 'game_settings', 'punishment_avatar_prices');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
    return { success: true, prices: [] };
  } catch (e) {
    console.error('Error getting punishment avatar prices:', e);
    return { success: false, error: 'Failed to fetch punishment avatar prices.' };
  }
}

export async function setDefaultAvatar(avatarId: string) {
  if (!stringNonEmpty(avatarId)) return { success: false, error: 'Avatar ID is required.' };

  const settingsRef = doc(db, 'game_settings', 'default_avatar');
  const pricesRef = doc(db, 'game_settings', 'avatar_prices');
  const batch = writeBatch(db);

  try {
    batch.set(settingsRef, { avatarId });

    const pricesSnap = await getDoc(pricesRef);
    if (pricesSnap.exists()) {
      const prices = ((pricesSnap.data().prices || []) as AvatarPrice[]).slice();
      const idx = prices.findIndex((p) => p.avatarId === avatarId);
      if (idx !== -1) prices[idx].price = 0;
      else prices.push({ avatarId, price: 0, currency: 'coins' });
      batch.update(pricesRef, { prices });
    } else {
      batch.set(pricesRef, { prices: [{ avatarId, price: 0, currency: 'coins' }] });
    }

    await batch.commit();
    return { success: true };
  } catch (e) {
    console.error('Error setting default avatar:', e);
    return { success: false, error: 'Failed to set default avatar.' };
  }
}

export async function getDefaultAvatar() {
  try {
    const ref = doc(db, 'game_settings', 'default_avatar');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, avatarId: snap.data().avatarId as string };
    return { success: true, avatarId: 'Avatar00.png' };
  } catch (e) {
    console.error('Error getting default avatar:', e);
    return { success: false, error: 'Failed to fetch default avatar.' };
  }
}

/* ====================== الألقاب الاجتماعية والصلاحيات ====================== */

export async function setSocialRanks(ranks: SocialRank[]) {
  try {
    const ref = doc(db, 'game_settings', 'social_ranks');
    await setDoc(ref, { list: ranks || [] });
    return { success: true };
  } catch (e) {
    console.error('Error setting social ranks:', e);
    return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
  }
}

export async function addPermissionToRank(rankName: string, permissionId: PermissionId) {
  const ref = doc(db, 'game_settings', 'social_ranks');
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('مستند الألقاب غير موجود.');
      const ranks: SocialRank[] = snap.data().list || [];
      const idx = ranks.findIndex((r) => r.name === rankName);
      if (idx === -1) throw new Error('اللقب غير موجود.');
      const permissions = ranks[idx].permissions || [];
      if (!permissions.includes(permissionId)) permissions.push(permissionId);
      ranks[idx].permissions = permissions;
      tx.update(ref, { list: ranks });
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'فشل إضافة الصلاحية.' };
  }
}

export async function removePermissionFromRank(rankName: string, permissionId: PermissionId) {
  const ref = doc(db, 'game_settings', 'social_ranks');
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('مستند الألقاب غير موجود.');
      const ranks: SocialRank[] = snap.data().list || [];
      const idx = ranks.findIndex((r) => r.name === rankName);
      if (idx === -1) throw new Error('اللقب غير موجود.');
      const permissions = (ranks[idx].permissions || []).filter((p) => p !== permissionId);
      ranks[idx].permissions = permissions;
      tx.update(ref, { list: ranks });
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'فشل إزالة الصلاحية.' };
  }
}

/* ====================== إعادة حساب ملوك الألعاب ====================== */

export async function recalculateGameKings() {
  try {
    const gameKingsRef = collection(db, 'game_kings');
    const usersRef = collection(db, 'users');

    // امسح القدام
    const current = await getDocs(gameKingsRef);
    const delOps: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    current.forEach((d) => delOps.push((b) => b.delete(d.ref)));
    await commitChunks(delOps);

    // جميع المستخدمين
    const usersSnapshot = await getDocs(usersRef);
    if (usersSnapshot.empty) return { success: true, updatedCount: 0 };

    const users: UserProfile[] = usersSnapshot.docs.map(
      (d) => ({ uid: d.id, ...d.data() } as UserProfile),
    );

    const newKings: Record<string, GameKing & { kingId: string }> = {};
    users.forEach((u) => {
      const winCounts = (u.winCounts || {}) as Record<string, number>;
      for (const [gameType, count] of Object.entries(winCounts)) {
        if (!newKings[gameType] || count > newKings[gameType].winCount) {
          newKings[gameType] = {
            kingId: u.uid!,
            name: u.name,
            avatarId: u.avatarId,
            winCount: count,
          };
        }
      }
    });

    const setOps: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const [gameType, king] of Object.entries(newKings)) {
      const ref = doc(gameKingsRef, gameType);
      setOps.push((b) => b.set(ref, king));
    }
    await commitChunks(setOps);

    return { success: true, updatedCount: Object.keys(newKings).length };
  } catch (e: any) {
    console.error('Error recalculating game kings:', e);
    return { success: false, error: e?.message || 'فشل إعادة حساب ملوك الألعاب.' };
  }
}

/* ====================== Backfill حالات العقوبة/الصلاحيات ====================== */

export async function backfillPunishmentStatus() {
  const usersRef = collection(db, 'users');
  try {
    const snap = await getDocs(usersRef);
    if (snap.empty) return { success: true, count: 0 };

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    let updated = 0;
    const now = NOW();

    snap.forEach((d) => {
      const u = d.data() as UserProfile;

      const hasHumiliation =
        (u.humiliation as any)?.until && toJSDate((u.humiliation as any).until)?.getTime()! > now.getTime();

      const hasAvatarPunishment =
        (u.originalAvatarToRevert as any)?.until &&
        toJSDate((u.originalAvatarToRevert as any).until)?.getTime()! > now.getTime();

      const hasDecree = (u.decrees || []).some(
        (dec: any) => dec?.until && toJSDate(dec.until)?.getTime()! > now.getTime(),
      );

      const isPunished = !!(hasHumiliation || hasAvatarPunishment || hasDecree);
      if (u.isPunished !== isPunished) {
        ops.push((b) => b.update(d.ref, { isPunished }));
        updated++;
      }
    });

    await commitChunks(ops);
    return { success: true, count: snap.size };
  } catch (e: any) {
    console.error('Error backfilling punishment status:', e);
    return { success: false, count: 0, error: 'Failed to update user punishment statuses.' };
  }
}

export async function backfillUserPermissions() {
  const usersRef = collection(db, 'users');
  try {
    const [allRanks, usersSnap] = await Promise.all([queryRanks(), getDocs(usersRef)]);
    if (usersSnap.empty) return { success: true, count: 0 };

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

    const getRank = (points: number, ranks: SocialRank[]): SocialRank | null => {
      const sorted = [...ranks].sort((a, b) => b.threshold - a.threshold);
      for (const r of sorted) if (points >= r.threshold) return r;
      return sorted[sorted.length - 1] || null;
    };

    usersSnap.forEach((d) => {
      const u = d.data() as UserProfile;
      const points = u.leaderboardPoints || 0;
      const rank = getRank(points, allRanks);
      const newPerms = rank?.permissions || [];
      const curPerms = u.permissions || [];
      const same =
        curPerms.length === newPerms.length && curPerms.every((p) => newPerms.includes(p));
      if (!same) ops.push((b) => b.update(d.ref, { permissions: newPerms }));
    });

    await commitChunks(ops);
    return { success: true, count: usersSnap.size };
  } catch (e: any) {
    console.error('Error backfilling user permissions:', e);
    return { success: false, count: 0, error: 'Failed to update user permissions.' };
  }
}

/* ====================== مكافآت/عقوبات (تفويض) ====================== */

export async function adminGiveReward(
  actorId: string,
  targetId: string,
  reward: { points?: number; coins?: number },
  reason: string,
) {
  return givePlayerReward(actorId, targetId, reward, reason);
}

export async function adminApplyPunishment(
  actorId: string,
  targetId: string,
  penalty: { points?: number; coins?: number },
  reason: string,
) {
  return applyPlayerPunishment(actorId, targetId, penalty, reason);
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number) {
  return queryTopUsers(field, count);
}

/* ====================== تحديات العبقري ====================== */

export async function generateGeniusChallenge(
  input: GenerateGeniusChallengeInput,
): Promise<GenerateGeniusChallengeOutput> {
  return generateGeniusChallengeFlow(input);
}

/* ====================== المراسل الذكي (ذكاء اصطناعي) ====================== */

async function getPunishedUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('isPunished', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}

async function getRecentFinishedGames(countNum: number): Promise<Game[]> {
  try {
    const gamesCol = collection(db, 'games');
    const qRef = query(
      gamesCol,
      where('gameState', '==', 'final_results'),
      orderBy('createdAt', 'desc'),
      limit(countNum),
    );
    const snapshot = await getDocs(qRef);
    return snapshot.docs.map((d) => d.data() as Game);
  } catch (e) {
    console.error('Error fetching recent games:', e);
    return [];
  }
}

async function getJournalistSourceMaterial(directive?: string) {
  const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const eventsQuery = query(
    collection(db, 'social_events'),
    where('timestamp', '>=', oneDayAgo),
    orderBy('timestamp', 'desc'),
  );

  const articlesQuery = query(
    collection(db, 'articles'),
    where('createdAt', '>=', sevenDaysAgo),
    orderBy('createdAt', 'desc'),
  );

  const [eventsSnapshot, articlesSnapshot, leaderboard, punished_players, top_punisher, active_challenges, recent_games] =
    await Promise.all([
      getDocs(eventsQuery),
      getDocs(articlesQuery),
      getTopUsers('leaderboardPoints', 5),
      getPunishedUsers(),
      queryTopPunisher(),
      getChallenges(),
      getRecentFinishedGames(10),
    ]);

  const events = eventsSnapshot.docs.map(
    (d) => ({ ...d.data(), timestamp: (d.data().timestamp as Timestamp).toDate() } as SocialEvent),
  );
  const previous_articles = articlesSnapshot.docs.map(
    (d) => ({ ...d.data(), createdAt: (d.data().createdAt as Timestamp).toDate() } as Article),
  );

  return {
    events,
    previous_articles,
    leaderboard,
    punished_players,
    top_punisher,
    active_challenges,
    recent_games,
    directive,
    date: new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

export async function runAiJournalist(
  directive?: string,
): Promise<{ success: boolean; article?: { headline: string }; error?: string }> {
  try {
    const sourceMaterial = await getJournalistSourceMaterial(directive);
    const generatedArticle = await generateNewsArticle(sourceMaterial);

    if (!generatedArticle.headline || !generatedArticle.body) {
      throw new Error('فشل الذكاء الاصطناعي في توليد مقال متكامل.');
    }

    await addDoc(collection(db, 'articles'), {
      title: generatedArticle.headline,
      content: generatedArticle.body,
      category: generatedArticle.category,
      imageUrl: '',
      authorName: 'المراسل الذكي',
      authorId: 'ai_journalist',
      isPublished: true,
      audience: ['public'],
      createdAt: serverTimestamp(),
      views: 0,
    });

    return { success: true, article: { headline: generatedArticle.headline } };
  } catch (e: any) {
    console.error('Error running AI journalist:', e);
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/* ====================== تنظيف المقالات القديمة ====================== */

export async function deleteOldArticles() {
  try {
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const qRef = query(collection(db, 'articles'), where('createdAt', '<', sevenDaysAgo));
    const snap = await getDocs(qRef);
    if (snap.empty) return { success: true, deletedCount: 0 };

    const refs = snap.docs.map((d) => d.ref);
    let deleted = 0;

    for (const group of chunkArray(refs)) {
      const b = writeBatch(db);
      group.forEach((r) => b.delete(r));
      await batch.commit();
      deleted += group.length;
    }

    return { success: true, deletedCount: deleted };
  } catch (e: any) {
    console.error('Error deleting old articles:', e);
    return { success: false, error: 'فشل حذف المقالات القديمة.' };
  }
}
