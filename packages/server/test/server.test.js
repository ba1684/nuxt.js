import path from 'path'
import connect from 'connect'
import consola from 'consola'
import serveStatic from 'serve-static'
import servePlaceholder from 'serve-placeholder'
import launchMiddleware from 'launch-editor-middleware'
import { determineGlobals, isUrl } from '@nuxt/utils'
import { VueRenderer } from '@nuxt/vue-renderer'

import Server from '../src/server'
import Listener from '../src/listener'
import ServerContext from '../src/context'
import renderAndGetWindow from '../src/jsdom'
import nuxtMiddleware from '../src/middleware/nuxt'
import errorMiddleware from '../src/middleware/error'
import createModernMiddleware from '../src/middleware/modern'
import createTimingMiddleware from '../src/middleware/timing'

jest.mock('connect')
jest.mock('serve-static')
jest.mock('serve-placeholder')
jest.mock('launch-editor-middleware')
jest.mock('@nuxt/utils')
jest.mock('@nuxt/vue-renderer')
jest.mock('../src/listener')
jest.mock('../src/context')
jest.mock('../src/jsdom')
jest.mock('../src/middleware/nuxt')
jest.mock('../src/middleware/error')
jest.mock('../src/middleware/modern')
jest.mock('../src/middleware/timing')

