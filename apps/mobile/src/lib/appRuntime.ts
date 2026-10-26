import Constants from 'expo-constants';
import { resolveAppConfiguration } from './appConfiguration';

export const appRuntime = resolveAppConfiguration(Constants.expoConfig?.extra);
