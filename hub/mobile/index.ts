// Must load before anything touches @supabase/supabase-js — Hermes (RN's JS
// engine) has no real URL/URLSearchParams implementation, which the
// Supabase client relies on internally for building/parsing request URLs.
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
