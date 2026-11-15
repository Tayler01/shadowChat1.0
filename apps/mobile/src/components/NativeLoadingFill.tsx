import { useEffect } from 'react';
import { AppState } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// Interpolate reported work only. There is no clock-driven advance or estimate.
export function NativeLoadingFill({ progress = 0 }: { progress?: number }) {
  const fill = useSharedValue(0);
  const target = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  useEffect(() => {
    const advance = () => {
      if (target < fill.value) return;
      fill.value = withTiming(target, {
        duration: target === 1 ? 0 : 160, easing: Easing.linear, reduceMotion: ReduceMotion.System,
      });
    };
    if (AppState.currentState === 'active') advance();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') advance(); else cancelAnimation(fill);
    });
    return () => { subscription.remove(); cancelAnimation(fill); };
  }, [fill, target]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` as `${number}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: '#4ade80', alignSelf: 'flex-start' }, style]} />;
}
