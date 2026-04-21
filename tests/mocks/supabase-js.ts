const createQueryBuilder = () => {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    lt: jest.fn(() => builder),
    in: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    order: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    single: jest.fn(async () => ({ data: null, error: null })),
    abortSignal: jest.fn(() => builder),
  }

  return builder
}

const createChannel = () => {
  const channel: any = {
    state: 'joined',
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => channel),
    send: jest.fn(async () => ({ status: 'ok' })),
  }

  return channel
}

export const createClient = jest.fn(() => {
  const queryBuilder = createQueryBuilder()

  return {
    from: jest.fn(() => queryBuilder),
    rpc: jest.fn(async () => ({ data: null, error: null })),
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(),
    getChannels: jest.fn(() => []),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.test/file' } })),
      })),
    },
    auth: {
      getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      setSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      refreshSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      signInWithPassword: jest.fn(async () => ({ data: { user: null }, error: null })),
      signUp: jest.fn(async () => ({ data: { user: null, session: null }, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      })),
    },
    realtime: {
      connect: jest.fn(),
      disconnect: jest.fn(),
      setAuth: jest.fn(),
    },
  }
})
