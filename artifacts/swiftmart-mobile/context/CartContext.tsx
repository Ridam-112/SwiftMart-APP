import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Product } from '@/lib/types';

interface CartState {
  items: CartItem[];
  shopId: string | null;
}

interface CartContextType {
  items: CartItem[];
  shopId: string | null;
  addItem: (product: Product, shopId: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getQuantity: (productId: string) => number;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType>({} as CartContextType);
const CART_KEY = 'swiftmart_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartState>({ items: [], shopId: null });

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CART_KEY);
        if (stored) setCart(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => {});
  }, [cart]);

  const addItem = useCallback((product: Product, sid: string) => {
    setCart(prev => {
      if (prev.shopId && prev.shopId !== sid) {
        return { shopId: sid, items: [{ product, quantity: 1 }] };
      }
      const existing = prev.items.find(i => i.product._id === product._id);
      const items = existing
        ? prev.items.map(i =>
            i.product._id === product._id ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [...prev.items, { product, quantity: 1 }];
      return { shopId: sid, items };
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCart(prev => {
      const items = prev.items.filter(i => i.product._id !== productId);
      return { shopId: items.length === 0 ? null : prev.shopId, items };
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) { removeItem(productId); return; }
    setCart(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.product._id === productId ? { ...i, quantity } : i
      ),
    }));
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setCart({ items: [], shopId: null });
  }, []);

  const getQuantity = useCallback(
    (productId: string) => cart.items.find(i => i.product._id === productId)?.quantity ?? 0,
    [cart.items],
  );

  const total = cart.items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: cart.items,
        shopId: cart.shopId,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getQuantity,
        total,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
