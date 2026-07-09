import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useVideoPlayer, VideoView } from 'expo-video';

const splashSource = require('../assets/videos/splash-video.mp4');

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  // On web skip video (html5 autoplay is blocked by browsers)
  const [videoFinished, setVideoFinished] = useState(Platform.OS === 'web');

  const player = useVideoPlayer(splashSource, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      setVideoFinished(true);
    });
    // Safety: navigate even if the playToEnd event never fires
    const timeout = setTimeout(() => setVideoFinished(true), 8000);
    return () => {
      sub.remove();
      clearTimeout(timeout);
    };
  }, [player]);

  useEffect(() => {
    if (!videoFinished || isLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.role === 'vendor') {
      router.replace('/(vendor)/dashboard');
    } else if (user.role === 'rider') {
      router.replace('/(rider)/dashboard');
    } else {
      router.replace('/(customer)/home');
    }
  }, [videoFinished, user, isLoading]);

  // Once finished, show blank screen while navigation happens
  if (videoFinished) {
    return <View style={styles.container} />;
  }

  return (
    // Tap anywhere to skip the intro video
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={() => setVideoFinished(true)}
    >
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
});
