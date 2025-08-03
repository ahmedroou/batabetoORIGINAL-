
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
  Timestamp,
} from 'firebase/firestore';
import type { City, StoreItem, UserProfile, CityResources, ResourceRates, CityCell } from '@/types';

const GRID_SIZE = 40; // Updated grid size

// --- Resource Calculation Logic ---

function calculateResourceGeneration(layout: City['layout']): ResourceRates {
    const rates: ResourceRates = {};
    layout.forEach(cell => {
        if (cell.item && cell.item.production) {
            for (const [resource, value] of Object.entries(cell.item.production)) {
                rates[resource as keyof ResourceRates] = (rates[resource as keyof ResourceRates] || 0) + value;
            }
        }
    });
    return rates;
}

function calculateResourceConsumption(layout: City['layout']): ResourceRates {
    const rates: ResourceRates = {};
    layout.forEach(cell => {
        if (cell.item && cell.item.consumption) {
            for (const [resource, value] of Object.entries(cell.item.consumption)) {
                rates[resource as keyof ResourceRates] = (rates[resource as keyof ResourceRates] || 0) + value;
            }
        }
    });
    return rates;
}

function calculateStorageCapacity(layout: City['layout']): ResourceRates {
    const capacity: ResourceRates = {
        wood: 1000, stone: 1000, iron: 500, energy: 500, food: 500, water: 500
    };
    layout.forEach(cell => {
        if (cell.item && cell.item.storage) {
            for (const [resource, value] of Object.entries(cell.item.storage)) {
                capacity[resource as keyof ResourceRates] = (capacity[resource as keyof ResourceRates] || 0) + value;
            }
        }
    });
    return capacity;
}


export async function updateCityResources(userId: string): Promise<City | null> {
    const cityRef = doc(db, 'cities', userId);
    try {
        const updatedCity = await runTransaction(db, async (transaction) => {
            const cityDoc = await transaction.get(cityRef);
            if (!cityDoc.exists()) return null;

            const city = cityDoc.data() as City;
            const now = Timestamp.now();
            const lastUpdated = city.lastUpdated || now;
            const elapsedSeconds = now.seconds - lastUpdated.seconds;
            const elapsedHours = elapsedSeconds / 3600;

            if (elapsedHours <= 0) return city; // No update needed if no time has passed

            const productionRates = calculateResourceGeneration(city.layout);
            const consumptionRates = calculateResourceConsumption(city.layout);
            const storageCapacity = calculateStorageCapacity(city.layout);
            
            // Recalculate total population based on current layout
            const totalPopulation = city.layout.reduce((acc, cell) => acc + (cell.item?.population || 0), 0);

            const newResources: Partial<CityResources> = {
                population: totalPopulation
            };
            let hasChanged = true; // Always update population and rates

            for (const key in productionRates) {
                const resource = key as keyof ResourceRates;
                const netRate = (productionRates[resource] || 0) - (consumptionRates[resource] || 0);
                if (netRate !== 0) {
                    const currentAmount = city.resources[resource as keyof CityResources] || 0;
                    const capacity = storageCapacity[resource] || Infinity;
                    const generatedAmount = netRate * elapsedHours;
                    
                    const newAmount = Math.max(0, Math.min(capacity, currentAmount + generatedAmount));
                    
                    if (Math.round(newAmount) !== Math.round(currentAmount)) {
                         newResources[resource as keyof CityResources] = newAmount;
                    }
                }
            }
            
            const finalResources = { ...city.resources, ...newResources };

            if (hasChanged) {
                 transaction.update(cityRef, {
                    'resources': finalResources,
                    'productionRates': productionRates,
                    'consumptionRates': consumptionRates,
                    'storageCapacity': storageCapacity,
                    'lastUpdated': now,
                });
                return { 
                    ...city, 
                    resources: finalResources,
                    productionRates,
                    consumptionRates,
                    storageCapacity,
                    lastUpdated: now,
                };
            }
            
            return city;
        });
        return updatedCity;
    } catch (error) {
        console.error(`Error updating resources for user ${userId}:`, error);
        return null;
    }
}


// Function to get or create a city for a user
export async function getUserCity(userId: string): Promise<City | null> {
  if (!userId) return null;
  const cityRef = doc(db, 'cities', userId);
  try {
    const cityDoc = await getDoc(cityRef);
    if (cityDoc.exists()) {
      // If city exists, trigger a resource update before returning it
      return await updateCityResources(userId);
    } else {
      // Create a new city if it doesn't exist
      const newLayout: CityCell[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
        x: i % GRID_SIZE,
        y: Math.floor(i / GRID_SIZE),
        item: null,
      }));

      // Add special buildings
      const userDoc = await getDoc(doc(db, 'users', userId));
      const isAdmin = userDoc.data()?.isAdmin || false;

      const specialBuildings = [
        { x: 5, y: 5, icon: 'Home', isSpecial: true, navigatesTo: '/' }, // Town Hall
        { x: GRID_SIZE - 6, y: 5, icon: 'Swords', isSpecial: true, navigatesTo: '/leagues/main' }, // Leagues Hall
        isAdmin ? { x: 5, y: GRID_SIZE - 6, icon: 'Shield', isSpecial: true, navigatesTo: '/admin' } : null // Admin Tower
      ].filter(Boolean);

      specialBuildings.forEach(building => {
        if(building) {
          const index = building.y * GRID_SIZE + building.x;
          if (newLayout[index]) {
            newLayout[index] = { ...newLayout[index], ...building, item: null };
          }
        }
      });
      
      const initialResources: CityResources = {
        wood: 500,
        stone: 200,
        iron: 0,
        energy: 100,
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
        lastUpdated: Timestamp.now(),
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
     const totalPopulation = layout.reduce((acc, cell) => acc + (cell.item?.population || 0), 0);
    await updateDoc(cityRef, { 
        layout: layout,
        'resources.population': totalPopulation,
        lastUpdated: Timestamp.now() 
    });
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
    const itemData = { ...item };
    // Ensure numeric fields are numbers
    itemData.price = Number(itemData.price) || 0;
    itemData.population = Number(itemData.population) || 0;
    
    if ('id' in itemData && itemData.id) {
      // Update existing item
      const itemRef = doc(db, 'city_store_items', itemData.id);
      await updateDoc(itemRef, itemData);
    } else {
      // Add new item
      const itemsCol = collection(db, 'city_store_items');
      await addDoc(itemsCol, itemData);
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
