import React from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'
import path from 'node:path'

const root=process.cwd()
const User=React.createContext<any>({user:null})
const provider=(id:string)=>({children}:{children:React.ReactNode})=><User.Provider value={{user:{id,username:id,display_name:id}}}>{children}</User.Provider>

function setup(privateMode:boolean) {
  const channels:any[]=[]
  const rpc=jest.fn(async(name:string)=>({data:name==='list_typing_states'?[{user_id:'peer',username:'peer',display_name:'Peer',expires_at:new Date(Date.now()+6000).toISOString()}]:[],error:null}))
  const client={rpc,auth:{getSession:async()=>({data:{session:{user:{id:'member'}}}})},removeChannel:jest.fn(),channel:jest.fn((topic:string)=>{
    const handlers:any[]=[]
    const ch:any={topic,state:'joined',handlers,
      on:jest.fn((type:string,filter:any,callback:any)=>{handlers.push({type,filter,callback});return ch}),
      subscribe:jest.fn((callback:any)=>{callback?.('SUBSCRIBED');return ch}),
      send:jest.fn(async(message:any)=>{for(const peer of channels.filter(p=>p.topic===topic))for(const h of peer.handlers)if(h.type==='broadcast'&&h.filter.event===message.event)h.callback(message)}),
      presenceState:()=>({legacy:[{id:'legacy',name:'Legacy',joinedAt:1}]}),
      track:jest.fn(async()=>{}),untrack:jest.fn(async()=>{}),
    };channels.push(ch);return ch
  })}
  let full:any, streamlined:any, lobby:any
  jest.isolateModules(()=>{
    jest.doMock('react',()=>React)
    for(const file of ['src/hooks/useAuth','apps/streamlined/src-overrides/hooks/useAuth'])jest.doMock(path.join(root,file),()=>({useAuth:()=>React.useContext(User)}))
    for(const file of ['src/lib/supabase','apps/streamlined/src-overrides/lib/supabase'])jest.doMock(path.join(root,file),()=>({getWorkingClient:async()=>client,getRealtimeClient:()=>client}))
    jest.doMock(path.join(root,'src/hooks/useRealtimeRecovery'),()=>({useRealtimeRecovery:()=>{}}))
    jest.doMock(path.join(root,'src/lib/realtimeRecovery'),()=>({runRealtimeRecovery:jest.fn()}))
    jest.doMock(path.join(root,'src/lib/privateRealtimeChannels'),()=>({PRIVATE_REALTIME_ENABLED:privateMode}))
    full=jest.requireActual(path.join(root,'src/hooks/useTyping')).useTyping
    streamlined=jest.requireActual(path.join(root,'apps/streamlined/src-overrides/hooks/useTyping')).useTyping
    lobby=jest.requireActual(path.join(root,'src/features/games/shadow-war/hooks/useShadowWarLobbyPresence')).useShadowWarLobbyPresence
  })
  return {full,streamlined,lobby,channels,client,rpc}
}
afterEach(()=>{cleanup();jest.clearAllMocks()})

test('default-off full and streamlined exchange legacy typing without RPCs and receive an old-client event',async()=>{
  const s=setup(false)
  const full=renderHook(()=>s.full('general'),{wrapper:provider('full')})
  const streamlined=renderHook(()=>s.streamlined('general'),{wrapper:provider('streamlined')})
  await act(async()=>{await Promise.resolve();await Promise.resolve()})
  expect(s.channels.map(c=>c.topic)).toEqual(['typing:general','typing:general'])
  await act(async()=>{await full.result.current.startTyping()})
  expect(streamlined.result.current.typingUsers.map((u:any)=>u.id)).toContain('full')
  await act(async()=>{await streamlined.result.current.startTyping()})
  expect(full.result.current.typingUsers.map((u:any)=>u.id)).toContain('streamlined')
  const legacy=s.client.channel('typing:general')
  await act(async()=>{await legacy.send({type:'broadcast',event:'typing',payload:{user:{id:'old-client',username:'Old',display_name:'Old'},typing:true}})})
  expect(full.result.current.typingUsers.map((u:any)=>u.id)).toContain('old-client')
  expect(streamlined.result.current.typingUsers.map((u:any)=>u.id)).toContain('old-client')
  await act(async()=>{await full.result.current.stopTyping();await streamlined.result.current.stopTyping()})
  expect(full.result.current.typingUsers.map((u:any)=>u.id)).not.toContain('streamlined')
  expect(streamlined.result.current.typingUsers.map((u:any)=>u.id)).not.toContain('full')
  expect(s.rpc).not.toHaveBeenCalled()
})

test.each(['full','streamlined'] as const)('private %s typing uses authorized leases and never the legacy wire',async edition=>{
  const s=setup(true)
  const hook=renderHook(()=>s[edition]('general'),{wrapper:provider('member')})
  await act(async()=>{await Promise.resolve();await Promise.resolve()})
  await act(async()=>{await hook.result.current.startTyping();await Promise.resolve()})
  expect(s.rpc).toHaveBeenCalledWith('set_typing_status',{target_scope_key:'general',p_is_typing:true})
  expect(s.rpc).toHaveBeenCalledWith('list_typing_states',{target_scope_key:'general'})
  expect(s.channels.some(c=>c.topic==='typing:general')).toBe(false)
  expect(s.channels.flatMap(c=>c.handlers).some(h=>h.type==='broadcast')).toBe(false)
  expect(s.channels.flatMap(c=>c.send.mock.calls)).toHaveLength(0)
})

test('default-off lobby preserves the legacy presence topic and roster',async()=>{
  const s=setup(false)
  const hook=renderHook(()=>s.lobby(true),{wrapper:provider('member')})
  await act(async()=>{await Promise.resolve();await Promise.resolve()})
  expect(s.channels[0].topic).toBe('shadow-war:lobby-presence')
  act(()=>s.channels[0].handlers.find((h:any)=>h.type==='presence').callback())
  expect(hook.result.current.users.map((u:any)=>u.id)).toContain('legacy')
  expect(s.channels[0].track).toHaveBeenCalledWith(expect.objectContaining({id:'member'}))
  expect(s.rpc).not.toHaveBeenCalled()
})

test('private lobby uses the server roster without public presence tracking',async()=>{
  const s=setup(true)
  renderHook(()=>s.lobby(true),{wrapper:provider('member')})
  await act(async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()})
  expect(s.rpc).toHaveBeenCalledWith('list_shadow_war_lobby_presence')
  expect(s.rpc).toHaveBeenCalledWith('set_shadow_war_lobby_presence',{p_is_present:true})
  expect(s.channels.some(c=>c.topic==='shadow-war:lobby-presence')).toBe(false)
  expect(s.channels.flatMap(c=>c.track.mock.calls)).toHaveLength(0)
})
