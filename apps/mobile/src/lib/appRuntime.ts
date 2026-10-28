import {activeCommunity,baseAppRuntime} from '../community/communityBindings';
export const appRuntime={...baseAppRuntime,get origin(){return activeCommunity()?.community.origin ?? baseAppRuntime.origin;}};
