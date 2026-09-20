describe.each([false,true])('Shadow Circuit feature flag %s',enabled=>{
  afterEach(()=>{jest.dontMock('../src/config/featureFlags');jest.resetModules()})
  test('route availability follows the build flag without accepting unvalidated level IDs',()=>{
    jest.isolateModules(()=>{
      jest.doMock('../src/config/featureFlags',()=>({
        ...jest.requireActual('../src/config/featureFlags'),SHADOW_CIRCUIT_ENABLED:enabled,
      }))
      const {normalizePlayExperience,getLocationStateFromUrl}=jest.requireActual('../src/lib/appRouting')
      expect(normalizePlayExperience('shadow-circuit')).toBe(enabled?'shadow-circuit':null)
      const state=getLocationStateFromUrl(new URL('https://shadochat.online/?view=games&play=shadow-circuit&playItem=untrusted-level'))
      expect(state.playItem).toBeNull()
      expect(normalizePlayExperience('shadow-runner')).toBe('shadow-runner')
    })
  })
})