describe('server: server', () => {
  const createNuxt = () => ({
    options: {
      dir: {
        static: 'var/nuxt/static'
      },
      srcDir: '/var/nuxt/src',
      buildDir: '/var/nuxt/build',
      globalName: 'test-global-name',
      globals: { id: 'test-globals' },
      build: {
        publicPath: '__nuxt_test'
      },
      render: {
        id: 'test-render',
        dist: {
          id: 'test-render-dist'
        },
        static: {
          id: 'test-render-static',
          prefix: 'test-render-static-prefix'
        }
      },
      server: {},
      serverMiddleware: []
    },
    hook: jest.fn(),
    ready: jest.fn(),
    callHook: jest.fn(),
    resolver: {
      requireModule: jest.fn()
    }
  })

  beforeAll(() => {
    jest.spyOn(path, 'join').mockImplementation((...args) => `join(${args.join(', ')})`)
    jest.spyOn(path, 'resolve').mockImplementation((...args) => `resolve(${args.join(', ')})`)
    connect.mockReturnValue({ use: jest.fn() })
    serveStatic.mockImplementation(dir => ({ id: 'test-serve-static', dir }))
    createModernMiddleware.mockImplementation(options => ({
      id: 'test-modern-middleware',
      ...options
    }))
    nuxtMiddleware.mockImplementation(options => ({
      id: 'test-nuxt-middleware',
      ...options
    }))
    errorMiddleware.mockImplementation(options => ({
      id: 'test-error-middleware',
      ...options
    }))
    createTimingMiddleware.mockImplementation(options => ({
      id: 'test-timing-middleware',
      ...options
    }))
    launchMiddleware.mockImplementation(options => ({
      id: 'test-open-in-editor-middleware',
      ...options
    }))
    servePlaceholder.mockImplementation(options => ({
      key: 'test-serve-placeholder',
      ...options
    }))
  })

  afterAll(() => {
    path.join.mockRestore()
    path.resolve.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should construct server', () => {
    const nuxt = createNuxt()
    determineGlobals.mockReturnValueOnce({
      ...nuxt.options.globals,
      name: nuxt.options.globalName
    })
    let server = new Server(nuxt)

    expect(server.nuxt).toBe(nuxt)
    expect(server.options).toBe(nuxt.options)
    expect(server.publicPath).toBe('__nuxt_test')
    expect(server.resources).toEqual({})
    expect(server.devMiddleware).toBeNull()
    expect(server.hotMiddleware).toBeNull()
    expect(server.listeners).toEqual([])
    expect(connect).toBeCalledTimes(1)
    expect(server.nuxt.hook).toBeCalledTimes(1)
    expect(server.nuxt.hook).toBeCalledWith('close', expect.any(Function))

    const closeHook = server.nuxt.hook.mock.calls[0][1]
    server.close = jest.fn()
    expect(server.close).not.toBeCalled()
    closeHook()
    expect(server.close).toBeCalledTimes(1)

    nuxt.options.build._publicPath = 'http://localhost:3000/test'
    isUrl.mockReturnValueOnce(true)
    server = new Server(nuxt)
    expect(server.publicPath).toBe(nuxt.options.build._publicPath)
  })

  test('should be ready for listening', async () => {
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    const renderer = {
      ready: jest.fn()
    }
    const context = jest.fn()
    VueRenderer.mockImplementationOnce(() => renderer)
    ServerContext.mockImplementationOnce(() => context)
    server.setupMiddleware = jest.fn()
    path.join.mockRestore()
    path.resolve.mockRestore()

    await server.ready()

    expect(server.nuxt.callHook).toBeCalledTimes(2)
    expect(server.nuxt.callHook).nthCalledWith(1, 'render:before', server, server.options.render)
    expect(server.nuxt.callHook).nthCalledWith(2, 'render:done', server)
    expect(ServerContext).toBeCalledTimes(1)
    expect(ServerContext).toBeCalledWith(server)
    expect(VueRenderer).toBeCalledTimes(1)
    expect(VueRenderer).toBeCalledWith(context)
    expect(server.renderer).toBe(renderer)
    expect(renderer.ready).toBeCalledTimes(1)
    expect(server.setupMiddleware).toBeCalledTimes(1)

    jest.spyOn(path, 'join').mockImplementation((...args) => `join(${args.join(', ')})`)
    jest.spyOn(path, 'resolve').mockImplementation((...args) => `resolve(${args.join(', ')})`)
  })

  test('should setup middleware', async () => {
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()

    expect(server.nuxt.callHook).toBeCalledTimes(2)
    expect(server.nuxt.callHook).nthCalledWith(1, 'render:setupMiddleware', server.app)
    expect(server.nuxt.callHook).nthCalledWith(2, 'render:errorMiddleware', server.app)

    expect(server.useMiddleware).toBeCalledTimes(5)
    expect(serveStatic).toBeCalledTimes(2)
    expect(serveStatic).nthCalledWith(1, 'resolve(/var/nuxt/src, var/nuxt/static)', server.options.render.static)
    expect(server.useMiddleware).nthCalledWith(1, {
      dir: 'resolve(/var/nuxt/src, var/nuxt/static)',
      id: 'test-serve-static',
      prefix: 'test-render-static-prefix'
    })
    expect(serveStatic).nthCalledWith(2, 'resolve(/var/nuxt/build, dist, client)', server.options.render.dist)
    expect(server.useMiddleware).nthCalledWith(2, {
      handler: {
        dir: 'resolve(/var/nuxt/build, dist, client)',
        id: 'test-serve-static'
      },
      path: '__nuxt_test'
    })

    const modernMiddleware = {
      context: server.renderer.context
    }
    expect(createModernMiddleware).toBeCalledTimes(1)
    expect(createModernMiddleware).toBeCalledWith(modernMiddleware)
    expect(server.useMiddleware).nthCalledWith(3, {
      id: 'test-modern-middleware',
      ...modernMiddleware
    })

    const nuxtMiddlewareOpts = {
      options: server.options,
      nuxt: server.nuxt,
      renderRoute: expect.any(Function),
      resources: server.resources
    }
    expect(nuxtMiddleware).toBeCalledTimes(1)
    expect(nuxtMiddleware).toBeCalledWith(nuxtMiddlewareOpts)
    expect(server.useMiddleware).nthCalledWith(4, {
      id: 'test-nuxt-middleware',
      ...nuxtMiddlewareOpts
    })

    const errorMiddlewareOpts = {
      resources: server.resources,
      options: server.options
    }
    expect(errorMiddleware).toBeCalledTimes(1)
    expect(errorMiddleware).toBeCalledWith(errorMiddlewareOpts)
    expect(server.useMiddleware).nthCalledWith(5, {
      id: 'test-error-middleware',
      ...errorMiddlewareOpts
    })
  })

  test('should setup compressor middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.render.compressor = jest.fn()
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()
    expect(server.useMiddleware).nthCalledWith(1, nuxt.options.render.compressor)

    server.useMiddleware.mockClear()
    nuxt.options.render.compressor = { id: 'test-render-compressor' }
    nuxt.resolver.requireModule.mockImplementationOnce(name => jest.fn(options => ({
      name,
      ...options
    })))
    await server.setupMiddleware()
    expect(nuxt.resolver.requireModule).nthCalledWith(1, 'compression')
    expect(server.useMiddleware).nthCalledWith(1, {
      id: 'test-render-compressor',
      name: 'compression'
    })
  })

  test('should setup timing middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.server.timing = { id: 'test-server-timing' }
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()

    expect(createTimingMiddleware).nthCalledWith(1, { id: 'test-server-timing' })
    expect(server.useMiddleware).nthCalledWith(1, { id: 'test-server-timing' })
  })

  test('should setup dev middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.dev = true
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()

    expect(server.useMiddleware).nthCalledWith(1, {
      id: 'test-modern-middleware',
      context: server.renderer.context
    })

    const devMiddleware = server.useMiddleware.mock.calls[1][0]

    const req = { id: 'req' }
    const res = { id: 'res' }
    const next = jest.fn()
    await devMiddleware(req, res, next)
    expect(next).toBeCalledTimes(1)

    next.mockClear()
    server.devMiddleware = { client: jest.fn() }
    server.hotMiddleware = { client: jest.fn() }
    await devMiddleware(req, res, next)
    expect(server.devMiddleware.client).nthCalledWith(1, req, res)
    expect(server.hotMiddleware.client).nthCalledWith(1, req, res)
    expect(next).toBeCalledTimes(1)

    next.mockClear()
    req.modernMode = true
    server.devMiddleware = { modern: jest.fn() }
    server.hotMiddleware = { modern: jest.fn() }
    await devMiddleware(req, res, next)
    expect(server.devMiddleware.modern).nthCalledWith(1, req, res)
    expect(server.hotMiddleware.modern).nthCalledWith(1, req, res)
    expect(next).toBeCalledTimes(1)
  })

  test('should setup open-in-editor middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.dev = true
    nuxt.options.debug = true
    nuxt.options.editor = { id: 'test-editor' }
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()

    expect(launchMiddleware).toBeCalledTimes(1)
    expect(launchMiddleware).toBeCalledWith({ id: 'test-editor' })

    expect(server.useMiddleware).nthCalledWith(3, {
      handler: { id: 'test-editor' },
      path: '__open-in-editor'
    })
  })

  test('should setup server middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.serverMiddleware = [
      { id: 'test-server-middleware-1' },
      { id: 'test-server-middleware-2' }
    ]
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()

    expect(server.useMiddleware).nthCalledWith(4, { id: 'test-server-middleware-1' })
    expect(server.useMiddleware).nthCalledWith(5, { id: 'test-server-middleware-2' })
  })

  test('should setup fallback middleware', async () => {
    const nuxt = createNuxt()
    nuxt.options.render.fallback = {
      dist: { id: 'test-render-fallback-dist' },
      static: { id: 'test-render-fallback-static' }
    }
    const server = new Server(nuxt)
    server.useMiddleware = jest.fn()
    server.renderer = {
      context: { id: 'test-server-context' }
    }

    await server.setupMiddleware()
    expect(servePlaceholder).toBeCalledTimes(2)
    expect(server.useMiddleware).nthCalledWith(4, {
      handler: {
        id: 'test-render-fallback-dist',
        key: 'test-serve-placeholder'
      },
      path: '__nuxt_test'
    })
    expect(server.useMiddleware).nthCalledWith(5, {
      handler: {
        id: 'test-render-fallback-static',
        key: 'test-serve-placeholder'
      },
      path: '/'
    })

    servePlaceholder.mockClear()
    nuxt.options.render.fallback = {}
    await server.setupMiddleware()
    expect(servePlaceholder).not.toBeCalled()
  })

  test('should use object middleware', () => {
    const nuxt = createNuxt()
    nuxt.options.router = { base: '/' }
    const server = new Server(nuxt)
    const handler = jest.fn()

    server.useMiddleware({
      handler
    })

    expect(nuxt.resolver.requireModule).not.toBeCalled()
    expect(server.app.use).toBeCalledTimes(1)
    expect(server.app.use).toBeCalledWith(nuxt.options.router.base, handler)
  })

  test('should use function module middleware', () => {
    const nuxt = createNuxt()
    nuxt.options.router = { base: '/' }
    const server = new Server(nuxt)
    const handler = jest.fn()
    nuxt.resolver.requireModule.mockReturnValueOnce(handler)

    server.useMiddleware('test-middleware')

    expect(nuxt.resolver.requireModule).toBeCalledTimes(1)
    expect(nuxt.resolver.requireModule).toBeCalledWith('test-middleware')
    expect(server.app.use).toBeCalledTimes(1)
    expect(server.app.use).toBeCalledWith(nuxt.options.router.base, handler)
  })

  test('should use object module middleware', () => {
    const nuxt = createNuxt()
    nuxt.options.router = { base: '/' }
    const server = new Server(nuxt)
    const handler = jest.fn()
    nuxt.resolver.requireModule.mockReturnValueOnce({
      handler,
      prefix: false,
      path: '//middleware'
    })

    server.useMiddleware('test-middleware')

    expect(nuxt.resolver.requireModule).toBeCalledTimes(1)
    expect(nuxt.resolver.requireModule).toBeCalledWith('test-middleware')
    expect(server.app.use).toBeCalledTimes(1)
    expect(server.app.use).toBeCalledWith('/middleware', handler)
  })

  test('should throw error when module resolves failed', () => {
    const nuxt = createNuxt()
    nuxt.options.router = { base: '/' }
    const server = new Server(nuxt)
    const error = Error('middleware resolves failed')
    nuxt.resolver.requireModule.mockImplementationOnce(() => {
      throw error
    })

    expect(() => server.useMiddleware('test-middleware')).toThrow(error)
    expect(consola.error).toBeCalledTimes(1)
    expect(consola.error).toBeCalledWith(error)
  })

  test('should only log error when module resolves failed in dev mode', () => {
    const nuxt = createNuxt()
    nuxt.options.dev = true
    nuxt.options.router = { base: '/' }
    const server = new Server(nuxt)
    const error = Error('middleware resolves failed')
    nuxt.resolver.requireModule.mockImplementationOnce(() => {
      throw error
    })

    server.useMiddleware('test-middleware')

    expect(consola.error).toBeCalledTimes(1)
    expect(consola.error).toBeCalledWith(error)
  })

  test('should render route via renderer', () => {
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    server.renderer = { renderRoute: jest.fn() }

    server.renderRoute('test-render-route')

    expect(server.renderer.renderRoute).toBeCalledTimes(1)
    expect(server.renderer.renderRoute).toBeCalledWith('test-render-route')
  })

  test('should load resources via renderer', () => {
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    server.renderer = { loadResources: jest.fn() }

    server.loadResources('test-load-resources')

    expect(server.renderer.loadResources).toBeCalledTimes(1)
    expect(server.renderer.loadResources).toBeCalledWith('test-load-resources')
  })

  test('should render and get window', () => {
    const nuxt = createNuxt()
    const globals = {
      ...nuxt.options.globals,
      name: nuxt.options.globalName,
      loadedCallback: jest.fn()
    }
    determineGlobals.mockReturnValueOnce(globals)
    const server = new Server(nuxt)

    server.renderAndGetWindow('/render/window')

    expect(renderAndGetWindow).toBeCalledTimes(1)
    expect(renderAndGetWindow).toBeCalledWith('/render/window', {}, {
      loadedCallback: globals.loadedCallback,
      ssr: nuxt.options.render.ssr,
      globals: globals
    })
  })

  test('should listen server', async () => {
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    const listener = {
      listen: jest.fn(),
      server: jest.fn()
    }
    Listener.mockImplementationOnce(() => {
      return listener
    })

    await server.listen(3000, 'localhost', '/var/nuxt/unix.socket')

    expect(Listener).toBeCalledWith({
      port: 3000,
      host: 'localhost',
      socket: '/var/nuxt/unix.socket',
      https: undefined,
      app: server.app,
      dev: server.options.dev
    })
    expect(listener.listen).toBeCalledTimes(1)
    expect(server.listeners).toEqual([ listener ])
    expect(server.nuxt.callHook).toBeCalledTimes(1)
    expect(server.nuxt.callHook).toBeCalledWith('listen', listener.server, listener)
  })

  test('should listen server via options.server', async () => {
    const nuxt = createNuxt()
    nuxt.options.server = {
      host: 'localhost',
      port: '3000',
      socket: '/var/nuxt/unix.socket',
      https: true
    }
    const server = new Server(nuxt)

    await server.listen()

    expect(Listener).toBeCalledWith({
      ...nuxt.options.server,
      app: server.app,
      dev: server.options.dev
    })
  })

  test('should close server', async () => {
    const removeAllListeners = jest.fn()
    connect.mockReturnValueOnce({ use: jest.fn(), removeAllListeners })
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    const listener = { close: jest.fn() }
    server.listeners = [ listener ]
    server.renderer = { close: jest.fn() }
    server.resources = { id: 'test-resources' }

    await server.close()

    expect(server.__closed).toEqual(true)
    expect(listener.close).toBeCalledTimes(1)
    expect(server.listeners).toEqual([])
    expect(server.renderer.close).toBeCalledTimes(1)
    expect(removeAllListeners).toBeCalledTimes(1)
    expect(server.app).toBeNull()
    expect(server.resources).toEqual({})
  })

  test('should prevent closing server multiple times', async () => {
    const removeAllListeners = jest.fn()
    connect.mockReturnValueOnce({ use: jest.fn(), removeAllListeners })
    const nuxt = createNuxt()
    const server = new Server(nuxt)
    server.renderer = {}

    await server.close()

    expect(server.__closed).toEqual(true)
    expect(removeAllListeners).toBeCalledTimes(1)

    removeAllListeners.mockClear()

    await server.close()

    expect(server.__closed).toEqual(true)
    expect(removeAllListeners).not.toBeCalled()
  })
})
