
'use server';

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  query,
  runTransaction,
  arrayUnion,
  increment,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import type { City, StoreItem, UserProfile, CityResources } from '@/types';

const GRID_SIZE = 20;

// Function to get or create a city for a user
export async function getUserCity(userId: string): Promise<City | null> {
  if (!userId) return null;
  const cityRef = doc(db, 'cities', userId);
  try {
    const cityDoc = await getDoc(cityRef);
    if (cityDoc.exists()) {
      return cityDoc.data() as City;
    } else {
      // Create a new city if it doesn't exist
      const newLayout = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
        x: i % GRID_SIZE,
        y: Math.floor(i / GRID_SIZE),
        item: null,
      }));
      
      const initialResources: CityResources = {
        wood: 500,
        stone: 200,
        energy: 100,
        gold: 1000,
        food: 50,
        water: 50,
        population: 0,
        happiness: 75,
      };

      const newCity: City = {
        userId,
        gridSize: GRID_SIZE,
        layout: newLayout,
        unlockedItems: [],
        resources: initialResources,
      };
      await setDoc(cityRef, newCity);
      return newCity;
    }
  } catch (error) {
    console.error('Error getting user city:', error);
    return null;
  }
}

// Function to save the city layout
export async function saveCityLayout(userId: string, layout: City['layout']): Promise<{ success: boolean; error?: string }> {
  if (!userId || !layout) {
    return { success: false, error: 'User ID and layout are required.' };
  }
  const cityRef = doc(db, 'cities', userId);
  try {
    await updateDoc(cityRef, { layout });
    return { success: true };
  } catch (error) {
    console.error('Error saving city layout:', error);
    return { success: false, error: 'Failed to save city layout.' };
  }
}

// Function to get all items from the store
export async function getStoreItems(): Promise<StoreItem[]> {
  const itemsCol = collection(db, 'city_store_items');
  try {
    const querySnapshot = await getDocs(query(itemsCol));
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as StoreItem));
  } catch (error) {
    console.error('Error getting store items:', error);
    return [];
  }
}

// Function to add or update a store item (admin)
export async function addOrUpdateStoreItem(item: Omit<StoreItem, 'id'> | StoreItem): Promise<{ success: boolean; error?: string }> {
  try {
    if ('id' in item && item.id) {
      // Update existing item
      const itemRef = doc(db, 'city_store_items', item.id);
      await updateDoc(itemRef, item);
    } else {
      // Add new item
      const itemsCol = collection(db, 'city_store_items');
      await addDoc(itemsCol, item);
    }
    return { success: true };
  } catch (error) {
    console.error('Error adding/updating store item:', error);
    return { success: false, error: 'Failed to save item.' };
  }
}

// Function to delete a store item (admin)
export async function deleteStoreItem(itemId: string): Promise<{ success: boolean; error?: string }> {
  if (!itemId) {
    return { success: false, error: 'Item ID is required.' };
  }
  try {
    const itemRef = doc(db, 'city_store_items', itemId);
    await deleteDoc(itemRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting store item:', error);
    return { success: false, error: 'Failed to delete item.' };
  }
}

// Function for a user to purchase an item
export async function purchaseStoreItem(userId: string, itemId: string): Promise<{ success: boolean; error?: string }> {
  if (!userId || !itemId) {
    return { success: false, error: 'User ID and Item ID are required.' };
  }

  const userRef = doc(db, 'users', userId);
  const cityRef = doc(db, 'cities', userId);
  const itemRef = doc(db, 'city_store_items', itemId);

  try {
    await runTransaction(db, async (transaction) => {
      const [userDoc, cityDoc, itemDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(cityRef),
        transaction.get(itemRef),
      ]);

      if (!userDoc.exists()) throw new Error('User not found.');
      if (!cityDoc.exists()) throw new Error('City not found for this user.');
      if (!itemDoc.exists()) throw new Error('Item not found.');

      const userData = userDoc.data() as UserProfile;
      const cityData = cityDoc.data() as City;
      const itemData = itemDoc.data() as StoreItem;

      if (cityData.unlockedItems.includes(itemId)) {
        throw new Error('You already own this item.');
      }

      if (userData.coins < itemData.price) {
        throw new Error('You do not have enough coins.');
      }

      // Deduct coins from user
      transaction.update(userRef, {
        coins: increment(-itemData.price),
      });

      // Add item to user's unlocked items in their city
      transaction.update(cityRef, {
        unlockedItems: arrayUnion(itemId),
      });
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error purchasing store item:', error);
    return { success: false, error: error.message || 'Failed to purchase item.' };
  }
}
