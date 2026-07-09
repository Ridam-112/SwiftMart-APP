import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index"          options={{ headerShown: false }} />
      <Stack.Screen name="login"          options={{ headerShown: false }} />
      <Stack.Screen name="register"       options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)"         options={{ headerShown: false }} />
      <Stack.Screen name="(customer)"     options={{ headerShown: false }} />
      <Stack.Screen name="(vendor)"       options={{ headerShown: false }} />
      <Stack.Screen name="(rider)"        options={{ headerShown: false }} />
      <Stack.Screen name="checkout"       options={{ headerShown: false }} />
      <Stack.Screen name="shop/[id]"      options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]"     options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]"   options={{ headerShown: false }} />
      <Stack.Screen name="tracking/[id]"  options={{ headerShown: false }} />
      <Stack.Screen name="rider-delivery/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="search"                     options={{ headerShown: false }} />
      <Stack.Screen name="notifications"              options={{ headerShown: false }} />
      <Stack.Screen name="onboarding"                 options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit"               options={{ headerShown: false }} />
      <Stack.Screen name="profile/addresses"          options={{ headerShown: false }} />
      <Stack.Screen name="profile/wishlist"           options={{ headerShown: false }} />
      <Stack.Screen name="profile/payment-methods"    options={{ headerShown: false }} />
      <Stack.Screen name="profile/help"               options={{ headerShown: false }} />
      <Stack.Screen name="profile/privacy-policy"     options={{ headerShown: false }} />
      <Stack.Screen name="profile/terms"              options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Tapping a push notification (from the OS notification panel, or the
    // in-app banner) takes the user to their notifications list.
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <WishlistProvider>
            <CartProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
