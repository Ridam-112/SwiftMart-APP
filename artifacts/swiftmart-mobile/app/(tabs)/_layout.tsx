// Legacy (tabs) group — app routing now uses (customer), (vendor), (rider) groups.
// This file is kept to satisfy the scaffold but is not used in production navigation.
import { Redirect } from 'expo-router';
export default function TabsLayout() {
  return <Redirect href="/login" />;
}
