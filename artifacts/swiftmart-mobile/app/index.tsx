import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [animationDone, setAnimationDone] = useState(false);

  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Logo fades in and pops up
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(500),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setAnimationDone(true));
  }, [opacity, scale]);

  useEffect(() => {
    if (!animationDone || isLoading) return;
    if (!user) {
      // Guests can browse the storefront without signing in; they're only
      // asked to log in when they try to check out.
      router.replace('/(customer)/home');
    } else if (user.role === 'vendor') {
      router.replace('/(vendor)/dashboard');
    } else if (user.role === 'rider') {
      router.replace('/(rider)/dashboard');
    } else {
      router.replace('/(customer)/home');
    }
  }, [animationDone, user, isLoading]);

  // Once finished, show blank black screen while navigation happens
  if (animationDone) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../assets/images/logo.png')}
        style={[styles.logo, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 180, height: 135 },
});
