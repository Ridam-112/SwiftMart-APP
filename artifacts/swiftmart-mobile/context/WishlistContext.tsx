import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '@/lib/types';

const STORAGE_KEY = 'swiftmart_wishlist';

interface WishlistContextType {
  items: Product[];
  isWished: (id: string) => boolean;
  toggle: (product: Product) => void;
  remove: (id: string) => void;
}

const WishlistContext = createContext<WishlistContextType>({
  items: [],
  isWished: () => false,
  toggle: () => {},
  remove: () => {},
});

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setItems(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  function persist(next: Product[]) {
    setItems(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  const isWished = useCallback((id: string) => items.some(p => p._id === id), [items]);

  const toggle = useCallback((product: Product) => {
    setItems(prev => {
      const exists = prev.some(p => p._id === product._id);
      const next = exists ? prev.filter(p => p._id !== product._id) : [product, ...prev];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.filter(p => p._id !== id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <WishlistContext.Provider value={{ items, isWished, toggle, remove }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);
