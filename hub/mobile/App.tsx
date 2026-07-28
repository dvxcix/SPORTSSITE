import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { TIER_LABEL } from '@slipsurge/core/tiers';

// Temporary smoke test — proves @slipsurge/core (the workspace package
// shared with hub/) resolves and bundles correctly through Metro, same as
// it already does through Next's webpack/turbopack on the web side.
export default function App() {
  return (
    <View style={styles.container}>
      <Text>SlipSurge mobile — shared tiers: {Object.values(TIER_LABEL).join(', ')}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
