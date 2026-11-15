import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { NativeLoadingFill } from './NativeLoadingFill';

// Metro requires a static asset reference; these are the approved bundled pixels.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NATIVE_LOADING_MARK = require('../../assets/images/shado-round-mark.png');

export function NativeLaunchLoader({ stage, progress }: { stage: string; progress?: number }) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 500 || fontScale > 1.2;
  const measured = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : undefined;


  return (
    <View style={[styles.panel, compact && styles.compactPanel]}>
      <Image source={NATIVE_LOADING_MARK} style={[styles.mark, compact && styles.flow]} accessible={false} />
      <Text style={[styles.brand, compact && styles.flow]}>ShadoChat</Text>
      <View
        style={[styles.track, compact && styles.flow]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={stage}
        accessibilityValue={measured === 1
          ? { min: 0, max: 100, now: 100, text: 'Ready' }
          : { text: stage }}
      >
        <NativeLoadingFill progress={measured} />
      </View>
      <Text style={[styles.stage, compact && styles.flow]}>{stage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactPanel: { justifyContent: 'center', gap: 16, padding: 24 },
  flow: { position: 'relative', top: undefined, marginTop: 0, left: undefined, right: undefined },
  panel: { flex: 1, alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#0d0f10' },
  mark: { position: 'absolute', top: '50%', marginTop: -48, width: 96, height: 96 },
  brand: { position: 'absolute', top: '50%', marginTop: 64, color: '#f1f0ea', fontSize: 26, fontWeight: '600', letterSpacing: 0.4 },
  track: { position: 'absolute', top: '50%', marginTop: 112, width: 200, maxWidth: '100%', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#34332d' },
  stage: { position: 'absolute', top: '50%', marginTop: 134, left: 24, right: 24, minHeight: 40, color: '#C4BBA6', fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
});
