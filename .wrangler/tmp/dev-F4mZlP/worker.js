var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
var init_utils = __esm({
  "node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(createNotImplementedError, "createNotImplementedError");
    __name(notImplemented, "notImplemented");
    __name(notImplementedClass, "notImplementedClass");
  }
});

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin, _performanceNow, nodeTiming, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList, Performance, PerformanceObserver, performance;
var init_performance = __esm({
  "node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
    nodeTiming = {
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: 0,
      nodeStart: 0,
      v8Start: 0,
      bootstrapComplete: 0,
      environment: 0,
      loopStart: 0,
      loopExit: 0,
      idleTime: 0,
      uvMetricsInfo: {
        loopCount: 0,
        events: 0,
        eventsWaiting: 0
      },
      detail: void 0,
      toJSON() {
        return this;
      }
    };
    PerformanceEntry = class {
      static {
        __name(this, "PerformanceEntry");
      }
      __unenv__ = true;
      detail;
      entryType = "event";
      name;
      startTime;
      constructor(name, options) {
        this.name = name;
        this.startTime = options?.startTime || _performanceNow();
        this.detail = options?.detail;
      }
      get duration() {
        return _performanceNow() - this.startTime;
      }
      toJSON() {
        return {
          name: this.name,
          entryType: this.entryType,
          startTime: this.startTime,
          duration: this.duration,
          detail: this.detail
        };
      }
    };
    PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
      static {
        __name(this, "PerformanceMark");
      }
      entryType = "mark";
      constructor() {
        super(...arguments);
      }
      get duration() {
        return 0;
      }
    };
    PerformanceMeasure = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceMeasure");
      }
      entryType = "measure";
    };
    PerformanceResourceTiming = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceResourceTiming");
      }
      entryType = "resource";
      serverTiming = [];
      connectEnd = 0;
      connectStart = 0;
      decodedBodySize = 0;
      domainLookupEnd = 0;
      domainLookupStart = 0;
      encodedBodySize = 0;
      fetchStart = 0;
      initiatorType = "";
      name = "";
      nextHopProtocol = "";
      redirectEnd = 0;
      redirectStart = 0;
      requestStart = 0;
      responseEnd = 0;
      responseStart = 0;
      secureConnectionStart = 0;
      startTime = 0;
      transferSize = 0;
      workerStart = 0;
      responseStatus = 0;
    };
    PerformanceObserverEntryList = class {
      static {
        __name(this, "PerformanceObserverEntryList");
      }
      __unenv__ = true;
      getEntries() {
        return [];
      }
      getEntriesByName(_name, _type) {
        return [];
      }
      getEntriesByType(type) {
        return [];
      }
    };
    Performance = class {
      static {
        __name(this, "Performance");
      }
      __unenv__ = true;
      timeOrigin = _timeOrigin;
      eventCounts = /* @__PURE__ */ new Map();
      _entries = [];
      _resourceTimingBufferSize = 0;
      navigation = void 0;
      timing = void 0;
      timerify(_fn, _options) {
        throw createNotImplementedError("Performance.timerify");
      }
      get nodeTiming() {
        return nodeTiming;
      }
      eventLoopUtilization() {
        return {};
      }
      markResourceTiming() {
        return new PerformanceResourceTiming("");
      }
      onresourcetimingbufferfull = null;
      now() {
        if (this.timeOrigin === _timeOrigin) {
          return _performanceNow();
        }
        return Date.now() - this.timeOrigin;
      }
      clearMarks(markName) {
        this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
      }
      clearMeasures(measureName) {
        this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
      }
      clearResourceTimings() {
        this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
      }
      getEntries() {
        return this._entries;
      }
      getEntriesByName(name, type) {
        return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
      }
      getEntriesByType(type) {
        return this._entries.filter((e) => e.entryType === type);
      }
      mark(name, options) {
        const entry = new PerformanceMark(name, options);
        this._entries.push(entry);
        return entry;
      }
      measure(measureName, startOrMeasureOptions, endMark) {
        let start;
        let end;
        if (typeof startOrMeasureOptions === "string") {
          start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
          end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
        } else {
          start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
          end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
        }
        const entry = new PerformanceMeasure(measureName, {
          startTime: start,
          detail: {
            start,
            end
          }
        });
        this._entries.push(entry);
        return entry;
      }
      setResourceTimingBufferSize(maxSize) {
        this._resourceTimingBufferSize = maxSize;
      }
      addEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.addEventListener");
      }
      removeEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.removeEventListener");
      }
      dispatchEvent(event) {
        throw createNotImplementedError("Performance.dispatchEvent");
      }
      toJSON() {
        return this;
      }
    };
    PerformanceObserver = class {
      static {
        __name(this, "PerformanceObserver");
      }
      __unenv__ = true;
      static supportedEntryTypes = [];
      _callback = null;
      constructor(callback) {
        this._callback = callback;
      }
      takeRecords() {
        return [];
      }
      disconnect() {
        throw createNotImplementedError("PerformanceObserver.disconnect");
      }
      observe(options) {
        throw createNotImplementedError("PerformanceObserver.observe");
      }
      bind(fn) {
        return fn;
      }
      runInAsyncScope(fn, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      }
      asyncId() {
        return 0;
      }
      triggerAsyncId() {
        return 0;
      }
      emitDestroy() {
        return this;
      }
    };
    performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
  }
});

// node_modules/unenv/dist/runtime/node/perf_hooks.mjs
var init_perf_hooks = __esm({
  "node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
var init_performance2 = __esm({
  "node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
    globalThis.performance = performance;
    globalThis.Performance = Performance;
    globalThis.PerformanceEntry = PerformanceEntry;
    globalThis.PerformanceMark = PerformanceMark;
    globalThis.PerformanceMeasure = PerformanceMeasure;
    globalThis.PerformanceObserver = PerformanceObserver;
    globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
    globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
  }
});

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default;
var init_noop = __esm({
  "node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default = Object.assign(() => {
    }, { __unenv__: true });
  }
});

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";
var _console, _ignoreErrors, _stderr, _stdout, log, info, trace, debug, table, error, warn, createTask, clear, count, countReset, dir, dirxml, group, groupEnd, groupCollapsed, profile, profileEnd, time, timeEnd, timeLog, timeStamp, Console, _times, _stdoutErrorHandler, _stderrErrorHandler;
var init_console = __esm({
  "node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console = globalThis.console;
    _ignoreErrors = true;
    _stderr = new Writable();
    _stdout = new Writable();
    log = _console?.log ?? noop_default;
    info = _console?.info ?? log;
    trace = _console?.trace ?? info;
    debug = _console?.debug ?? log;
    table = _console?.table ?? log;
    error = _console?.error ?? log;
    warn = _console?.warn ?? error;
    createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
    clear = _console?.clear ?? noop_default;
    count = _console?.count ?? noop_default;
    countReset = _console?.countReset ?? noop_default;
    dir = _console?.dir ?? noop_default;
    dirxml = _console?.dirxml ?? noop_default;
    group = _console?.group ?? noop_default;
    groupEnd = _console?.groupEnd ?? noop_default;
    groupCollapsed = _console?.groupCollapsed ?? noop_default;
    profile = _console?.profile ?? noop_default;
    profileEnd = _console?.profileEnd ?? noop_default;
    time = _console?.time ?? noop_default;
    timeEnd = _console?.timeEnd ?? noop_default;
    timeLog = _console?.timeLog ?? noop_default;
    timeStamp = _console?.timeStamp ?? noop_default;
    Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
    _times = /* @__PURE__ */ new Map();
    _stdoutErrorHandler = noop_default;
    _stderrErrorHandler = noop_default;
  }
});

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole, assert, clear2, context, count2, countReset2, createTask2, debug2, dir2, dirxml2, error2, group2, groupCollapsed2, groupEnd2, info2, log2, profile2, profileEnd2, table2, time2, timeEnd2, timeLog2, timeStamp2, trace2, warn2, console_default;
var init_console2 = __esm({
  "node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole = globalThis["console"];
    ({
      assert,
      clear: clear2,
      context: (
        // @ts-expect-error undocumented public API
        context
      ),
      count: count2,
      countReset: countReset2,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask2
      ),
      debug: debug2,
      dir: dir2,
      dirxml: dirxml2,
      error: error2,
      group: group2,
      groupCollapsed: groupCollapsed2,
      groupEnd: groupEnd2,
      info: info2,
      log: log2,
      profile: profile2,
      profileEnd: profileEnd2,
      table: table2,
      time: time2,
      timeEnd: timeEnd2,
      timeLog: timeLog2,
      timeStamp: timeStamp2,
      trace: trace2,
      warn: warn2
    } = workerdConsole);
    Object.assign(workerdConsole, {
      Console,
      _ignoreErrors,
      _stderr,
      _stderrErrorHandler,
      _stdout,
      _stdoutErrorHandler,
      _times
    });
    console_default = workerdConsole;
  }
});

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default;
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime;
var init_hrtime = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
      const now = Date.now();
      const seconds = Math.trunc(now / 1e3);
      const nanos = now % 1e3 * 1e6;
      if (startTime) {
        let diffSeconds = seconds - startTime[0];
        let diffNanos = nanos - startTime[0];
        if (diffNanos < 0) {
          diffSeconds = diffSeconds - 1;
          diffNanos = 1e9 + diffNanos;
        }
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanos];
    }, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
      return BigInt(Date.now() * 1e6);
    }, "bigint") });
  }
});

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream;
var init_read_stream = __esm({
  "node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream = class {
      static {
        __name(this, "ReadStream");
      }
      fd;
      isRaw = false;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      setRawMode(mode) {
        this.isRaw = mode;
        return this;
      }
    };
  }
});

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream;
var init_write_stream = __esm({
  "node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream = class {
      static {
        __name(this, "WriteStream");
      }
      fd;
      columns = 80;
      rows = 24;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      clearLine(dir3, callback) {
        callback && callback();
        return false;
      }
      clearScreenDown(callback) {
        callback && callback();
        return false;
      }
      cursorTo(x, y, callback) {
        callback && typeof callback === "function" && callback();
        return false;
      }
      moveCursor(dx, dy, callback) {
        callback && callback();
        return false;
      }
      getColorDepth(env2) {
        return 1;
      }
      hasColors(count3, env2) {
        return false;
      }
      getWindowSize() {
        return [this.columns, this.rows];
      }
      write(str, encoding, cb) {
        if (str instanceof Uint8Array) {
          str = new TextDecoder().decode(str);
        }
        try {
          console.log(str);
        } catch {
        }
        cb && typeof cb === "function" && cb();
        return false;
      }
    };
  }
});

// node_modules/unenv/dist/runtime/node/tty.mjs
var init_tty = __esm({
  "node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION;
var init_node_version = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NODE_VERSION = "22.14.0";
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";
var Process;
var init_process = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    init_node_version();
    Process = class _Process extends EventEmitter {
      static {
        __name(this, "Process");
      }
      env;
      hrtime;
      nextTick;
      constructor(impl) {
        super();
        this.env = impl.env;
        this.hrtime = impl.hrtime;
        this.nextTick = impl.nextTick;
        for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
          const value = this[prop];
          if (typeof value === "function") {
            this[prop] = value.bind(this);
          }
        }
      }
      // --- event emitter ---
      emitWarning(warning, type, code) {
        console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
      }
      emit(...args) {
        return super.emit(...args);
      }
      listeners(eventName) {
        return super.listeners(eventName);
      }
      // --- stdio (lazy initializers) ---
      #stdin;
      #stdout;
      #stderr;
      get stdin() {
        return this.#stdin ??= new ReadStream(0);
      }
      get stdout() {
        return this.#stdout ??= new WriteStream(1);
      }
      get stderr() {
        return this.#stderr ??= new WriteStream(2);
      }
      // --- cwd ---
      #cwd = "/";
      chdir(cwd2) {
        this.#cwd = cwd2;
      }
      cwd() {
        return this.#cwd;
      }
      // --- dummy props and getters ---
      arch = "";
      platform = "";
      argv = [];
      argv0 = "";
      execArgv = [];
      execPath = "";
      title = "";
      pid = 200;
      ppid = 100;
      get version() {
        return `v${NODE_VERSION}`;
      }
      get versions() {
        return { node: NODE_VERSION };
      }
      get allowedNodeEnvironmentFlags() {
        return /* @__PURE__ */ new Set();
      }
      get sourceMapsEnabled() {
        return false;
      }
      get debugPort() {
        return 0;
      }
      get throwDeprecation() {
        return false;
      }
      get traceDeprecation() {
        return false;
      }
      get features() {
        return {};
      }
      get release() {
        return {};
      }
      get connected() {
        return false;
      }
      get config() {
        return {};
      }
      get moduleLoadList() {
        return [];
      }
      constrainedMemory() {
        return 0;
      }
      availableMemory() {
        return 0;
      }
      uptime() {
        return 0;
      }
      resourceUsage() {
        return {};
      }
      // --- noop methods ---
      ref() {
      }
      unref() {
      }
      // --- unimplemented methods ---
      umask() {
        throw createNotImplementedError("process.umask");
      }
      getBuiltinModule() {
        return void 0;
      }
      getActiveResourcesInfo() {
        throw createNotImplementedError("process.getActiveResourcesInfo");
      }
      exit() {
        throw createNotImplementedError("process.exit");
      }
      reallyExit() {
        throw createNotImplementedError("process.reallyExit");
      }
      kill() {
        throw createNotImplementedError("process.kill");
      }
      abort() {
        throw createNotImplementedError("process.abort");
      }
      dlopen() {
        throw createNotImplementedError("process.dlopen");
      }
      setSourceMapsEnabled() {
        throw createNotImplementedError("process.setSourceMapsEnabled");
      }
      loadEnvFile() {
        throw createNotImplementedError("process.loadEnvFile");
      }
      disconnect() {
        throw createNotImplementedError("process.disconnect");
      }
      cpuUsage() {
        throw createNotImplementedError("process.cpuUsage");
      }
      setUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
      }
      hasUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
      }
      initgroups() {
        throw createNotImplementedError("process.initgroups");
      }
      openStdin() {
        throw createNotImplementedError("process.openStdin");
      }
      assert() {
        throw createNotImplementedError("process.assert");
      }
      binding() {
        throw createNotImplementedError("process.binding");
      }
      // --- attached interfaces ---
      permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
      report = {
        directory: "",
        filename: "",
        signal: "SIGUSR2",
        compact: false,
        reportOnFatalError: false,
        reportOnSignal: false,
        reportOnUncaughtException: false,
        getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
        writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
      };
      finalization = {
        register: /* @__PURE__ */ notImplemented("process.finalization.register"),
        unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
        registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
      };
      memoryUsage = Object.assign(() => ({
        arrayBuffers: 0,
        rss: 0,
        external: 0,
        heapTotal: 0,
        heapUsed: 0
      }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
      // --- undefined props ---
      mainModule = void 0;
      domain = void 0;
      // optional
      send = void 0;
      exitCode = void 0;
      channel = void 0;
      getegid = void 0;
      geteuid = void 0;
      getgid = void 0;
      getgroups = void 0;
      getuid = void 0;
      setegid = void 0;
      seteuid = void 0;
      setgid = void 0;
      setgroups = void 0;
      setuid = void 0;
      // internals
      _events = void 0;
      _eventsCount = void 0;
      _exiting = void 0;
      _maxListeners = void 0;
      _debugEnd = void 0;
      _debugProcess = void 0;
      _fatalException = void 0;
      _getActiveHandles = void 0;
      _getActiveRequests = void 0;
      _kill = void 0;
      _preload_modules = void 0;
      _rawDebug = void 0;
      _startProfilerIdleNotifier = void 0;
      _stopProfilerIdleNotifier = void 0;
      _tickCallback = void 0;
      _disconnect = void 0;
      _handleQueue = void 0;
      _pendingMessage = void 0;
      _channel = void 0;
      _send = void 0;
      _linkedBinding = void 0;
    };
  }
});

// node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess, getBuiltinModule, workerdProcess, isWorkerdProcessV2, unenvProcess, exit, features, platform, env, hrtime3, nextTick, _channel, _disconnect, _events, _eventsCount, _handleQueue, _maxListeners, _pendingMessage, _send, assert2, disconnect, mainModule, _debugEnd, _debugProcess, _exiting, _fatalException, _getActiveHandles, _getActiveRequests, _kill, _linkedBinding, _preload_modules, _rawDebug, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, abort, addListener, allowedNodeEnvironmentFlags, arch, argv, argv0, availableMemory, binding, channel, chdir, config, connected, constrainedMemory, cpuUsage, cwd, debugPort, dlopen, domain, emit, emitWarning, eventNames, execArgv, execPath, exitCode, finalization, getActiveResourcesInfo, getegid, geteuid, getgid, getgroups, getMaxListeners, getuid, hasUncaughtExceptionCaptureCallback, initgroups, kill, listenerCount, listeners, loadEnvFile, memoryUsage, moduleLoadList, off, on, once, openStdin, permission, pid, ppid, prependListener, prependOnceListener, rawListeners, reallyExit, ref, release, removeAllListeners, removeListener, report, resourceUsage, send, setegid, seteuid, setgid, setgroups, setMaxListeners, setSourceMapsEnabled, setuid, setUncaughtExceptionCaptureCallback, sourceMapsEnabled, stderr, stdin, stdout, throwDeprecation, title, traceDeprecation, umask, unref, uptime, version, versions, _process, process_default;
var init_process2 = __esm({
  "node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess = globalThis["process"];
    getBuiltinModule = globalProcess.getBuiltinModule;
    workerdProcess = getBuiltinModule("node:process");
    isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
    unenvProcess = new Process({
      env: globalProcess.env,
      // `hrtime` is only available from workerd process v2
      hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
      // `nextTick` is available from workerd process v1
      nextTick: workerdProcess.nextTick
    });
    ({ exit, features, platform } = workerdProcess);
    ({
      env: (
        // Always implemented by workerd
        env
      ),
      hrtime: (
        // Only implemented in workerd v2
        hrtime3
      ),
      nextTick: (
        // Always implemented by workerd
        nextTick
      )
    } = unenvProcess);
    ({
      _channel,
      _disconnect,
      _events,
      _eventsCount,
      _handleQueue,
      _maxListeners,
      _pendingMessage,
      _send,
      assert: assert2,
      disconnect,
      mainModule
    } = unenvProcess);
    ({
      _debugEnd: (
        // @ts-expect-error `_debugEnd` is missing typings
        _debugEnd
      ),
      _debugProcess: (
        // @ts-expect-error `_debugProcess` is missing typings
        _debugProcess
      ),
      _exiting: (
        // @ts-expect-error `_exiting` is missing typings
        _exiting
      ),
      _fatalException: (
        // @ts-expect-error `_fatalException` is missing typings
        _fatalException
      ),
      _getActiveHandles: (
        // @ts-expect-error `_getActiveHandles` is missing typings
        _getActiveHandles
      ),
      _getActiveRequests: (
        // @ts-expect-error `_getActiveRequests` is missing typings
        _getActiveRequests
      ),
      _kill: (
        // @ts-expect-error `_kill` is missing typings
        _kill
      ),
      _linkedBinding: (
        // @ts-expect-error `_linkedBinding` is missing typings
        _linkedBinding
      ),
      _preload_modules: (
        // @ts-expect-error `_preload_modules` is missing typings
        _preload_modules
      ),
      _rawDebug: (
        // @ts-expect-error `_rawDebug` is missing typings
        _rawDebug
      ),
      _startProfilerIdleNotifier: (
        // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
        _startProfilerIdleNotifier
      ),
      _stopProfilerIdleNotifier: (
        // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
        _stopProfilerIdleNotifier
      ),
      _tickCallback: (
        // @ts-expect-error `_tickCallback` is missing typings
        _tickCallback
      ),
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      arch,
      argv,
      argv0,
      availableMemory,
      binding: (
        // @ts-expect-error `binding` is missing typings
        binding
      ),
      channel,
      chdir,
      config,
      connected,
      constrainedMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      domain: (
        // @ts-expect-error `domain` is missing typings
        domain
      ),
      emit,
      emitWarning,
      eventNames,
      execArgv,
      execPath,
      exitCode,
      finalization,
      getActiveResourcesInfo,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getMaxListeners,
      getuid,
      hasUncaughtExceptionCaptureCallback,
      initgroups: (
        // @ts-expect-error `initgroups` is missing typings
        initgroups
      ),
      kill,
      listenerCount,
      listeners,
      loadEnvFile,
      memoryUsage,
      moduleLoadList: (
        // @ts-expect-error `moduleLoadList` is missing typings
        moduleLoadList
      ),
      off,
      on,
      once,
      openStdin: (
        // @ts-expect-error `openStdin` is missing typings
        openStdin
      ),
      permission,
      pid,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      reallyExit: (
        // @ts-expect-error `reallyExit` is missing typings
        reallyExit
      ),
      ref,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      send,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setMaxListeners,
      setSourceMapsEnabled,
      setuid,
      setUncaughtExceptionCaptureCallback,
      sourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      throwDeprecation,
      title,
      traceDeprecation,
      umask,
      unref,
      uptime,
      version,
      versions
    } = isWorkerdProcessV2 ? workerdProcess : unenvProcess);
    _process = {
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      hasUncaughtExceptionCaptureCallback,
      setUncaughtExceptionCaptureCallback,
      loadEnvFile,
      sourceMapsEnabled,
      arch,
      argv,
      argv0,
      chdir,
      config,
      connected,
      constrainedMemory,
      availableMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      disconnect,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exit,
      finalization,
      features,
      getBuiltinModule,
      getActiveResourcesInfo,
      getMaxListeners,
      hrtime: hrtime3,
      kill,
      listeners,
      listenerCount,
      memoryUsage,
      nextTick,
      on,
      off,
      once,
      pid,
      platform,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      setMaxListeners,
      setSourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      title,
      throwDeprecation,
      traceDeprecation,
      umask,
      uptime,
      version,
      versions,
      // @ts-expect-error old API
      domain,
      initgroups,
      moduleLoadList,
      reallyExit,
      openStdin,
      assert: assert2,
      binding,
      send,
      exitCode,
      channel,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getuid,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setuid,
      permission,
      mainModule,
      _events,
      _eventsCount,
      _exiting,
      _maxListeners,
      _debugEnd,
      _debugProcess,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _kill,
      _preload_modules,
      _rawDebug,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      _disconnect,
      _handleQueue,
      _pendingMessage,
      _channel,
      _send,
      _linkedBinding
    };
    process_default = _process;
  }
});

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default;
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
  }
});

// node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// src/rpc/rpc-target.ts
var rpc_target_exports = {};
__export(rpc_target_exports, {
  BatchedRpcExecutor: () => BatchedRpcExecutor,
  MondoRpcTarget: () => MondoRpcTarget,
  PipelineTracker: () => PipelineTracker,
  PipelinedRpcProxy: () => PipelinedRpcProxy,
  RpcTarget: () => RpcTarget,
  newWorkersRpcResponse: () => newWorkersRpcResponse
});
async function newWorkersRpcResponse(target, request) {
  const url = new URL(request.url);
  const isBatch = url.pathname.endsWith("/batch");
  try {
    const body = await request.json();
    if (isBatch && Array.isArray(body)) {
      const results = await Promise.all(
        body.map(async (req2) => {
          try {
            const result2 = await target.invoke(req2.method, req2.params);
            return { id: req2.id, result: result2 };
          } catch (error3) {
            return {
              id: req2.id,
              error: error3 instanceof Error ? error3.message : "Unknown error"
            };
          }
        })
      );
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const req = body;
    if (!target.hasMethod(req.method)) {
      return new Response(
        JSON.stringify({ error: `Method not found: ${req.method}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const result = await target.invoke(req.method, req.params);
    return new Response(JSON.stringify({ id: req.id, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error3) {
    return new Response(
      JSON.stringify({
        error: error3 instanceof Error ? error3.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
var RpcTarget, MondoRpcTarget, BatchedRpcExecutor, pipelineOpIdCounter, PipelineTracker, PipelinedRpcProxy, PipelinedDbProxy, PipelinedCollectionProxy;
var init_rpc_target = __esm({
  "src/rpc/rpc-target.ts"() {
    "use strict";
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    RpcTarget = class {
      static {
        __name(this, "RpcTarget");
      }
      methods = /* @__PURE__ */ new Map();
      /**
       * Register a method handler
       */
      registerMethod(name, handler) {
        this.methods.set(name, handler);
      }
      /**
       * Check if a method exists
       */
      hasMethod(name) {
        return this.methods.has(name) || typeof this[name] === "function";
      }
      /**
       * Invoke a method by name
       */
      async invoke(method, params) {
        const handler = this.methods.get(method);
        if (handler) {
          return handler.apply(this, params);
        }
        const fn = this[method];
        if (typeof fn === "function") {
          return fn.apply(this, params);
        }
        throw new Error(`Method not found: ${method}`);
      }
    };
    MondoRpcTarget = class extends RpcTarget {
      static {
        __name(this, "MondoRpcTarget");
      }
      env;
      connectionString = null;
      databases = /* @__PURE__ */ new Map();
      constructor(env2) {
        super();
        this.env = env2;
      }
      /**
       * Connect to a MongoDB-compatible connection string
       */
      async connect(connectionString) {
        this.connectionString = connectionString;
        const url = new URL(connectionString.replace("mongodb://", "http://"));
        const dbName = url.pathname.slice(1) || "default";
        const id = this.env.MONDO_DATABASE.idFromName(dbName);
        const stub = this.env.MONDO_DATABASE.get(id);
        this.databases.set(dbName, { name: dbName, stub });
        return { connected: true, database: dbName };
      }
      /**
       * Get a database reference
       */
      async db(name) {
        let dbRef = this.databases.get(name);
        if (!dbRef) {
          const id = this.env.MONDO_DATABASE.idFromName(name);
          const stub = this.env.MONDO_DATABASE.get(id);
          dbRef = { name, stub };
          this.databases.set(name, dbRef);
        }
        return dbRef;
      }
      /**
       * Get a collection reference
       */
      async collection(dbName, collectionName) {
        const dbRef = await this.db(dbName);
        return {
          dbName,
          collectionName,
          stub: dbRef.stub
        };
      }
      /**
       * Execute a find operation
       */
      async find(dbName, collectionName, query) {
        const dbRef = await this.db(dbName);
        const response = await dbRef.stub.fetch("http://internal/find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: collectionName, query })
        });
        return response.json();
      }
      /**
       * Execute an insertOne operation
       */
      async insertOne(dbName, collectionName, document) {
        const dbRef = await this.db(dbName);
        const response = await dbRef.stub.fetch("http://internal/insertOne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: collectionName, document })
        });
        return response.json();
      }
      /**
       * Execute an updateOne operation
       */
      async updateOne(dbName, collectionName, filter, update) {
        const dbRef = await this.db(dbName);
        const response = await dbRef.stub.fetch("http://internal/updateOne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: collectionName, filter, update })
        });
        return response.json();
      }
      /**
       * Execute a deleteOne operation
       */
      async deleteOne(dbName, collectionName, filter) {
        const dbRef = await this.db(dbName);
        const response = await dbRef.stub.fetch("http://internal/deleteOne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: collectionName, filter })
        });
        return response.json();
      }
    };
    __name(newWorkersRpcResponse, "newWorkersRpcResponse");
    BatchedRpcExecutor = class {
      static {
        __name(this, "BatchedRpcExecutor");
      }
      stub;
      options;
      queue = [];
      flushTimer = null;
      constructor(stub, options = {}) {
        this.stub = stub;
        this.options = {
          maxBatchSize: options.maxBatchSize ?? 100,
          flushInterval: options.flushInterval ?? 10
        };
      }
      /**
       * Execute a method with batching
       */
      execute(method, params) {
        return new Promise((resolve, reject) => {
          this.queue.push({ method, params, resolve, reject });
          if (this.queue.length >= this.options.maxBatchSize) {
            this.flush();
          } else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.options.flushInterval);
          }
        });
      }
      /**
       * Flush pending requests
       */
      async flush() {
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }
        if (this.queue.length === 0) {
          return;
        }
        while (this.queue.length > 0) {
          const batch = this.queue.splice(0, this.options.maxBatchSize);
          try {
            const response = await this.stub.fetch("http://internal/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(batch.map((item, index) => ({
                id: String(index),
                method: item.method,
                params: item.params
              })))
            });
            const { results } = await response.json();
            batch.forEach((item, index) => {
              const result = results[index];
              if (result.error) {
                item.reject(new Error(result.error));
              } else {
                item.resolve(result.result);
              }
            });
          } catch (error3) {
            batch.forEach((item) => {
              item.reject(error3 instanceof Error ? error3 : new Error("Unknown error"));
            });
          }
        }
      }
    };
    pipelineOpIdCounter = 0;
    PipelineTracker = class {
      static {
        __name(this, "PipelineTracker");
      }
      operations = /* @__PURE__ */ new Map();
      dependencyGraph = /* @__PURE__ */ new Map();
      /**
       * Track a new operation
       */
      track(method, params, dependency) {
        const id = `op-${++pipelineOpIdCounter}`;
        const dependencies = [];
        if (dependency) {
          dependencies.push(dependency);
          const transitive = this.dependencyGraph.get(dependency);
          if (transitive) {
            dependencies.push(...transitive);
          }
        }
        this.operations.set(id, { id, method, params, dependencies });
        this.dependencyGraph.set(id, new Set(dependencies));
        return id;
      }
      /**
       * Get all dependencies for an operation
       */
      getDependencies(opId) {
        return Array.from(this.dependencyGraph.get(opId) || []);
      }
      /**
       * Get operation by ID
       */
      getOperation(opId) {
        return this.operations.get(opId);
      }
      /**
       * Get all operations in dependency order
       */
      getOrderedOperations() {
        const ordered = [];
        const visited = /* @__PURE__ */ new Set();
        const visit = /* @__PURE__ */ __name((id) => {
          if (visited.has(id)) return;
          visited.add(id);
          const op = this.operations.get(id);
          if (!op) return;
          op.dependencies.forEach((depId) => visit(depId));
          ordered.push(op);
        }, "visit");
        this.operations.forEach((_, id) => visit(id));
        return ordered;
      }
    };
    PipelinedRpcProxy = class {
      static {
        __name(this, "PipelinedRpcProxy");
      }
      target;
      tracker;
      currentDb = null;
      currentCollection = null;
      constructor(target) {
        this.target = target;
        this.tracker = new PipelineTracker();
      }
      /**
       * Get a database reference (pipelined)
       */
      db(name) {
        const opId = this.tracker.track("db", [name]);
        this.currentDb = name;
        return new PipelinedDbProxy(this, name, opId);
      }
      /**
       * Execute the pipelined operations
       */
      async execute() {
        if (!this.currentDb) {
          throw new Error("No database selected");
        }
        return this.target.db(this.currentDb);
      }
      /**
       * Get the underlying target
       */
      getTarget() {
        return this.target;
      }
      /**
       * Get current database name
       */
      getCurrentDb() {
        return this.currentDb;
      }
      /**
       * Get current collection name
       */
      getCurrentCollection() {
        return this.currentCollection;
      }
      /**
       * Set current collection
       */
      setCurrentCollection(name) {
        this.currentCollection = name;
      }
    };
    PipelinedDbProxy = class {
      static {
        __name(this, "PipelinedDbProxy");
      }
      parent;
      dbName;
      opId;
      constructor(parent, dbName, opId) {
        this.parent = parent;
        this.dbName = dbName;
        this.opId = opId;
      }
      /**
       * Get a collection reference (pipelined)
       */
      collection(name) {
        this.parent.setCurrentCollection(name);
        return new PipelinedCollectionProxy(this.parent, this.dbName, name);
      }
    };
    PipelinedCollectionProxy = class {
      static {
        __name(this, "PipelinedCollectionProxy");
      }
      parent;
      dbName;
      collectionName;
      constructor(parent, dbName, collectionName) {
        this.parent = parent;
        this.dbName = dbName;
        this.collectionName = collectionName;
      }
      /**
       * Find documents (executes the pipeline)
       */
      async find(query) {
        return this.parent.getTarget().find(this.dbName, this.collectionName, query);
      }
      /**
       * Insert one document
       */
      async insertOne(document) {
        return this.parent.getTarget().insertOne(this.dbName, this.collectionName, document);
      }
      /**
       * Update one document
       */
      async updateOne(filter, update) {
        return this.parent.getTarget().updateOne(this.dbName, this.collectionName, filter, update);
      }
      /**
       * Delete one document
       */
      async deleteOne(filter) {
        return this.parent.getTarget().deleteOne(this.dbName, this.collectionName, filter);
      }
    };
  }
});

// .wrangler/tmp/bundle-3cyEtF/middleware-loader.entry.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// .wrangler/tmp/bundle-3cyEtF/middleware-insertion-facade.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/worker.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/rpc/worker-entrypoint.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_rpc_target();
init_rpc_target();
var DEFAULT_OPTIONS = {
  /** Maximum batch size for batched operations */
  maxBatchSize: 100,
  /** Request timeout in milliseconds */
  timeout: 3e4,
  /** Enable background cleanup */
  enableCleanup: true,
  /** Cleanup interval in milliseconds */
  cleanupInterval: 6e4
};
var WorkerEntrypoint = class {
  static {
    __name(this, "WorkerEntrypoint");
  }
  ctx;
  env;
  constructor(ctx, env2) {
    this.ctx = ctx;
    this.env = env2;
  }
  /**
   * Handle HTTP fetch requests
   */
  async fetch(request) {
    return new Response("Method not implemented", { status: 501 });
  }
};
function isMondoEnv(env2) {
  if (!env2 || typeof env2 !== "object") return false;
  const e = env2;
  return typeof e.MONDO_DATABASE === "object" && e.MONDO_DATABASE !== null && typeof e.MONDO_DATABASE.idFromName === "function" && typeof e.MONDO_DATABASE.get === "function";
}
__name(isMondoEnv, "isMondoEnv");
function validateEnv(env2) {
  return isMondoEnv(env2);
}
__name(validateEnv, "validateEnv");
var MondoEntrypoint = class extends WorkerEntrypoint {
  static {
    __name(this, "MondoEntrypoint");
  }
  env;
  rpcTarget;
  options;
  cleanupScheduled = false;
  constructor(ctx, env2) {
    super(ctx, env2);
    if (!validateEnv(env2)) {
      throw new Error(
        "Invalid environment: MONDO_DATABASE binding is required. Please configure the Durable Object binding in your wrangler.toml."
      );
    }
    this.env = env2;
    this.rpcTarget = new MondoRpcTarget(env2);
    this.options = {
      maxBatchSize: DEFAULT_OPTIONS.maxBatchSize,
      timeout: DEFAULT_OPTIONS.timeout,
      enableCleanup: DEFAULT_OPTIONS.enableCleanup,
      cleanupInterval: DEFAULT_OPTIONS.cleanupInterval
    };
  }
  /**
   * Handle HTTP fetch requests
   */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "healthy" }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
      const { newWorkersRpcResponse: newWorkersRpcResponse2 } = await Promise.resolve().then(() => (init_rpc_target(), rpc_target_exports));
      return newWorkersRpcResponse2(this.rpcTarget, request);
    }
    return new Response("Not found", { status: 404 });
  }
  /**
   * Connect to a MongoDB-compatible connection string
   */
  async connect(connectionString) {
    return this.rpcTarget.connect(connectionString);
  }
  /**
   * Get a database reference
   */
  async db(name) {
    return this.rpcTarget.db(name);
  }
  /**
   * Get a collection reference
   */
  async collection(dbName, collectionName) {
    return this.rpcTarget.collection(dbName, collectionName);
  }
  /**
   * Execute a find operation
   */
  async find(dbName, collectionName, query) {
    return this.rpcTarget.find(dbName, collectionName, query);
  }
  /**
   * Execute an insertOne operation
   */
  async insertOne(dbName, collectionName, document) {
    return this.rpcTarget.insertOne(dbName, collectionName, document);
  }
  /**
   * Execute an updateOne operation
   */
  async updateOne(dbName, collectionName, filter, update) {
    return this.rpcTarget.updateOne(dbName, collectionName, filter, update);
  }
  /**
   * Execute a deleteOne operation
   */
  async deleteOne(dbName, collectionName, filter) {
    return this.rpcTarget.deleteOne(dbName, collectionName, filter);
  }
  /**
   * Schedule background cleanup task
   */
  scheduleCleanup() {
    if (this.cleanupScheduled) return;
    this.cleanupScheduled = true;
    const cleanupPromise = this.runCleanup();
    this.ctx.waitUntil(cleanupPromise);
  }
  /**
   * Run cleanup task
   */
  async runCleanup() {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  /**
   * Get the underlying RPC target (for testing)
   */
  getRpcTarget() {
    return this.rpcTarget;
  }
};

// src/durable-object/mondo-database.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/durable-object/schema.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/durable-object/migrations.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var INITIAL_SCHEMA_SQL = {
  createCollections: `
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      options TEXT DEFAULT '{}'
    )
  `.trim(),
  createDocuments: `
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      _id TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
  `.trim(),
  createIdIndex: `
    CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(_id)
  `.trim(),
  createCompositeIndex: `
    CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id, _id)
  `.trim()
};
var migrations = [
  {
    version: 1,
    description: "Initial schema - collections and documents tables",
    up: /* @__PURE__ */ __name(async (storage) => {
      storage.sql.exec(INITIAL_SCHEMA_SQL.createCollections);
      storage.sql.exec(INITIAL_SCHEMA_SQL.createDocuments);
      storage.sql.exec(INITIAL_SCHEMA_SQL.createIdIndex);
      storage.sql.exec(INITIAL_SCHEMA_SQL.createCompositeIndex);
    }, "up"),
    down: /* @__PURE__ */ __name(async (storage) => {
      storage.sql.exec("DROP INDEX IF EXISTS idx_documents_collection_id");
      storage.sql.exec("DROP INDEX IF EXISTS idx_documents_id");
      storage.sql.exec("DROP TABLE IF EXISTS documents");
      storage.sql.exec("DROP TABLE IF EXISTS collections");
    }, "down")
  }
];
function getMigrationsInRange(fromVersion, toVersion) {
  return migrations.filter(
    (m) => m.version > fromVersion && m.version <= toVersion
  );
}
__name(getMigrationsInRange, "getMigrationsInRange");
function getLatestVersion() {
  if (migrations.length === 0) return 0;
  return Math.max(...migrations.map((m) => m.version));
}
__name(getLatestVersion, "getLatestVersion");
function validateMigrations() {
  if (migrations.length === 0) {
    return { valid: true };
  }
  const sortedVersions = [...migrations].sort((a, b) => a.version - b.version);
  const seen = /* @__PURE__ */ new Set();
  for (const migration of sortedVersions) {
    if (seen.has(migration.version)) {
      return {
        valid: false,
        error: `Duplicate migration version: ${migration.version}`
      };
    }
    seen.add(migration.version);
  }
  for (let i = 0; i < sortedVersions.length; i++) {
    if (sortedVersions[i].version !== i + 1) {
      return {
        valid: false,
        error: `Missing migration version: ${i + 1}`
      };
    }
  }
  return { valid: true };
}
__name(validateMigrations, "validateMigrations");

// src/durable-object/schema.ts
var SCHEMA_VERSION = getLatestVersion();
var SCHEMA_VERSION_KEY = "schema_version";
var SCHEMA_TABLES = {
  collections: {
    name: "collections",
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        options TEXT DEFAULT '{}'
      )
    `.trim()
  },
  documents: {
    name: "documents",
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `.trim()
  }
};
var MIGRATIONS = Object.fromEntries(
  migrations.map((m) => [m.version, m.up])
);
var REQUIRED_TABLES = ["collections", "documents"];
var REQUIRED_INDEXES = ["idx_documents_id", "idx_documents_collection_id"];
var SchemaManager = class {
  static {
    __name(this, "SchemaManager");
  }
  storage;
  constructor(storage) {
    this.storage = storage;
    const validation = validateMigrations();
    if (!validation.valid) {
      throw new Error(`Invalid migrations: ${validation.error}`);
    }
  }
  /**
   * Initialize the schema, running migrations if needed
   */
  async initializeSchema() {
    const currentVersion = await this.storage.get(SCHEMA_VERSION_KEY);
    if (currentVersion === SCHEMA_VERSION) {
      return;
    }
    const startVersion = currentVersion ?? 0;
    const migrationsToRun = getMigrationsInRange(startVersion, SCHEMA_VERSION);
    for (const migration of migrationsToRun) {
      await migration.up(this.storage);
    }
    await this.storage.put(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  }
  /**
   * Validate that the schema is properly initialized
   * Returns true if all required tables exist
   */
  async validateSchema() {
    const result = await this.validateSchemaDetailed();
    return result.valid;
  }
  /**
   * Detailed schema validation with specific error information
   */
  async validateSchemaDetailed() {
    const result = {
      valid: true,
      missingTables: [],
      missingIndexes: [],
      errors: []
    };
    try {
      const tablesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('collections', 'documents')`
      );
      const tables = tablesResult.toArray();
      const tableNames = new Set(tables.map((t) => t.name));
      for (const requiredTable of REQUIRED_TABLES) {
        if (!tableNames.has(requiredTable)) {
          result.missingTables.push(requiredTable);
          result.valid = false;
        }
      }
      const indexesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
      );
      const indexes = indexesResult.toArray();
      const indexNames = new Set(indexes.map((i) => i.name));
      for (const requiredIndex of REQUIRED_INDEXES) {
        if (!indexNames.has(requiredIndex)) {
          result.missingIndexes.push(requiredIndex);
          result.valid = false;
        }
      }
    } catch (error3) {
      result.valid = false;
      result.errors.push(
        error3 instanceof Error ? error3.message : "Unknown error during validation"
      );
    }
    return result;
  }
  /**
   * Get the current schema version from storage
   */
  async getSchemaVersion() {
    const version2 = await this.storage.get(SCHEMA_VERSION_KEY);
    return version2 ?? 0;
  }
  /**
   * Check if schema needs migration
   */
  async needsMigration() {
    const currentVersion = await this.getSchemaVersion();
    return currentVersion < SCHEMA_VERSION;
  }
  /**
   * Get list of pending migrations
   */
  async getPendingMigrations() {
    const currentVersion = await this.getSchemaVersion();
    const pending = getMigrationsInRange(currentVersion, SCHEMA_VERSION);
    return pending.map((m) => m.version);
  }
};

// src/types/objectid.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var HEX_LOOKUP = Array.from(
  { length: 256 },
  (_, i) => i.toString(16).padStart(2, "0")
);
var HEX_CHAR_TO_NIBBLE = {};
for (let i = 0; i < 16; i++) {
  const hex = i.toString(16);
  HEX_CHAR_TO_NIBBLE[hex] = i;
  HEX_CHAR_TO_NIBBLE[hex.toUpperCase()] = i;
}
var OBJECTID_PATTERN = /^[0-9a-fA-F]{24}$/;
var ObjectIdState = class {
  static {
    __name(this, "ObjectIdState");
  }
  randomBytes = null;
  counter;
  constructor() {
    this.counter = Math.floor(Math.random() * 16777215);
  }
  getRandomBytes() {
    if (!this.randomBytes) {
      this.randomBytes = new Uint8Array(5);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(this.randomBytes);
      } else {
        for (let i = 0; i < 5; i++) {
          this.randomBytes[i] = Math.floor(Math.random() * 256);
        }
      }
    }
    return this.randomBytes;
  }
  getNextCounter() {
    const value = this.counter;
    this.counter = this.counter + 1 & 16777215;
    return value;
  }
};
var state = new ObjectIdState();
function bytesToHex(bytes) {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += HEX_LOOKUP[bytes[i]];
  }
  return result;
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(hex) {
  const len = hex.length >> 1;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const hi = HEX_CHAR_TO_NIBBLE[hex[i * 2]];
    const lo = HEX_CHAR_TO_NIBBLE[hex[i * 2 + 1]];
    bytes[i] = hi << 4 | lo;
  }
  return bytes;
}
__name(hexToBytes, "hexToBytes");
function writeUInt32BE(buffer, value, offset) {
  buffer[offset] = value >>> 24 & 255;
  buffer[offset + 1] = value >>> 16 & 255;
  buffer[offset + 2] = value >>> 8 & 255;
  buffer[offset + 3] = value & 255;
}
__name(writeUInt32BE, "writeUInt32BE");
function readUInt32BE(buffer, offset) {
  return (buffer[offset] << 24 | buffer[offset + 1] << 16 | buffer[offset + 2] << 8 | buffer[offset + 3]) >>> 0;
}
__name(readUInt32BE, "readUInt32BE");
var ObjectId = class _ObjectId {
  static {
    __name(this, "ObjectId");
  }
  /** BSON type identifier for serialization compatibility */
  _bsontype = "ObjectId";
  /** The raw 12-byte buffer containing the ObjectId data */
  id;
  /** Cached hex string representation (computed lazily) */
  _hexString = null;
  /**
   * Create a new ObjectId
   *
   * @param input - Optional: hex string, Uint8Array, or another ObjectId.
   *                If omitted, generates a new unique ObjectId.
   * @throws {TypeError} If input is invalid
   */
  constructor(input) {
    if (input === void 0 || input === null) {
      this.id = this.generate();
    } else if (typeof input === "string") {
      if (!_ObjectId.isValidHex(input)) {
        throw new TypeError(
          `Invalid ObjectId hex string: "${input}". Must be 24 hex characters.`
        );
      }
      this.id = hexToBytes(input.toLowerCase());
      this._hexString = input.toLowerCase();
    } else if (input instanceof Uint8Array) {
      if (input.length !== 12) {
        throw new TypeError(
          `ObjectId buffer must be exactly 12 bytes, received ${input.length}`
        );
      }
      this.id = new Uint8Array(input);
    } else if (input instanceof _ObjectId) {
      this.id = new Uint8Array(input.id);
      this._hexString = input._hexString;
    } else {
      throw new TypeError(
        `Invalid ObjectId input type. Expected string, Uint8Array, or ObjectId.`
      );
    }
  }
  /**
   * Generate a new 12-byte ObjectId buffer
   * Structure: 4-byte timestamp | 5-byte random | 3-byte counter
   */
  generate() {
    const buffer = new Uint8Array(12);
    const timestamp = Math.floor(Date.now() / 1e3);
    writeUInt32BE(buffer, timestamp, 0);
    const randomBytes = state.getRandomBytes();
    buffer.set(randomBytes, 4);
    const counterValue = state.getNextCounter();
    buffer[9] = counterValue >>> 16 & 255;
    buffer[10] = counterValue >>> 8 & 255;
    buffer[11] = counterValue & 255;
    return buffer;
  }
  /**
   * Get the timestamp component of this ObjectId as a Date
   *
   * @returns Date object representing when this ObjectId was generated
   */
  getTimestamp() {
    const seconds = readUInt32BE(this.id, 0);
    return new Date(seconds * 1e3);
  }
  /**
   * Get the generation time as Unix timestamp (seconds)
   */
  getGenerationTime() {
    return readUInt32BE(this.id, 0);
  }
  /**
   * Return the ObjectId as a 24-character lowercase hex string
   */
  toHexString() {
    if (!this._hexString) {
      this._hexString = bytesToHex(this.id);
    }
    return this._hexString;
  }
  /**
   * String representation of the ObjectId (same as toHexString)
   */
  toString() {
    return this.toHexString();
  }
  /**
   * JSON serialization - returns hex string
   * This allows ObjectIds to serialize naturally in JSON.stringify()
   */
  toJSON() {
    return this.toHexString();
  }
  /**
   * Compare this ObjectId to another value for equality
   *
   * @param other - ObjectId, hex string, or null/undefined to compare
   * @returns true if the ObjectIds are equal, false otherwise
   */
  equals(other) {
    if (other === null || other === void 0) {
      return false;
    }
    if (other instanceof _ObjectId) {
      if (this._hexString && other._hexString) {
        return this._hexString === other._hexString;
      }
      for (let i = 0; i < 12; i++) {
        if (this.id[i] !== other.id[i]) {
          return false;
        }
      }
      return true;
    }
    return this.toHexString() === other.toLowerCase();
  }
  /**
   * Primitive value conversion (returns hex string)
   */
  valueOf() {
    return this.toHexString();
  }
  /**
   * Symbol.toStringTag for better debugging output
   */
  get [Symbol.toStringTag]() {
    return "ObjectId";
  }
  /**
   * Create custom inspect output for Node.js console
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `ObjectId("${this.toHexString()}")`;
  }
  // ─────────────────────────────────────────────────────────────────────────
  // Static Methods
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Create an ObjectId from a 24-character hex string
   *
   * @param hexString - 24-character hex string
   * @returns New ObjectId instance
   * @throws {TypeError} If hexString is invalid
   */
  static createFromHexString(hexString) {
    if (!_ObjectId.isValidHex(hexString)) {
      throw new TypeError(
        `Invalid ObjectId hex string: "${hexString}". Must be 24 hex characters.`
      );
    }
    return new _ObjectId(hexString);
  }
  /**
   * Create an ObjectId with a specific timestamp
   * Useful for range queries on _id fields
   *
   * @param time - Unix timestamp in seconds
   * @returns New ObjectId with the given timestamp and zeroed remaining bytes
   */
  static createFromTime(time3) {
    const buffer = new Uint8Array(12);
    writeUInt32BE(buffer, time3, 0);
    return new _ObjectId(buffer);
  }
  /**
   * Generate a new ObjectId (factory method, equivalent to new ObjectId())
   *
   * @returns New unique ObjectId instance
   */
  static generate() {
    return new _ObjectId();
  }
  /**
   * Check if a value is a valid ObjectId or ObjectId hex string
   *
   * @param value - Value to check
   * @returns true if valid ObjectId or 24-char hex string
   */
  static isValid(value) {
    if (value instanceof _ObjectId) {
      return true;
    }
    if (typeof value === "string") {
      return _ObjectId.isValidHex(value);
    }
    return false;
  }
  /**
   * Check if a string is a valid 24-character hex string
   */
  static isValidHex(str) {
    return typeof str === "string" && str.length === 24 && OBJECTID_PATTERN.test(str);
  }
};

// src/executor/aggregation-executor.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/executor/function-executor.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var FunctionExecutor = class {
  static {
    __name(this, "FunctionExecutor");
  }
  env;
  constructor(env2) {
    this.env = env2;
  }
  /**
   * Execute a function with given arguments
   */
  async execute(body, args, timeout = 5e3) {
    if (!this.env.LOADER) {
      throw new Error(
        '$function requires worker_loaders binding. Add to wrangler.jsonc: "worker_loaders": [{ "binding": "LOADER" }]'
      );
    }
    const normalizedBody = this.normalizeBody(body);
    const hash = await this.hashFunction(normalizedBody);
    const worker = this.env.LOADER.get(`fn-${hash}`, async () => ({
      compatibilityDate: "2024-09-25",
      mainModule: "fn.js",
      modules: {
        "fn.js": this.generateWorkerCode(normalizedBody, false)
      },
      globalOutbound: null,
      env: {}
    }));
    const response = await worker.getEntrypoint().fetch(
      new Request("http://internal/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args, timeout })
      })
    );
    const result = await response.json();
    if (result.error) {
      throw new Error(`$function execution failed: ${result.error}`);
    }
    return result.result;
  }
  /**
   * Execute a function for multiple arg sets in a single isolate (batch mode)
   */
  async executeBatch(body, argsArray, timeout = 1e4) {
    if (!this.env.LOADER) {
      throw new Error(
        '$function requires worker_loaders binding. Add to wrangler.jsonc: "worker_loaders": [{ "binding": "LOADER" }]'
      );
    }
    const normalizedBody = this.normalizeBody(body);
    const hash = await this.hashFunction(normalizedBody);
    const worker = this.env.LOADER.get(`fn-batch-${hash}`, async () => ({
      compatibilityDate: "2024-09-25",
      mainModule: "fn.js",
      modules: {
        "fn.js": this.generateWorkerCode(normalizedBody, true)
      },
      globalOutbound: null,
      env: {}
    }));
    const response = await worker.getEntrypoint().fetch(
      new Request("http://internal/execute-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ argsArray, timeout })
      })
    );
    const result = await response.json();
    if (result.error) {
      throw new Error(`$function batch execution failed: ${result.error}`);
    }
    return result.results ?? [];
  }
  /**
   * Normalize function body to consistent format
   */
  normalizeBody(body) {
    const trimmed = body.trim();
    if (trimmed.startsWith("function")) {
      return `(${trimmed})`;
    }
    return trimmed;
  }
  /**
   * Generate SHA-256 hash of function body for caching
   */
  async hashFunction(body) {
    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
  }
  /**
   * Generate the worker code that executes user functions
   */
  generateWorkerCode(body, isBatch) {
    if (isBatch) {
      return `
export default {
  async fetch(request) {
    try {
      const { argsArray } = await request.json();
      const fn = ${body};
      const results = argsArray.map(args => fn(...args));
      return Response.json({ results });
    } catch (err) {
      return Response.json({ error: err.message });
    }
  }
}
`;
    }
    return `
export default {
  async fetch(request) {
    try {
      const { args } = await request.json();
      const fn = ${body};
      const result = fn(...args);
      return Response.json({ result });
    } catch (err) {
      return Response.json({ error: err.message });
    }
  }
}
`;
  }
};

// src/translator/aggregation-translator.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/translator/stages/match-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/translator/query-translator.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var MONGO_TYPE_TO_SQLITE = {
  string: "text",
  number: ["integer", "real"],
  bool: ["true", "false"],
  boolean: ["true", "false"],
  array: "array",
  object: "object",
  null: "null"
};
var DEFAULT_OPTIONS2 = {
  useCTE: true,
  flattenLogical: true
};
var QueryTranslator = class {
  static {
    __name(this, "QueryTranslator");
  }
  options;
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS2, ...options };
  }
  /**
   * Registry of comparison operators and their SQL translations
   */
  comparisonOperators = {
    $eq: /* @__PURE__ */ __name((path, value, params) => {
      if (value === null) {
        return `${this.jsonExtract(path)} IS NULL`;
      }
      const sqlValue = typeof value === "boolean" ? value ? 1 : 0 : value;
      params.push(sqlValue);
      return `${this.jsonExtract(path)} = ?`;
    }, "$eq"),
    $ne: /* @__PURE__ */ __name((path, value, params) => {
      if (value === null) {
        return `${this.jsonExtract(path)} IS NOT NULL`;
      }
      const sqlValue = typeof value === "boolean" ? value ? 1 : 0 : value;
      params.push(sqlValue);
      return `${this.jsonExtract(path)} != ?`;
    }, "$ne"),
    $gt: /* @__PURE__ */ __name((path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} > ?`;
    }, "$gt"),
    $gte: /* @__PURE__ */ __name((path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} >= ?`;
    }, "$gte"),
    $lt: /* @__PURE__ */ __name((path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} < ?`;
    }, "$lt"),
    $lte: /* @__PURE__ */ __name((path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} <= ?`;
    }, "$lte"),
    $in: /* @__PURE__ */ __name((path, value, params) => {
      const arr = value;
      if (arr.length === 0) {
        return "0 = 1";
      }
      params.push(...arr);
      const placeholders = arr.map(() => "?").join(", ");
      return `${this.jsonExtract(path)} IN (${placeholders})`;
    }, "$in"),
    $nin: /* @__PURE__ */ __name((path, value, params) => {
      const arr = value;
      if (arr.length === 0) {
        return "1 = 1";
      }
      params.push(...arr);
      const placeholders = arr.map(() => "?").join(", ");
      return `${this.jsonExtract(path)} NOT IN (${placeholders})`;
    }, "$nin")
  };
  /**
   * Registry of element operators
   */
  elementOperators = {
    $exists: /* @__PURE__ */ __name((path, value, _params) => {
      if (value) {
        return `${this.jsonExtract(path)} IS NOT NULL`;
      }
      return `${this.jsonExtract(path)} IS NULL`;
    }, "$exists"),
    $type: /* @__PURE__ */ __name((path, value, _params) => {
      const mongoType = value;
      const sqliteType = MONGO_TYPE_TO_SQLITE[mongoType];
      if (Array.isArray(sqliteType)) {
        if (mongoType === "number") {
          return `json_type(${this.jsonExtract(path)}) IN ('integer', 'real')`;
        }
        return `json_type(${this.jsonExtract(path)}) IN ('true', 'false')`;
      }
      return `json_type(${this.jsonExtract(path)}) = '${sqliteType}'`;
    }, "$type")
  };
  /**
   * Registry of array operators
   */
  arrayOperators = {
    $size: /* @__PURE__ */ __name((path, value, params) => {
      params.push(value);
      return `json_array_length(${this.jsonExtract(path)}) = ?`;
    }, "$size"),
    $all: /* @__PURE__ */ __name((path, value, params) => {
      const arr = value;
      if (arr.length === 0) {
        return "1 = 1";
      }
      const conditions = arr.map((v) => {
        params.push(v);
        return `EXISTS (SELECT 1 FROM json_each(${this.jsonExtract(path)}) WHERE value = ?)`;
      });
      return conditions.length === 1 ? conditions[0] : `(${conditions.join(" AND ")})`;
    }, "$all"),
    $elemMatch: /* @__PURE__ */ __name((path, value, params) => {
      const conditions = value;
      const innerConditions = this.translateElemMatchConditions(conditions, params);
      return `EXISTS (SELECT 1 FROM json_each(${this.jsonExtract(path)}) WHERE ${innerConditions})`;
    }, "$elemMatch")
  };
  /**
   * Main entry point - translate a MongoDB query to SQL
   */
  translate(query) {
    const params = [];
    if (Object.keys(query).length === 0) {
      return { sql: "1 = 1", params: [] };
    }
    const processedQuery = this.options.flattenLogical ? this.flattenLogicalOperators(query) : query;
    const sql = this.translateDocument(processedQuery, params);
    return { sql, params };
  }
  /**
   * Flatten nested logical operators of the same type
   * E.g., $and: [{ $and: [a, b] }, c] -> $and: [a, b, c]
   */
  flattenLogicalOperators(query) {
    const result = {};
    for (const [key, value] of Object.entries(query)) {
      if (key === "$and" || key === "$or") {
        const conditions = value;
        const flattened = [];
        for (const condition of conditions) {
          const flatCondition = this.flattenLogicalOperators(condition);
          if (Object.keys(flatCondition).length === 1 && flatCondition[key]) {
            const nestedConditions = flatCondition[key];
            flattened.push(...nestedConditions);
          } else {
            flattened.push(flatCondition);
          }
        }
        result[key] = flattened;
      } else if (key === "$nor") {
        const conditions = value;
        result[key] = conditions.map((c) => this.flattenLogicalOperators(c));
      } else if (key.startsWith("$")) {
        result[key] = value;
      } else {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const operators = value;
          const processedOps = {};
          for (const [op, opValue] of Object.entries(operators)) {
            if (op === "$not" && opValue && typeof opValue === "object") {
              processedOps[op] = this.flattenLogicalOperators(opValue);
            } else if (op === "$elemMatch" && opValue && typeof opValue === "object") {
              processedOps[op] = this.flattenLogicalOperators(opValue);
            } else {
              processedOps[op] = opValue;
            }
          }
          result[key] = processedOps;
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
  /**
   * Translate a query document (top-level or nested)
   */
  translateDocument(query, params) {
    const conditions = [];
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith("$")) {
        const sql = this.translateLogicalOperator(key, value, params);
        conditions.push(sql);
      } else {
        const sql = this.translateField(key, value, params);
        conditions.push(sql);
      }
    }
    if (conditions.length === 0) {
      return "1 = 1";
    }
    if (conditions.length === 1) {
      return conditions[0];
    }
    return `(${conditions.join(" AND ")})`;
  }
  /**
   * Translate a field condition
   */
  translateField(field, value, params) {
    const path = this.fieldToJsonPath(field);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return this.comparisonOperators.$eq(path, value, params);
    }
    const operators = value;
    const operatorKeys = Object.keys(operators);
    if (operatorKeys.length > 0 && operatorKeys.every((k) => k.startsWith("$"))) {
      return this.translateFieldConditions(path, operators, params, false);
    }
    return this.comparisonOperators.$eq(path, value, params);
  }
  /**
   * Translate conditions on a single field
   */
  translateFieldConditions(path, conditions, params, isElemMatch) {
    const sqlParts = [];
    for (const [op, value] of Object.entries(conditions)) {
      let sql;
      if (op === "$not") {
        const innerConditions = value;
        const innerSql = this.translateFieldConditions(path, innerConditions, params, isElemMatch);
        sql = `NOT (${innerSql})`;
      } else if (this.comparisonOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, "") : path;
        sql = this.comparisonOperators[op](actualPath, value, params);
      } else if (this.elementOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, "") : path;
        sql = this.elementOperators[op](actualPath, value, params);
      } else if (this.arrayOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, "") : path;
        sql = this.arrayOperators[op](actualPath, value, params);
      } else {
        if (isElemMatch) {
          const nestedPath = this.elemMatchFieldPath(path, op.replace("$", ""));
          sql = this.translateFieldConditions(nestedPath, { $eq: value }, params, true);
        } else {
          throw new Error(`Unknown operator: ${op}`);
        }
      }
      sqlParts.push(sql);
    }
    if (sqlParts.length === 0) {
      return "1 = 1";
    }
    if (sqlParts.length === 1) {
      return sqlParts[0];
    }
    return `(${sqlParts.join(" AND ")})`;
  }
  /**
   * Translate logical operators ($and, $or, $not, $nor, $text)
   */
  translateLogicalOperator(op, value, params) {
    switch (op) {
      case "$and": {
        const conditions = value;
        if (conditions.length === 0) {
          return "1 = 1";
        }
        const parts = conditions.map((c) => this.translateDocument(c, params));
        if (parts.length === 1) {
          return parts[0];
        }
        return `(${parts.join(" AND ")})`;
      }
      case "$or": {
        const conditions = value;
        if (conditions.length === 0) {
          return "0 = 1";
        }
        const parts = conditions.map((c) => this.translateDocument(c, params));
        if (parts.length === 1) {
          return parts[0];
        }
        return `(${parts.join(" OR ")})`;
      }
      case "$nor": {
        const conditions = value;
        if (conditions.length === 0) {
          return "1 = 1";
        }
        const parts = conditions.map((c) => this.translateDocument(c, params));
        return `NOT (${parts.join(" OR ")})`;
      }
      case "$not": {
        const innerSql = this.translateDocument(value, params);
        return `NOT (${innerSql})`;
      }
      case "$text": {
        const textOp = value;
        const { sql } = this.translateTextOperator(textOp, params);
        return sql;
      }
      default:
        throw new Error(`Unknown logical operator: ${op}`);
    }
  }
  /**
   * Convert a field name to a JSON path
   * e.g., "a.b.c" -> "$.a.b.c"
   * e.g., "items.0.name" -> "$.items[0].name"
   */
  fieldToJsonPath(field) {
    const parts = field.split(".");
    let path = "$";
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        path += `[${part}]`;
      } else {
        path += `.${part}`;
      }
    }
    return path;
  }
  /**
   * Generate json_extract SQL for a path
   */
  jsonExtract(path) {
    if (path.startsWith("$")) {
      return `json_extract(data, '${path}')`;
    }
    return path;
  }
  /**
   * Generate path for elemMatch field access
   */
  elemMatchFieldPath(basePath, field) {
    if (basePath === "value") {
      if (field === "") {
        return "value";
      }
      return `json_extract(value, '$.${field}')`;
    }
    if (field === "") {
      return basePath;
    }
    return `${basePath}.${field}`;
  }
  /**
   * Translate conditions inside $elemMatch
   * This handles document conditions like { field: value, field: { $op: value } }
   */
  translateElemMatchConditions(conditions, params) {
    const sqlParts = [];
    for (const [field, value] of Object.entries(conditions)) {
      const extractPath = `json_extract(value, '$.${field}')`;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        if (value === null) {
          sqlParts.push(`${extractPath} IS NULL`);
        } else {
          params.push(value);
          sqlParts.push(`${extractPath} = ?`);
        }
      } else {
        const operators = value;
        const opKeys = Object.keys(operators);
        if (opKeys.length > 0 && opKeys.every((k) => k.startsWith("$"))) {
          for (const [op, opValue] of Object.entries(operators)) {
            const opSql = this.translateElemMatchOperator(extractPath, op, opValue, params);
            sqlParts.push(opSql);
          }
        } else {
          params.push(JSON.stringify(value));
          sqlParts.push(`${extractPath} = json(?)`);
        }
      }
    }
    if (sqlParts.length === 0) {
      return "1 = 1";
    }
    return sqlParts.length === 1 ? sqlParts[0] : `(${sqlParts.join(" AND ")})`;
  }
  /**
   * Translate a single operator for elemMatch context
   */
  translateElemMatchOperator(path, op, value, params) {
    switch (op) {
      case "$eq": {
        if (value === null) {
          return `${path} IS NULL`;
        }
        const eqValue = typeof value === "boolean" ? value ? 1 : 0 : value;
        params.push(eqValue);
        return `${path} = ?`;
      }
      case "$ne": {
        if (value === null) {
          return `${path} IS NOT NULL`;
        }
        const neValue = typeof value === "boolean" ? value ? 1 : 0 : value;
        params.push(neValue);
        return `${path} != ?`;
      }
      case "$gt":
        params.push(value);
        return `${path} > ?`;
      case "$gte":
        params.push(value);
        return `${path} >= ?`;
      case "$lt":
        params.push(value);
        return `${path} < ?`;
      case "$lte":
        params.push(value);
        return `${path} <= ?`;
      case "$in": {
        const arr = value;
        if (arr.length === 0) return "0 = 1";
        params.push(...arr);
        return `${path} IN (${arr.map(() => "?").join(", ")})`;
      }
      case "$nin": {
        const arr = value;
        if (arr.length === 0) return "1 = 1";
        params.push(...arr);
        return `${path} NOT IN (${arr.map(() => "?").join(", ")})`;
      }
      case "$exists":
        return value ? `${path} IS NOT NULL` : `${path} IS NULL`;
      default:
        throw new Error(`Unsupported operator in $elemMatch: ${op}`);
    }
  }
  /**
   * Generate optimized SQL with CTE for multiple array operations on the same field
   * This is useful when you have multiple $all checks or $elemMatch on the same array
   *
   * Example output:
   * WITH array_cte AS (
   *   SELECT value FROM json_each(json_extract(data, '$.tags'))
   * )
   * SELECT * FROM documents WHERE
   *   EXISTS (SELECT 1 FROM array_cte WHERE value = ?) AND
   *   EXISTS (SELECT 1 FROM array_cte WHERE value = ?)
   */
  translateWithCTE(query, tableName = "documents") {
    const params = [];
    if (Object.keys(query).length === 0) {
      return { sql: `SELECT * FROM ${tableName}`, params: [] };
    }
    const arrayFieldOps = this.collectArrayOperations(query);
    const cteDefinitions = [];
    const cteAliases = /* @__PURE__ */ new Map();
    let cteIndex = 0;
    for (const [field, count3] of arrayFieldOps.entries()) {
      if (count3 > 1) {
        const alias = `arr_cte_${cteIndex++}`;
        const path = this.fieldToJsonPath(field);
        cteDefinitions.push(
          `${alias} AS (SELECT value FROM json_each(json_extract(data, '${path}')))`
        );
        cteAliases.set(field, alias);
      }
    }
    const whereClause = this.translateDocumentWithCTE(query, params, cteAliases);
    let sql;
    if (cteDefinitions.length > 0) {
      sql = `WITH ${cteDefinitions.join(", ")} SELECT * FROM ${tableName} WHERE ${whereClause}`;
    } else {
      sql = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
    }
    return { sql, params };
  }
  /**
   * Collect array operations for CTE optimization analysis
   */
  collectArrayOperations(query, counts = /* @__PURE__ */ new Map()) {
    for (const [key, value] of Object.entries(query)) {
      if (key === "$and" || key === "$or" || key === "$nor") {
        const conditions = value;
        for (const condition of conditions) {
          this.collectArrayOperations(condition, counts);
        }
      } else if (!key.startsWith("$") && value && typeof value === "object") {
        const operators = value;
        for (const op of Object.keys(operators)) {
          if (op === "$all" || op === "$elemMatch") {
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
    }
    return counts;
  }
  /**
   * Translate document using CTE aliases where applicable
   */
  translateDocumentWithCTE(query, params, cteAliases) {
    return this.translateDocument(query, params);
  }
  /**
   * Register a custom comparison operator
   * Allows extending the translator with custom operators
   */
  registerOperator(name, handler) {
    if (!name.startsWith("$")) {
      throw new Error("Operator name must start with $");
    }
    this.comparisonOperators[name] = handler;
  }
  /**
   * Register a custom element operator
   */
  registerElementOperator(name, handler) {
    if (!name.startsWith("$")) {
      throw new Error("Operator name must start with $");
    }
    this.elementOperators[name] = handler;
  }
  /**
   * Register a custom array operator
   */
  registerArrayOperator(name, handler) {
    if (!name.startsWith("$")) {
      throw new Error("Operator name must start with $");
    }
    this.arrayOperators[name] = handler;
  }
  /**
   * Translate a MongoDB $text query to FTS5 MATCH SQL
   */
  translateTextOperator(textOp, params) {
    const search = textOp.$search;
    const caseSensitive = textOp.$caseSensitive;
    const diacriticSensitive = textOp.$diacriticSensitive;
    if (!search || search.trim() === "") {
      return { sql: "0 = 1", ftsMatch: "" };
    }
    const ftsQuery = this.convertToFTS5Query(search, caseSensitive, diacriticSensitive);
    params.push(ftsQuery);
    const sql = `id IN (SELECT rowid FROM {{FTS_TABLE}} WHERE {{FTS_TABLE}} MATCH ?)`;
    return { sql, ftsMatch: ftsQuery };
  }
  /**
   * Convert MongoDB text search syntax to FTS5 query syntax
   *
   * MongoDB syntax:
   * - "word" -> matches word
   * - "word1 word2" -> matches word1 OR word2
   * - "\"phrase\"" -> matches exact phrase
   * - "-word" -> excludes word (negation)
   *
   * FTS5 syntax:
   * - "word" -> matches word
   * - "word1 OR word2" -> matches word1 or word2
   * - "word1 word2" -> matches word1 AND word2
   * - "\"phrase\"" -> matches exact phrase
   * - "NOT word" -> excludes word
   */
  convertToFTS5Query(search, caseSensitive, diacriticSensitive) {
    const escaped = search.replace(/[&|()^~*:]/g, (char) => {
      return "\\" + char;
    });
    const tokens = [];
    let remaining = escaped.trim();
    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (remaining.startsWith('"')) {
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote > 1) {
          const phrase = remaining.slice(1, endQuote);
          tokens.push(`"${phrase}"`);
          remaining = remaining.slice(endQuote + 1);
          continue;
        }
      }
      if (remaining.startsWith("-")) {
        const spaceIdx2 = remaining.indexOf(" ");
        const term2 = spaceIdx2 > 0 ? remaining.slice(1, spaceIdx2) : remaining.slice(1);
        if (term2) {
          tokens.push(`NOT ${term2}`);
        }
        remaining = spaceIdx2 > 0 ? remaining.slice(spaceIdx2 + 1) : "";
        continue;
      }
      const spaceIdx = remaining.indexOf(" ");
      const term = spaceIdx > 0 ? remaining.slice(0, spaceIdx) : remaining;
      if (term) {
        tokens.push(term);
      }
      remaining = spaceIdx > 0 ? remaining.slice(spaceIdx + 1) : "";
    }
    if (tokens.length === 0) {
      return "*";
    }
    const notTerms = tokens.filter((t) => t.startsWith("NOT "));
    const regularTerms = tokens.filter((t) => !t.startsWith("NOT "));
    let query = "";
    if (regularTerms.length > 0) {
      query = regularTerms.join(" OR ");
    }
    if (notTerms.length > 0) {
      if (query) {
        query = `(${query}) AND ${notTerms.join(" AND ")}`;
      } else {
        query = `* AND ${notTerms.join(" AND ")}`;
      }
    }
    return query;
  }
  /**
   * Translate a query with $meta projection support for textScore
   *
   * @param query The MongoDB query (must contain $text for textScore)
   * @param projection The projection with potential {$meta: "textScore"} fields
   * @param sort Optional sort with potential {$meta: "textScore"} fields
   */
  translateWithMeta(query, projection, sort) {
    const params = [];
    const hasText = "$text" in query;
    if (!hasText) {
      const baseResult = this.translate(query);
      return baseResult;
    }
    const textOp = query.$text;
    const { sql: textSql, ftsMatch } = this.translateTextOperator(textOp, params);
    const remainingQuery = {};
    for (const [key, value] of Object.entries(query)) {
      if (key !== "$text") {
        remainingQuery[key] = value;
      }
    }
    let whereClause = textSql;
    if (Object.keys(remainingQuery).length > 0) {
      const remainingResult = this.translateDocument(remainingQuery, params);
      whereClause = `(${textSql}) AND (${remainingResult})`;
    }
    let selectClause = "*";
    const hasTextScoreProjection = projection && Object.values(projection).some(
      (v) => v && typeof v === "object" && v.$meta === "textScore"
    );
    if (hasTextScoreProjection) {
      selectClause = "*, -bm25({{FTS_TABLE}}) as rank";
    }
    let orderByClause = "";
    if (sort) {
      const hasTextScoreSort = Object.values(sort).some(
        (v) => v && typeof v === "object" && v.$meta === "textScore"
      );
      if (hasTextScoreSort) {
        orderByClause = " ORDER BY rank DESC";
      }
    }
    return {
      sql: `SELECT ${selectClause} WHERE ${whereClause}${orderByClause}`,
      params,
      requiresFTS: true,
      ftsMatch
    };
  }
};

// src/translator/stages/match-stage.ts
function translateMatchStage(matchQuery, context2) {
  const queryTranslator = new QueryTranslator();
  const { sql, params } = queryTranslator.translate(matchQuery);
  return {
    whereClause: sql,
    params
  };
}
__name(translateMatchStage, "translateMatchStage");

// src/translator/stages/project-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/translator/stages/expression-translator.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function isFieldReference(value) {
  return typeof value === "string" && value.startsWith("$") && !value.startsWith("$$");
}
__name(isFieldReference, "isFieldReference");
function getFieldPath(fieldRef) {
  const field = fieldRef.substring(1);
  const parts = field.split(".");
  let path = "$";
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      path += `[${part}]`;
    } else {
      path += `.${part}`;
    }
  }
  return path;
}
__name(getFieldPath, "getFieldPath");
function translateExpressionValue(value, params) {
  if (isFieldReference(value)) {
    const path = getFieldPath(value);
    return `json_extract(data, '${path}')`;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return translateExpression(value, params);
  }
  if (typeof value === "string") {
    params.push(value);
    return "?";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "NULL";
  }
  params.push(JSON.stringify(value));
  return "?";
}
__name(translateExpressionValue, "translateExpressionValue");
function translateExpression(expr, params) {
  const keys = Object.keys(expr);
  if (keys.length === 0) {
    return "NULL";
  }
  const operator = keys[0];
  if (operator === "$add") {
    return translateArithmetic(expr.$add, params, "+");
  }
  if (operator === "$subtract") {
    return translateArithmetic(expr.$subtract, params, "-");
  }
  if (operator === "$multiply") {
    return translateArithmetic(expr.$multiply, params, "*");
  }
  if (operator === "$divide") {
    return translateArithmetic(expr.$divide, params, "/");
  }
  if (operator === "$mod") {
    return translateArithmetic(expr.$mod, params, "%");
  }
  if (operator === "$concat") {
    return translateConcat(expr.$concat, params);
  }
  if (operator === "$substr") {
    return translateSubstr(expr.$substr, params);
  }
  if (operator === "$toLower") {
    const val = translateExpressionValue(expr.$toLower, params);
    return `LOWER(${val})`;
  }
  if (operator === "$toUpper") {
    const val = translateExpressionValue(expr.$toUpper, params);
    return `UPPER(${val})`;
  }
  if (operator === "$cond") {
    return translateCond(expr.$cond, params);
  }
  if (operator === "$ifNull") {
    return translateIfNull(expr.$ifNull, params);
  }
  if (operator === "$switch") {
    return translateSwitch(expr.$switch, params);
  }
  if (operator === "$eq") {
    const args = expr.$eq;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} = ${right})`;
  }
  if (operator === "$ne") {
    const args = expr.$ne;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} != ${right})`;
  }
  if (operator === "$gt") {
    const args = expr.$gt;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} > ${right})`;
  }
  if (operator === "$gte") {
    const args = expr.$gte;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} >= ${right})`;
  }
  if (operator === "$lt") {
    const args = expr.$lt;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} < ${right})`;
  }
  if (operator === "$lte") {
    const args = expr.$lte;
    const left = translateExpressionValue(args[0], params);
    const right = translateExpressionValue(args[1], params);
    return `(${left} <= ${right})`;
  }
  if (operator === "$and") {
    const conditions = expr.$and.map(
      (c) => translateExpressionValue(c, params)
    );
    return `(${conditions.join(" AND ")})`;
  }
  if (operator === "$or") {
    const conditions = expr.$or.map(
      (c) => translateExpressionValue(c, params)
    );
    return `(${conditions.join(" OR ")})`;
  }
  if (operator === "$not") {
    const val = translateExpressionValue(expr.$not, params);
    return `NOT (${val})`;
  }
  if (operator === "$expr") {
    return translateExpression(expr.$expr, params);
  }
  if (operator === "$function") {
    return translateFunction(expr.$function, params);
  }
  throw new Error(`Unknown expression operator: ${operator}`);
}
__name(translateExpression, "translateExpression");
function translateArithmetic(args, params, op) {
  const parts = args.map((arg) => translateExpressionValue(arg, params));
  return `(${parts.join(` ${op} `)})`;
}
__name(translateArithmetic, "translateArithmetic");
function translateConcat(args, params) {
  const parts = args.map((arg) => translateExpressionValue(arg, params));
  return parts.join(" || ");
}
__name(translateConcat, "translateConcat");
function translateSubstr(args, params) {
  const str = translateExpressionValue(args[0], params);
  const start = translateExpressionValue(args[1], params);
  const len = translateExpressionValue(args[2], params);
  return `SUBSTR(${str}, ${start} + 1, ${len})`;
}
__name(translateSubstr, "translateSubstr");
function translateCond(cond, params) {
  let ifCond, thenVal, elseVal;
  if (Array.isArray(cond)) {
    [ifCond, thenVal, elseVal] = cond;
  } else {
    ifCond = cond.if;
    thenVal = cond.then;
    elseVal = cond.else;
  }
  const condSql = translateExpressionValue(ifCond, params);
  const thenSql = translateExpressionValue(thenVal, params);
  const elseSql = translateExpressionValue(elseVal, params);
  return `CASE WHEN ${condSql} THEN ${thenSql} ELSE ${elseSql} END`;
}
__name(translateCond, "translateCond");
function translateIfNull(args, params) {
  const parts = args.map((arg) => translateExpressionValue(arg, params));
  return `COALESCE(${parts.join(", ")})`;
}
__name(translateIfNull, "translateIfNull");
function translateSwitch(switchExpr, params) {
  const branches = switchExpr.branches;
  const defaultVal = switchExpr.default;
  const whenClauses = branches.map((branch) => {
    const caseSql = translateExpressionValue(branch.case, params);
    const thenSql = translateExpressionValue(branch.then, params);
    return `WHEN ${caseSql} THEN ${thenSql}`;
  });
  const elseSql = defaultVal !== void 0 ? translateExpressionValue(defaultVal, params) : "NULL";
  return `CASE ${whenClauses.join(" ")} ELSE ${elseSql} END`;
}
__name(translateSwitch, "translateSwitch");
function translateFunction(spec, params) {
  if (!spec.body) {
    throw new Error("$function requires body");
  }
  if (!spec.args) {
    throw new Error("$function requires args");
  }
  if (spec.lang !== "js") {
    throw new Error('$function only supports lang: "js"');
  }
  const body = typeof spec.body === "function" ? spec.body.toString() : spec.body;
  const argPaths = [];
  const literalArgs = {};
  spec.args.forEach((arg, index) => {
    if (isFieldReference(arg)) {
      argPaths.push(getFieldPath(arg));
    } else {
      literalArgs[index] = arg;
    }
  });
  const marker = {
    __type: "function",
    body,
    argPaths,
    literalArgs,
    argOrder: spec.args.map(
      (arg, i) => isFieldReference(arg) ? { type: "field", path: getFieldPath(arg) } : { type: "literal", index: i }
    )
  };
  return `'__FUNCTION__${JSON.stringify(marker).replace(/'/g, "''")}'`;
}
__name(translateFunction, "translateFunction");

// src/translator/stages/project-stage.ts
function collectFunctionFieldRefs(expr) {
  if (!expr || typeof expr !== "object") return [];
  const fields = [];
  const exprObj = expr;
  if ("$function" in exprObj) {
    const fnSpec = exprObj.$function;
    if (fnSpec.args && Array.isArray(fnSpec.args)) {
      for (const arg of fnSpec.args) {
        if (isFieldReference(arg)) {
          const fieldName = arg.substring(1).split(".")[0];
          fields.push(fieldName);
        }
      }
    }
  }
  for (const value of Object.values(exprObj)) {
    if (value && typeof value === "object") {
      fields.push(...collectFunctionFieldRefs(value));
    }
  }
  return fields;
}
__name(collectFunctionFieldRefs, "collectFunctionFieldRefs");
function translateProjectStage(projection, context2) {
  const params = [];
  const fields = Object.entries(projection);
  const isExclusion = fields.every(([key, value]) => {
    if (key === "_id") return true;
    return value === 0;
  });
  if (isExclusion) {
    return translateExclusionProject(projection, context2, params);
  }
  return translateInclusionProject(projection, context2, params);
}
__name(translateProjectStage, "translateProjectStage");
function translateExclusionProject(projection, context2, params) {
  const fieldsToRemove = Object.entries(projection).filter(([key, value]) => value === 0 && key !== "_id").map(([key]) => `'$.${key}'`);
  const source = context2.previousCte || context2.collection;
  const selectClause = fieldsToRemove.length > 0 ? `json_remove(data, ${fieldsToRemove.join(", ")}) AS data` : "data";
  return {
    selectClause,
    params
  };
}
__name(translateExclusionProject, "translateExclusionProject");
function translateInclusionProject(projection, context2, params) {
  const jsonParts = [];
  const functionFieldRefs = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(projection)) {
    if (typeof value === "object" && value !== null) {
      const refs = collectFunctionFieldRefs(value);
      refs.forEach((ref2) => functionFieldRefs.add(ref2));
    }
  }
  const explicitFields = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(projection)) {
    explicitFields.add(key);
    if (value === 1) {
      jsonParts.push(`'${key}', json_extract(data, '$.${key}')`);
    } else if (typeof value === "string" && value.startsWith("$")) {
      const fieldPath = getFieldPath(value);
      jsonParts.push(`'${key}', json_extract(data, '${fieldPath}')`);
    } else if (typeof value === "object" && value !== null) {
      const exprSql = translateExpression(value, params);
      jsonParts.push(`'${key}', ${exprSql}`);
    } else if (value !== 0) {
      if (typeof value === "string") {
        params.push(value);
        jsonParts.push(`'${key}', ?`);
      } else if (typeof value === "number" || typeof value === "boolean") {
        jsonParts.push(`'${key}', ${JSON.stringify(value)}`);
      }
    }
  }
  for (const fieldRef of functionFieldRefs) {
    if (!explicitFields.has(fieldRef)) {
      jsonParts.push(`'${fieldRef}', json_extract(data, '$.${fieldRef}')`);
    }
  }
  const selectClause = `json_object(${jsonParts.join(", ")}) AS data`;
  return {
    selectClause,
    params,
    transformsShape: true
  };
}
__name(translateInclusionProject, "translateInclusionProject");

// src/translator/stages/group-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateGroupStage(group3, context2) {
  const params = [];
  if (!("_id" in group3)) {
    throw new Error("$group requires _id field");
  }
  const { _id, ...accumulators } = group3;
  const groupByFields = [];
  const selectParts = [];
  if (_id === null) {
    selectParts.push("'_id', NULL");
  } else if (typeof _id === "string" && isFieldReference(_id)) {
    const path = getFieldPath(_id);
    const fieldExpr = `json_extract(data, '${path}')`;
    groupByFields.push(fieldExpr);
    selectParts.push(`'_id', ${fieldExpr}`);
  } else if (typeof _id === "object" && _id !== null) {
    const idParts = [];
    for (const [key, value] of Object.entries(_id)) {
      if (typeof value === "string" && isFieldReference(value)) {
        const path = getFieldPath(value);
        const fieldExpr = `json_extract(data, '${path}')`;
        groupByFields.push(fieldExpr);
        idParts.push(`'${key}', ${fieldExpr}`);
      }
    }
    selectParts.push(`'_id', json_object(${idParts.join(", ")})`);
  }
  for (const [field, accumulator] of Object.entries(accumulators)) {
    const accSql = translateAccumulator(accumulator, params);
    selectParts.push(`'${field}', ${accSql}`);
  }
  const selectClause = `json_object(${selectParts.join(", ")}) AS data`;
  const groupByClause = groupByFields.length > 0 ? groupByFields.join(", ") : void 0;
  return {
    selectClause,
    groupByClause,
    params,
    transformsShape: true
  };
}
__name(translateGroupStage, "translateGroupStage");
function translateAccumulator(accumulator, params) {
  const operator = Object.keys(accumulator)[0];
  const value = accumulator[operator];
  switch (operator) {
    case "$sum": {
      if (typeof value === "number") {
        return `SUM(${value})`;
      }
      const expr = translateExpressionValue(value, params);
      return `SUM(${expr})`;
    }
    case "$avg": {
      const expr = translateExpressionValue(value, params);
      return `AVG(${expr})`;
    }
    case "$min": {
      const expr = translateExpressionValue(value, params);
      return `MIN(${expr})`;
    }
    case "$max": {
      const expr = translateExpressionValue(value, params);
      return `MAX(${expr})`;
    }
    case "$count": {
      return "COUNT(*)";
    }
    case "$first": {
      const expr = translateExpressionValue(value, params);
      return `(SELECT ${expr} FROM (SELECT data FROM ${params.length > 0 ? "stage" : "data"} LIMIT 1))`;
    }
    case "$last": {
      const expr = translateExpressionValue(value, params);
      return `(SELECT ${expr} FROM (SELECT data FROM ${params.length > 0 ? "stage" : "data"} ORDER BY ROWID DESC LIMIT 1))`;
    }
    case "$push": {
      const expr = translateExpressionValue(value, params);
      return `json_group_array(${expr})`;
    }
    case "$addToSet": {
      const expr = translateExpressionValue(value, params);
      return `json_group_array(DISTINCT ${expr})`;
    }
    default:
      throw new Error(`Unknown accumulator operator: ${operator}`);
  }
}
__name(translateAccumulator, "translateAccumulator");

// src/translator/stages/sort-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateSortStage(sort, context2) {
  const orderParts = [];
  for (const [field, direction] of Object.entries(sort)) {
    if (direction !== 1 && direction !== -1) {
      throw new Error("$sort direction must be 1 or -1");
    }
    const path = getFieldPath("$" + field);
    const dirStr = direction === 1 ? "ASC" : "DESC";
    orderParts.push(`json_extract(data, '${path}') ${dirStr}`);
  }
  return {
    orderByClause: orderParts.join(", "),
    params: []
  };
}
__name(translateSortStage, "translateSortStage");

// src/translator/stages/limit-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateLimitStage(limit, context2) {
  return {
    limitClause: `LIMIT ${limit}`,
    params: []
  };
}
__name(translateLimitStage, "translateLimitStage");

// src/translator/stages/skip-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateSkipStage(skip, context2) {
  return {
    offsetClause: `OFFSET ${skip}`,
    params: []
  };
}
__name(translateSkipStage, "translateSkipStage");

// src/translator/stages/count-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateCountStage(fieldName, context2) {
  return {
    selectClause: `json_object('${fieldName}', COUNT(*)) AS data`,
    params: [],
    transformsShape: true
  };
}
__name(translateCountStage, "translateCountStage");

// src/translator/stages/lookup-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateLookupStage(lookup, context2) {
  const params = [];
  const { from, localField, foreignField, as } = lookup;
  if (localField && foreignField) {
    return translateSimpleLookup(lookup, context2, params);
  } else if (lookup.let && lookup.pipeline) {
    return translatePipelineLookup(lookup, context2, params);
  }
  throw new Error("$lookup requires either localField/foreignField or let/pipeline");
}
__name(translateLookupStage, "translateLookupStage");
function translateSimpleLookup(lookup, context2, params) {
  const { from, localField, foreignField, as } = lookup;
  const source = context2.previousCte || context2.collection;
  const localPath = getFieldPath("$" + localField);
  const foreignPath = getFieldPath("$" + foreignField);
  const cteName = `stage_${context2.cteIndex}`;
  const cteExpression = `
    SELECT
      ${source}.data,
      COALESCE(
        (SELECT json_group_array(${from}.data)
         FROM ${from}
         WHERE json_extract(${from}.data, '${foreignPath}') = json_extract(${source}.data, '${localPath}')),
        '[]'
      ) AS lookup_result
    FROM ${source}
  `;
  const selectClause = `json_set(data, '$.${as}', json(lookup_result)) AS data`;
  return {
    cteExpression: cteExpression.trim(),
    cteName,
    selectClause,
    params,
    transformsShape: true
  };
}
__name(translateSimpleLookup, "translateSimpleLookup");
function translatePipelineLookup(lookup, context2, params) {
  const { from, let: letVars, pipeline, as } = lookup;
  const source = context2.previousCte || context2.collection;
  const cteName = `stage_${context2.cteIndex}`;
  const cteExpression = `
    SELECT
      ${source}.data,
      COALESCE(
        (SELECT json_group_array(${from}.data) FROM ${from}),
        '[]'
      ) AS lookup_result
    FROM ${source}
  `;
  const selectClause = `json_set(data, '$.${as}', json(lookup_result)) AS data`;
  return {
    cteExpression: cteExpression.trim(),
    cteName,
    selectClause,
    params,
    transformsShape: true
  };
}
__name(translatePipelineLookup, "translatePipelineLookup");

// src/translator/stages/unwind-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateUnwindStage(unwind, context2) {
  const params = [];
  const config2 = typeof unwind === "string" ? { path: unwind } : unwind;
  const { path, includeArrayIndex, preserveNullAndEmptyArrays } = config2;
  const fieldName = path.startsWith("$") ? path.substring(1) : path;
  const jsonPath = getFieldPath("$" + fieldName);
  const source = context2.previousCte || context2.collection;
  const cteName = `stage_${context2.cteIndex}`;
  const joinType = preserveNullAndEmptyArrays ? "LEFT JOIN" : "JOIN";
  let selectParts = `json_set(${source}.data, '${jsonPath}', each.value) AS data`;
  if (includeArrayIndex) {
    selectParts = `json_set(json_set(${source}.data, '${jsonPath}', each.value), '$.${includeArrayIndex}', each.key) AS data`;
  }
  const cteExpression = `
    SELECT ${selectParts}
    FROM ${source}
    ${joinType} json_each(json_extract(${source}.data, '${jsonPath}')) AS each
  `;
  return {
    cteExpression: cteExpression.trim(),
    cteName,
    params,
    transformsShape: true
  };
}
__name(translateUnwindStage, "translateUnwindStage");

// src/translator/stages/add-fields-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateAddFieldsStage(addFields, context2) {
  const params = [];
  const source = context2.previousCte || context2.collection;
  let result = "data";
  for (const [field, value] of Object.entries(addFields)) {
    const jsonPath = `'$.${field}'`;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const exprSql = translateExpressionValue(value, params);
      result = `json_set(${result}, ${jsonPath}, ${exprSql})`;
    } else if (isFieldReference(value)) {
      const fieldPath = getFieldPath(value);
      result = `json_set(${result}, ${jsonPath}, json_extract(data, '${fieldPath}'))`;
    } else if (typeof value === "string") {
      params.push(value);
      result = `json_set(${result}, ${jsonPath}, ?)`;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result = `json_set(${result}, ${jsonPath}, ${JSON.stringify(value)})`;
    } else if (Array.isArray(value)) {
      params.push(JSON.stringify(value));
      result = `json_set(${result}, ${jsonPath}, json(?))`;
    }
  }
  return {
    selectClause: `${result} AS data`,
    params,
    transformsShape: true
  };
}
__name(translateAddFieldsStage, "translateAddFieldsStage");

// src/translator/stages/bucket-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateBucketStage(bucket, context2) {
  const params = [];
  const { groupBy, boundaries, output } = bucket;
  const defaultBucket = bucket.default;
  const fieldPath = groupBy.startsWith("$") ? getFieldPath(groupBy) : `$.${groupBy}`;
  const fieldExpr = `json_extract(data, '${fieldPath}')`;
  const bucketCases = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lower = boundaries[i];
    const upper = boundaries[i + 1];
    bucketCases.push(`WHEN ${fieldExpr} >= ${lower} AND ${fieldExpr} < ${upper} THEN ${lower}`);
  }
  const defaultCase = defaultBucket !== void 0 ? `ELSE '${defaultBucket}'` : `ELSE NULL`;
  const bucketExpr = `CASE ${bucketCases.join(" ")} ${defaultCase} END`;
  const selectParts = [`'_id', ${bucketExpr}`];
  if (output) {
    for (const [field, accumulator] of Object.entries(output)) {
      const accSql = translateBucketAccumulator(accumulator, params);
      selectParts.push(`'${field}', ${accSql}`);
    }
  } else {
    selectParts.push(`'count', COUNT(*)`);
  }
  return {
    selectClause: `json_object(${selectParts.join(", ")}) AS data`,
    groupByClause: bucketExpr,
    params,
    transformsShape: true
  };
}
__name(translateBucketStage, "translateBucketStage");
function translateBucketAccumulator(accumulator, params) {
  const operator = Object.keys(accumulator)[0];
  const value = accumulator[operator];
  switch (operator) {
    case "$sum": {
      if (typeof value === "number") {
        return `COUNT(*)`;
      }
      const expr = translateExpressionValue(value, params);
      return `SUM(${expr})`;
    }
    case "$avg": {
      const expr = translateExpressionValue(value, params);
      return `AVG(${expr})`;
    }
    case "$min": {
      const expr = translateExpressionValue(value, params);
      return `MIN(${expr})`;
    }
    case "$max": {
      const expr = translateExpressionValue(value, params);
      return `MAX(${expr})`;
    }
    case "$count": {
      return "COUNT(*)";
    }
    case "$push": {
      const expr = translateExpressionValue(value, params);
      return `json_group_array(${expr})`;
    }
    default:
      throw new Error(`Unknown bucket accumulator operator: ${operator}`);
  }
}
__name(translateBucketAccumulator, "translateBucketAccumulator");

// src/translator/stages/facet-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function translateFacetStage(facet, context2, pipelineTranslator) {
  const params = [];
  const facets = {};
  for (const [facetName, pipeline] of Object.entries(facet)) {
    const source = context2.previousCte || context2.collection;
    const result = pipelineTranslator.translatePipeline(pipeline, source);
    facets[facetName] = result;
  }
  return {
    facets,
    params,
    selectClause: "NULL",
    // Facets are handled separately
    transformsShape: true
  };
}
__name(translateFacetStage, "translateFacetStage");

// src/translator/stages/search-stage.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/translator/search-translator.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var SearchTranslator = class {
  static {
    __name(this, "SearchTranslator");
  }
  /**
   * Translate a MongoDB $search operator to FTS5 MATCH expression
   *
   * @param search The MongoDB $search operator value
   * @param collection The collection name (used for FTS table naming)
   * @returns SearchResult with FTS5 MATCH expression
   */
  translateSearch(search, collection) {
    const params = [];
    const ftsMatch = this.translateOperator(search);
    return {
      ftsMatch,
      params,
      ftsTable: `${collection}_fts`
    };
  }
  /**
   * Translate a single search operator to FTS5 syntax
   */
  translateOperator(operator) {
    if (operator.text) {
      return this.translateText(operator.text);
    }
    if (operator.phrase) {
      return this.translatePhrase(operator.phrase);
    }
    if (operator.wildcard) {
      return this.translateWildcard(operator.wildcard);
    }
    if (operator.compound) {
      return this.translateCompound(operator.compound);
    }
    return "*";
  }
  /**
   * Translate text operator to FTS5 terms
   *
   * MongoDB: { text: { query: "hello world", path: "content" } }
   * FTS5: content:hello content:world
   */
  translateText(text) {
    const { query, path } = text;
    const terms = query.trim().split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) {
      return "*";
    }
    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return terms.map((term) => `${column}:${term}`).join(" ");
    }
    return terms.join(" ");
  }
  /**
   * Translate phrase operator to FTS5 quoted phrase
   *
   * MongoDB: { phrase: { query: "hello world", path: "title" } }
   * FTS5: title:"hello world"
   */
  translatePhrase(phrase) {
    const { query, path } = phrase;
    const quotedPhrase = `"${query}"`;
    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return `${column}:${quotedPhrase}`;
    }
    return quotedPhrase;
  }
  /**
   * Translate wildcard operator to FTS5 prefix matching
   *
   * MongoDB: { wildcard: { query: "data*", path: "content" } }
   * FTS5: content:data*
   */
  translateWildcard(wildcard) {
    const { query, path } = wildcard;
    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return `${column}:${query}`;
    }
    return query;
  }
  /**
   * Translate compound operator to FTS5 boolean expression
   *
   * MongoDB compound operators:
   * - must: All clauses must match (AND)
   * - should: At least one should match (OR)
   * - mustNot: None should match (NOT)
   * - filter: Same as must but without scoring
   */
  translateCompound(compound) {
    const parts = [];
    if (compound.must && compound.must.length > 0) {
      const mustClauses = compound.must.map((op) => this.translateOperator(op));
      if (mustClauses.length === 1) {
        parts.push(mustClauses[0]);
      } else {
        parts.push(`(${mustClauses.join(" AND ")})`);
      }
    }
    if (compound.filter && compound.filter.length > 0) {
      const filterClauses = compound.filter.map((op) => this.translateOperator(op));
      if (filterClauses.length === 1) {
        parts.push(filterClauses[0]);
      } else {
        parts.push(`(${filterClauses.join(" AND ")})`);
      }
    }
    if (compound.should && compound.should.length > 0) {
      const shouldClauses = compound.should.map((op) => this.translateOperator(op));
      if (shouldClauses.length === 1) {
        parts.push(shouldClauses[0]);
      } else {
        parts.push(`(${shouldClauses.join(" OR ")})`);
      }
    }
    if (compound.mustNot && compound.mustNot.length > 0) {
      const mustNotClauses = compound.mustNot.map((op) => `NOT ${this.translateOperator(op)}`);
      parts.push(...mustNotClauses);
    }
    if (parts.length === 0) {
      return "*";
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return parts.join(" AND ");
  }
  /**
   * Escape special FTS5 characters in a term
   */
  escapeFTS5Term(term) {
    return term.replace(/[&|()^~*:"]/g, (char) => `\\${char}`);
  }
  /**
   * Build the complete SQL query for a $search aggregation stage
   *
   * @param search The MongoDB $search operator
   * @param collection The collection name
   * @param documentsTable The documents table name (default: 'documents')
   * @returns Complete SQL query with FTS5 join
   */
  buildSearchSQL(search, collection, documentsTable = "documents") {
    const result = this.translateSearch(search, collection);
    const ftsTable = result.ftsTable || `${collection}_fts`;
    const sql = `
      SELECT ${documentsTable}.*, -bm25(${ftsTable}) AS _searchScore
      FROM ${documentsTable}
      JOIN ${ftsTable} ON ${documentsTable}.id = ${ftsTable}.rowid
      WHERE ${ftsTable} MATCH ?
      ORDER BY _searchScore DESC
    `.trim();
    return {
      sql,
      params: [result.ftsMatch]
    };
  }
};

// src/translator/stages/search-stage.ts
function translateSearchStage(searchSpec, context2) {
  const translator = new SearchTranslator();
  const { index, ...searchOperator } = searchSpec;
  const ftsTable = `${context2.collection}_fts`;
  const searchResult = translator.translateSearch(searchOperator, context2.collection);
  const ftsJoin = `JOIN ${ftsTable} ON documents.id = ${ftsTable}.rowid`;
  let selectClause;
  if (context2.includeScore) {
    selectClause = `*, -bm25(${ftsTable}) AS _searchScore`;
  }
  const whereClause = `${ftsTable} MATCH ?`;
  const orderByClause = context2.includeScore ? `_searchScore DESC` : void 0;
  return {
    ftsMatch: searchResult.ftsMatch,
    ftsTable,
    ftsJoin,
    selectClause,
    whereClause,
    orderByClause,
    params: [searchResult.ftsMatch],
    transformsShape: context2.includeScore
    // Score adds a new field
  };
}
__name(translateSearchStage, "translateSearchStage");

// src/translator/stages/optimizer.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function optimizePipeline(pipeline) {
  let optimized = [...pipeline];
  optimized = pushdownPredicates(optimized);
  optimized = mergeAdjacentStages(optimized);
  optimized = eliminateRedundantStages(optimized);
  return optimized;
}
__name(optimizePipeline, "optimizePipeline");
function pushdownPredicates(pipeline) {
  const result = [];
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    const stageType = getStageType(stage);
    if (stageType !== "$match") {
      result.push(stage);
      continue;
    }
    const matchCondition = stage.$match;
    const pushPosition = findEarliestPushPosition(result, matchCondition);
    if (pushPosition < result.length) {
      result.splice(pushPosition, 0, stage);
    } else {
      result.push(stage);
    }
  }
  return result;
}
__name(pushdownPredicates, "pushdownPredicates");
function findEarliestPushPosition(stages, matchCondition) {
  const matchFields = extractFieldsFromCondition(matchCondition);
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i];
    const stageType = getStageType(stage);
    if (stageType === "$group") {
      return i + 1;
    }
    if (stageType === "$project" || stageType === "$addFields") {
      const projectFields = getAffectedFields(stage);
      if (matchFields.some((f) => projectFields.has(f))) {
        return i + 1;
      }
    }
    if (stageType === "$unwind") {
      const unwindField = getUnwindField(stage);
      if (matchFields.some((f) => f === unwindField || f.startsWith(unwindField + "."))) {
        return i + 1;
      }
    }
    if (stageType === "$lookup") {
      const lookupAs = getLookupAsField(stage);
      if (matchFields.some((f) => f === lookupAs || f.startsWith(lookupAs + "."))) {
        return i + 1;
      }
    }
    if (stageType === "$limit" || stageType === "$skip") {
      return i + 1;
    }
  }
  return 0;
}
__name(findEarliestPushPosition, "findEarliestPushPosition");
function mergeAdjacentStages(pipeline) {
  const result = [];
  for (const stage of pipeline) {
    if (result.length === 0) {
      result.push(stage);
      continue;
    }
    const prevStage = result[result.length - 1];
    const merged = tryMergeStages(prevStage, stage);
    if (merged) {
      result[result.length - 1] = merged;
    } else {
      result.push(stage);
    }
  }
  return result;
}
__name(mergeAdjacentStages, "mergeAdjacentStages");
function tryMergeStages(first, second) {
  const firstType = getStageType(first);
  const secondType = getStageType(second);
  if (firstType === "$match" && secondType === "$match") {
    const firstMatch = first.$match;
    const secondMatch = second.$match;
    return {
      $match: {
        $and: [firstMatch, secondMatch]
      }
    };
  }
  if (firstType === "$addFields" && secondType === "$addFields") {
    const firstFields = first.$addFields;
    const secondFields = second.$addFields;
    return {
      $addFields: {
        ...firstFields,
        ...secondFields
      }
    };
  }
  if (firstType === "$project" && secondType === "$project") {
    const firstProject = first.$project;
    const secondProject = second.$project;
    const firstIsExclusion = isExclusionProject(firstProject);
    const secondIsExclusion = isExclusionProject(secondProject);
    if (firstIsExclusion === secondIsExclusion) {
      return {
        $project: {
          ...firstProject,
          ...secondProject
        }
      };
    }
  }
  return null;
}
__name(tryMergeStages, "tryMergeStages");
function eliminateRedundantStages(pipeline) {
  return pipeline.filter((stage, index) => {
    const stageType = getStageType(stage);
    if (stageType === "$match") {
      const matchCondition = stage.$match;
      if (Object.keys(matchCondition).length === 0) {
        return false;
      }
    }
    if (stageType === "$limit") {
      const limit = stage.$limit;
      if (limit === 0) {
        return true;
      }
    }
    if (stageType === "$sort" && index < pipeline.length - 1) {
      for (let i = index + 1; i < pipeline.length; i++) {
        const laterStageType = getStageType(pipeline[i]);
        if (laterStageType === "$sort") {
          return false;
        }
        if (["$limit", "$skip", "$first", "$last"].includes(laterStageType)) {
          return true;
        }
      }
    }
    return true;
  });
}
__name(eliminateRedundantStages, "eliminateRedundantStages");
function getStageType(stage) {
  return Object.keys(stage)[0];
}
__name(getStageType, "getStageType");
function extractFieldsFromCondition(condition) {
  const fields = [];
  for (const [key, value] of Object.entries(condition)) {
    if (key.startsWith("$")) {
      if (Array.isArray(value)) {
        for (const subCondition of value) {
          fields.push(...extractFieldsFromCondition(subCondition));
        }
      }
    } else {
      fields.push(key);
    }
  }
  return fields;
}
__name(extractFieldsFromCondition, "extractFieldsFromCondition");
function getAffectedFields(stage) {
  const stageType = getStageType(stage);
  const fields = /* @__PURE__ */ new Set();
  if (stageType === "$project") {
    const project = stage.$project;
    for (const key of Object.keys(project)) {
      fields.add(key);
    }
  } else if (stageType === "$addFields") {
    const addFields = stage.$addFields;
    for (const key of Object.keys(addFields)) {
      fields.add(key);
    }
  }
  return fields;
}
__name(getAffectedFields, "getAffectedFields");
function getUnwindField(stage) {
  const unwind = stage.$unwind;
  if (typeof unwind === "string") {
    return unwind.replace(/^\$/, "");
  }
  return unwind.path.replace(/^\$/, "");
}
__name(getUnwindField, "getUnwindField");
function getLookupAsField(stage) {
  const lookup = stage.$lookup;
  return lookup.as;
}
__name(getLookupAsField, "getLookupAsField");
function isExclusionProject(project) {
  return Object.entries(project).every(([key, value]) => {
    if (key === "_id") return true;
    return value === 0;
  });
}
__name(isExclusionProject, "isExclusionProject");

// src/translator/aggregation-translator.ts
var AggregationTranslator = class _AggregationTranslator {
  constructor(collection, options = {}) {
    this.collection = collection;
    this.options = {
      optimize: true,
      ...options
    };
  }
  static {
    __name(this, "AggregationTranslator");
  }
  options;
  /**
   * Translate a MongoDB aggregation pipeline to SQL
   */
  translate(pipeline) {
    if (pipeline.length === 0) {
      throw new Error("Pipeline cannot be empty");
    }
    const optimizedPipeline = this.options.optimize ? optimizePipeline(pipeline) : pipeline;
    const needsCte = this.needsCtePipeline(optimizedPipeline);
    if (needsCte) {
      return this.translateWithCte(optimizedPipeline);
    }
    return this.translateSimple(optimizedPipeline);
  }
  /**
   * Translate pipeline for use in facet (implements FacetTranslator)
   */
  translatePipeline(stages, collection) {
    const translator = new _AggregationTranslator(collection);
    const result = translator.translate(stages);
    return { sql: result.sql, params: result.params };
  }
  /**
   * Determine if we need CTE-based execution
   */
  needsCtePipeline(pipeline) {
    let shapeTransformCount = 0;
    for (const stage of pipeline) {
      const stageType = this.getStageType(stage);
      if (["$lookup", "$unwind", "$facet", "$search"].includes(stageType)) {
        return true;
      }
      if (["$project", "$group", "$addFields"].includes(stageType)) {
        shapeTransformCount++;
      }
    }
    return shapeTransformCount > 1;
  }
  /**
   * Simple translation without CTEs
   */
  translateSimple(pipeline) {
    const params = [];
    let selectClause = "data";
    let whereClause;
    let groupByClause;
    let orderByClause;
    let limitClause;
    let offsetClause;
    const context2 = {
      collection: this.collection,
      cteIndex: 0,
      existingParams: params
    };
    for (const stage of pipeline) {
      const result = this.translateStage(stage, context2);
      params.push(...result.params);
      if (result.selectClause) selectClause = result.selectClause;
      if (result.whereClause) whereClause = result.whereClause;
      if (result.groupByClause) groupByClause = result.groupByClause;
      if (result.orderByClause) orderByClause = result.orderByClause;
      if (result.limitClause) limitClause = result.limitClause;
      if (result.offsetClause) offsetClause = result.offsetClause;
      if (result.facets) {
        return {
          sql: "",
          params,
          facets: result.facets
        };
      }
    }
    let sql = `SELECT ${selectClause} FROM ${this.collection}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (groupByClause) sql += ` GROUP BY ${groupByClause}`;
    if (orderByClause) sql += ` ORDER BY ${orderByClause}`;
    if (limitClause) sql += ` ${limitClause}`;
    if (offsetClause) sql += ` ${offsetClause}`;
    return { sql, params };
  }
  /**
   * CTE-based translation for complex pipelines
   */
  translateWithCte(pipeline) {
    const params = [];
    const ctes = [];
    let cteIndex = 0;
    let currentSource = this.collection;
    let pendingClauses = {
      select: "data",
      where: void 0,
      groupBy: void 0,
      orderBy: void 0,
      limit: void 0,
      offset: void 0
    };
    const flushPendingCte = /* @__PURE__ */ __name(() => {
      if (pendingClauses.select !== "data" || pendingClauses.where || pendingClauses.groupBy) {
        const cteName = `stage_${cteIndex}`;
        let cteSql = `SELECT ${pendingClauses.select} FROM ${currentSource}`;
        if (pendingClauses.where) cteSql += ` WHERE ${pendingClauses.where}`;
        if (pendingClauses.groupBy) cteSql += ` GROUP BY ${pendingClauses.groupBy}`;
        if (pendingClauses.orderBy) cteSql += ` ORDER BY ${pendingClauses.orderBy}`;
        if (pendingClauses.limit) cteSql += ` ${pendingClauses.limit}`;
        if (pendingClauses.offset) cteSql += ` ${pendingClauses.offset}`;
        ctes.push(`${cteName} AS (${cteSql})`);
        currentSource = cteName;
        cteIndex++;
        pendingClauses = {
          select: "data",
          where: void 0,
          groupBy: void 0,
          orderBy: void 0,
          limit: void 0,
          offset: void 0
        };
      }
    }, "flushPendingCte");
    const context2 = {
      collection: this.collection,
      cteIndex,
      existingParams: params,
      get previousCte() {
        return currentSource;
      }
    };
    for (const stage of pipeline) {
      const stageType = this.getStageType(stage);
      if (["$lookup", "$unwind"].includes(stageType)) {
        flushPendingCte();
        context2.cteIndex = cteIndex;
        const result = this.translateStage(stage, context2);
        params.push(...result.params);
        if (result.cteExpression) {
          const cteName = result.cteName || `stage_${cteIndex}`;
          ctes.push(`${cteName} AS (${result.cteExpression})`);
          currentSource = cteName;
          cteIndex++;
        }
      } else if (stageType === "$search") {
        flushPendingCte();
        context2.cteIndex = cteIndex;
        const result = this.translateStage(stage, context2);
        params.push(...result.params);
        const ftsTable = result.ftsTable || `${this.collection}_fts`;
        const selectClause = result.selectClause || "documents.*";
        const cteSql = `SELECT ${selectClause} FROM documents JOIN ${ftsTable} ON documents.id = ${ftsTable}.rowid WHERE ${result.whereClause}`;
        const cteName = `stage_${cteIndex}`;
        ctes.push(`${cteName} AS (${cteSql})`);
        currentSource = cteName;
        cteIndex++;
      } else if (stageType === "$facet") {
        flushPendingCte();
        context2.cteIndex = cteIndex;
        const result = this.translateStage(stage, context2);
        params.push(...result.params);
        if (result.facets) {
          const sql2 = ctes.length > 0 ? `WITH ${ctes.join(", ")}
` : "";
          return {
            sql: sql2,
            params,
            facets: result.facets
          };
        }
      } else {
        context2.cteIndex = cteIndex;
        const result = this.translateStage(stage, context2);
        params.push(...result.params);
        if (result.transformsShape && (pendingClauses.select !== "data" || pendingClauses.groupBy)) {
          flushPendingCte();
          context2.cteIndex = cteIndex;
        }
        if (result.selectClause) pendingClauses.select = result.selectClause;
        if (result.whereClause) pendingClauses.where = result.whereClause;
        if (result.groupByClause) pendingClauses.groupBy = result.groupByClause;
        if (result.orderByClause) pendingClauses.orderBy = result.orderByClause;
        if (result.limitClause) pendingClauses.limit = result.limitClause;
        if (result.offsetClause) pendingClauses.offset = result.offsetClause;
      }
    }
    let finalSql = `SELECT ${pendingClauses.select} FROM ${currentSource}`;
    if (pendingClauses.where) finalSql += ` WHERE ${pendingClauses.where}`;
    if (pendingClauses.groupBy) finalSql += ` GROUP BY ${pendingClauses.groupBy}`;
    if (pendingClauses.orderBy) finalSql += ` ORDER BY ${pendingClauses.orderBy}`;
    if (pendingClauses.limit) finalSql += ` ${pendingClauses.limit}`;
    if (pendingClauses.offset) finalSql += ` ${pendingClauses.offset}`;
    const sql = ctes.length > 0 ? `WITH ${ctes.join(", ")} ${finalSql}` : finalSql;
    return { sql, params };
  }
  /**
   * Get the stage type from a stage object
   */
  getStageType(stage) {
    return Object.keys(stage)[0];
  }
  /**
   * Translate a single pipeline stage
   */
  translateStage(stage, context2) {
    const stageType = this.getStageType(stage);
    const stageValue = stage[stageType];
    switch (stageType) {
      case "$match":
        return translateMatchStage(stageValue, context2);
      case "$project":
        return translateProjectStage(stageValue, context2);
      case "$group":
        return translateGroupStage(stageValue, context2);
      case "$sort":
        return translateSortStage(stageValue, context2);
      case "$limit":
        return translateLimitStage(stageValue, context2);
      case "$skip":
        return translateSkipStage(stageValue, context2);
      case "$count":
        return translateCountStage(stageValue, context2);
      case "$lookup":
        return translateLookupStage(stageValue, context2);
      case "$unwind":
        return translateUnwindStage(stageValue, context2);
      case "$addFields":
      case "$set":
        return translateAddFieldsStage(stageValue, context2);
      case "$bucket":
        return translateBucketStage(stageValue, context2);
      case "$facet":
        return translateFacetStage(
          stageValue,
          context2,
          this
        );
      case "$search":
        return translateSearchStage(
          stageValue,
          context2
        );
      default:
        throw new Error(`Unknown aggregation stage: ${stageType}`);
    }
  }
};

// src/executor/aggregation-executor.ts
var AggregationExecutor = class {
  constructor(sql, env2) {
    this.sql = sql;
    this.env = env2;
    this.functionExecutor = env2.LOADER ? new FunctionExecutor(env2) : null;
  }
  static {
    __name(this, "AggregationExecutor");
  }
  functionExecutor;
  /**
   * Execute an aggregation pipeline
   */
  async execute(collection, pipeline) {
    const translator = new AggregationTranslator(collection);
    const { sql, params, facets } = translator.translate(pipeline);
    if (facets) {
      return this.executeFacets(facets);
    }
    const rawResults = this.sql.exec(sql, ...params);
    const results = rawResults.toArray ? rawResults.toArray() : rawResults.results;
    const documents = results.map((row) => {
      const data = row.data;
      return JSON.parse(data);
    });
    const hasFunctions = documents.some((doc) => this.documentHasFunctions(doc));
    if (!hasFunctions) {
      return documents;
    }
    return this.executeWithFunctions(documents, pipeline);
  }
  /**
   * Check if a document contains any function placeholders
   * The marker may be wrapped in quotes from SQL string output
   */
  documentHasFunctions(doc) {
    for (const value of Object.values(doc)) {
      if (typeof value === "string" && value.includes("__FUNCTION__")) {
        return true;
      }
      if (typeof value === "object" && value !== null) {
        if (this.documentHasFunctions(value)) {
          return true;
        }
      }
    }
    return false;
  }
  /**
   * Execute pipeline with function placeholders
   */
  async executeWithFunctions(documents, pipeline = []) {
    const batchItems = [];
    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex];
      this.collectFunctionInvocations(doc, doc, [], docIndex, batchItems);
    }
    const functionGroups = this.groupByFunction(batchItems);
    for (const [body, items] of functionGroups.entries()) {
      const argsArray = items.map((item) => item.args);
      try {
        let results;
        if (this.functionExecutor) {
          results = await this.functionExecutor.executeBatch(body, argsArray);
        } else {
          results = this.executeDirectBatch(body, argsArray);
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const result = results[i];
          this.setFieldValue(documents[item.docIndex], item.fieldPath, result);
        }
      } catch (error3) {
        throw error3;
      }
    }
    const sortStage = pipeline.find((stage) => "$sort" in stage);
    if (sortStage) {
      documents.sort((a, b) => {
        for (const [field, direction] of Object.entries(sortStage.$sort)) {
          const aVal = this.extractFieldValue(a, `$.${field}`);
          const bVal = this.extractFieldValue(b, `$.${field}`);
          if (aVal === bVal) continue;
          if (aVal === null || aVal === void 0) return direction;
          if (bVal === null || bVal === void 0) return -direction;
          const comparison = aVal < bVal ? -1 : 1;
          return comparison * direction;
        }
        return 0;
      });
    }
    return documents;
  }
  /**
   * Execute functions directly without sandboxing (fallback for testing)
   * WARNING: This is NOT secure and should only be used when LOADER binding is unavailable
   */
  executeDirectBatch(body, argsArray) {
    const normalizedBody = body.trim();
    let fnCode;
    if (normalizedBody.startsWith("function")) {
      fnCode = `(${normalizedBody})`;
    } else {
      fnCode = normalizedBody;
    }
    const fn = new Function(`return ${fnCode}`)();
    return argsArray.map((args) => {
      try {
        return fn(...args);
      } catch (error3) {
        return { __error: error3 instanceof Error ? error3.message : String(error3) };
      }
    });
  }
  /**
   * Collect all function invocations from a document
   */
  collectFunctionInvocations(root, current, path, docIndex, items) {
    for (const [key, value] of Object.entries(current)) {
      const fieldPath = [...path, key];
      if (typeof value === "string" && value.includes("__FUNCTION__")) {
        const fnSpec = this.parseFunctionMarker(value);
        if (fnSpec) {
          const args = this.extractArgs(root, fnSpec);
          items.push({ docIndex, fieldPath, fnSpec, args });
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        this.collectFunctionInvocations(root, value, fieldPath, docIndex, items);
      }
    }
  }
  /**
   * Parse a function marker from a string value
   * Handles both direct markers and SQL string output with quotes
   */
  parseFunctionMarker(value) {
    const match = value.match(/__FUNCTION__({.+})$/) || value.match(/__FUNCTION__({.+})'?$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        try {
          const unescaped = match[1].replace(/''/g, "'");
          return JSON.parse(unescaped);
        } catch {
          return null;
        }
      }
    }
    return null;
  }
  /**
   * Group batch items by function body
   */
  groupByFunction(items) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      const body = item.fnSpec.body;
      if (!groups.has(body)) {
        groups.set(body, []);
      }
      groups.get(body).push(item);
    }
    return groups;
  }
  /**
   * Extract arguments for a function from document data
   */
  extractArgs(doc, fnSpec) {
    return fnSpec.argOrder.map((arg) => {
      if (arg.type === "literal") {
        return fnSpec.literalArgs[arg.index];
      }
      return this.extractFieldValue(doc, arg.path);
    });
  }
  /**
   * Extract a field value from a document using JSON path
   */
  extractFieldValue(doc, path) {
    const parts = path.replace(/^\$\./, "").split(".");
    let value = doc;
    for (const part of parts) {
      if (value === null || value === void 0) {
        return void 0;
      }
      value = value[part];
    }
    return value;
  }
  /**
   * Set a field value in a document using field path
   */
  setFieldValue(doc, path, value) {
    let current = doc;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }
  /**
   * Execute facet pipelines
   */
  async executeFacets(facets) {
    const result = {};
    for (const [name, facet] of Object.entries(facets)) {
      const rawResults = this.sql.exec(facet.sql, ...facet.params);
      const results = rawResults.toArray ? rawResults.toArray() : rawResults.results;
      result[name] = results.map((row) => {
        const data = row.data;
        return JSON.parse(data);
      });
    }
    return [result];
  }
  /**
   * Process function placeholders in a document recursively (legacy single-doc mode)
   * Kept for potential future use with streaming results
   */
  async processFunctionPlaceholders(root, doc) {
    const result = { ...doc };
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "string" && value.includes("__FUNCTION__")) {
        const fnSpec = this.parseFunctionMarker(value);
        if (fnSpec && this.functionExecutor) {
          const args = this.extractArgs(root, fnSpec);
          result[key] = await this.functionExecutor.execute(fnSpec.body, args);
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = await this.processFunctionPlaceholders(root, value);
      }
    }
    return result;
  }
};

// src/durable-object/mondo-database.ts
var MondoDatabase = class {
  static {
    __name(this, "MondoDatabase");
  }
  state;
  env;
  schemaManager;
  initialized = false;
  constructor(state2, env2) {
    this.state = state2;
    this.env = env2;
    this.schemaManager = new SchemaManager(state2.storage);
    this.state.blockConcurrencyWhile(async () => {
      await this.schemaManager.initializeSchema();
      this.initialized = true;
    });
  }
  /**
   * Check if the database is initialized
   */
  isInitialized() {
    return this.initialized;
  }
  /**
   * Get the schema manager for advanced operations
   */
  getSchemaManager() {
    return this.schemaManager;
  }
  /**
   * Get the underlying storage
   */
  getStorage() {
    return this.state.storage;
  }
  /**
   * Get or create a collection by name, returning the collection_id
   */
  getOrCreateCollection(name) {
    const sql = this.state.storage.sql;
    const existing = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray();
    if (existing.length > 0) {
      return existing[0].id;
    }
    sql.exec(
      `INSERT INTO collections (name, options) VALUES (?, '{}')`,
      name
    );
    const result = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray();
    return result[0].id;
  }
  /**
   * Get collection ID by name, returns undefined if not found
   */
  getCollectionId(name) {
    const sql = this.state.storage.sql;
    const result = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray();
    return result.length > 0 ? result[0].id : void 0;
  }
  /**
   * Insert a single document into a collection
   */
  async insertOne(collection, document) {
    const collectionId = this.getOrCreateCollection(collection);
    const sql = this.state.storage.sql;
    const docId = document._id ? document._id instanceof ObjectId ? document._id.toHexString() : String(document._id) : new ObjectId().toHexString();
    const docWithId = { ...document, _id: docId };
    sql.exec(
      `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
      collectionId,
      docId,
      JSON.stringify(docWithId)
    );
    return {
      acknowledged: true,
      insertedId: docId
    };
  }
  /**
   * Insert multiple documents into a collection
   */
  async insertMany(collection, documents) {
    const collectionId = this.getOrCreateCollection(collection);
    const sql = this.state.storage.sql;
    const insertedIds = [];
    for (const document of documents) {
      const docId = document._id ? document._id instanceof ObjectId ? document._id.toHexString() : String(document._id) : new ObjectId().toHexString();
      const docWithId = { ...document, _id: docId };
      sql.exec(
        `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
        collectionId,
        docId,
        JSON.stringify(docWithId)
      );
      insertedIds.push(docId);
    }
    return {
      acknowledged: true,
      insertedCount: insertedIds.length,
      insertedIds
    };
  }
  /**
   * Find a single document matching the query
   */
  async findOne(collection, query = {}) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return null;
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(query);
    const sqlQuery = `
      SELECT data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ""}
      LIMIT 1
    `;
    const result = sql.exec(sqlQuery, collectionId, ...params).toArray();
    if (result.length === 0) {
      return null;
    }
    return JSON.parse(result[0].data);
  }
  /**
   * Find all documents matching the query
   */
  async find(collection, query = {}) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return [];
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(query);
    const sqlQuery = `
      SELECT data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ""}
    `;
    const result = sql.exec(sqlQuery, collectionId, ...params).toArray();
    return result.map((row) => JSON.parse(row.data));
  }
  /**
   * Update a single document matching the filter
   */
  async updateOne(collection, filter, update) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);
    const findQuery = `
      SELECT id, data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ""}
      LIMIT 1
    `;
    const found = sql.exec(findQuery, collectionId, ...params).toArray();
    if (found.length === 0) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    const docRowId = found[0].id;
    const existingDoc = JSON.parse(found[0].data);
    let updatedDoc = { ...existingDoc };
    if (update.$set) {
      for (const [key, value] of Object.entries(update.$set)) {
        if (key !== "_id") {
          this.setNestedValue(updatedDoc, key, value);
        }
      }
    }
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        if (key !== "_id") {
          this.deleteNestedValue(updatedDoc, key);
        }
      }
    }
    sql.exec(
      `UPDATE documents SET data = json(?) WHERE id = ?`,
      JSON.stringify(updatedDoc),
      docRowId
    );
    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1
    };
  }
  /**
   * Delete a single document matching the filter
   */
  async deleteOne(collection, filter) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return { acknowledged: true, deletedCount: 0 };
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);
    const findQuery = `
      SELECT id FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ""}
      LIMIT 1
    `;
    const found = sql.exec(findQuery, collectionId, ...params).toArray();
    if (found.length === 0) {
      return { acknowledged: true, deletedCount: 0 };
    }
    sql.exec(`DELETE FROM documents WHERE id = ?`, found[0].id);
    return {
      acknowledged: true,
      deletedCount: 1
    };
  }
  /**
   * Build WHERE clause from MongoDB-style query
   * Supports: _id, simple field equality, $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists
   */
  buildWhereClause(query) {
    const conditions = [];
    const params = [];
    for (const [key, value] of Object.entries(query)) {
      if (key === "_id") {
        conditions.push("_id = ?");
        params.push(value instanceof ObjectId ? value.toHexString() : String(value));
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        for (const [op, opValue] of Object.entries(value)) {
          const jsonPath = this.fieldToJsonPath(key);
          switch (op) {
            case "$eq": {
              conditions.push(`json_extract(data, ?) = ?`);
              const eqValue = typeof opValue === "boolean" ? opValue ? 1 : 0 : opValue;
              params.push(jsonPath, eqValue);
              break;
            }
            case "$ne": {
              conditions.push(`json_extract(data, ?) != ?`);
              const neValue = typeof opValue === "boolean" ? opValue ? 1 : 0 : opValue;
              params.push(jsonPath, neValue);
              break;
            }
            case "$gt":
              conditions.push(`json_extract(data, ?) > ?`);
              params.push(jsonPath, opValue);
              break;
            case "$gte":
              conditions.push(`json_extract(data, ?) >= ?`);
              params.push(jsonPath, opValue);
              break;
            case "$lt":
              conditions.push(`json_extract(data, ?) < ?`);
              params.push(jsonPath, opValue);
              break;
            case "$lte":
              conditions.push(`json_extract(data, ?) <= ?`);
              params.push(jsonPath, opValue);
              break;
            case "$in":
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => "?").join(", ");
                conditions.push(`json_extract(data, ?) IN (${placeholders})`);
                params.push(jsonPath, ...opValue);
              }
              break;
            case "$nin":
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => "?").join(", ");
                conditions.push(`json_extract(data, ?) NOT IN (${placeholders})`);
                params.push(jsonPath, ...opValue);
              }
              break;
            case "$exists":
              if (opValue) {
                conditions.push(`json_extract(data, ?) IS NOT NULL`);
              } else {
                conditions.push(`json_extract(data, ?) IS NULL`);
              }
              params.push(jsonPath);
              break;
          }
        }
      } else {
        const jsonPath = this.fieldToJsonPath(key);
        conditions.push(`json_extract(data, ?) = ?`);
        const sqlValue = typeof value === "boolean" ? value ? 1 : 0 : value;
        params.push(jsonPath, sqlValue);
      }
    }
    return {
      whereClause: conditions.join(" AND "),
      params
    };
  }
  /**
   * Convert a field name (possibly with dot notation) to JSON path
   * e.g., "profile.level" -> "$.profile.level"
   */
  fieldToJsonPath(field) {
    return `$.${field}`;
  }
  /**
   * Set a nested value in an object using dot notation path
   */
  setNestedValue(obj, path, value) {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }
  /**
   * Delete a nested value from an object using dot notation path
   */
  deleteNestedValue(obj, path) {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
        return;
      }
      current = current[key];
    }
    delete current[keys[keys.length - 1]];
  }
  /**
   * Delete multiple documents matching the filter
   */
  async deleteMany(collection, filter = {}) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return { acknowledged: true, deletedCount: 0 };
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);
    if (!whereClause) {
      const countResult = sql.exec(
        `SELECT COUNT(*) as count FROM documents WHERE collection_id = ?`,
        collectionId
      ).toArray();
      const count3 = countResult[0]?.count || 0;
      sql.exec(`DELETE FROM documents WHERE collection_id = ?`, collectionId);
      return { acknowledged: true, deletedCount: count3 };
    }
    const findQuery = `
      SELECT id FROM documents
      WHERE collection_id = ? AND ${whereClause}
    `;
    const found = sql.exec(findQuery, collectionId, ...params).toArray();
    for (const row of found) {
      sql.exec(`DELETE FROM documents WHERE id = ?`, row.id);
    }
    return {
      acknowledged: true,
      deletedCount: found.length
    };
  }
  /**
   * Count documents matching the filter
   */
  async countDocuments(collection, filter = {}) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return 0;
    }
    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);
    const countQuery = `
      SELECT COUNT(*) as count FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ""}
    `;
    const result = sql.exec(countQuery, collectionId, ...params).toArray();
    return result[0]?.count || 0;
  }
  /**
   * Execute an aggregation pipeline on a collection
   *
   * Supports async execution for $function operators that require
   * JavaScript execution via worker-loader.
   *
   * @param collection - The collection name
   * @param pipeline - Array of aggregation pipeline stages
   * @returns Array of result documents
   */
  async aggregate(collection, pipeline) {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === void 0) {
      return [];
    }
    const sqlInterface = {
      exec: /* @__PURE__ */ __name((query, ...params) => {
        let modifiedQuery;
        const fromPattern = new RegExp(`FROM\\s+${collection}\\b(\\s+WHERE\\s+)?`, "gi");
        modifiedQuery = query.replace(fromPattern, (match, hasWhere) => {
          if (hasWhere) {
            return `FROM documents WHERE collection_id = ${collectionId} AND `;
          } else {
            return `FROM documents WHERE collection_id = ${collectionId}`;
          }
        });
        const result = this.state.storage.sql.exec(modifiedQuery, ...params);
        const array = result.toArray();
        return {
          results: array,
          toArray: /* @__PURE__ */ __name(() => array, "toArray")
        };
      }, "exec")
    };
    const executor = new AggregationExecutor(sqlInterface, this.env);
    return executor.execute(collection, pipeline);
  }
  /**
   * Reset database - for testing purposes
   */
  async reset() {
    const sql = this.state.storage.sql;
    sql.exec(`DELETE FROM documents`);
    sql.exec(`DELETE FROM collections`);
  }
  /**
   * Dump database contents - for debugging
   */
  async dump() {
    const sql = this.state.storage.sql;
    const collections = sql.exec(`SELECT * FROM collections`).toArray();
    const documents = sql.exec(`SELECT * FROM documents`).toArray();
    return { collections, documents };
  }
  /**
   * Handle incoming fetch requests
   * Implements HTTP API for MongoDB-compatible operations
   */
  async fetch(request) {
    if (!this.initialized) {
      return new Response(JSON.stringify({ error: "Database initializing" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/health") {
        const isValid = await this.schemaManager.validateSchema();
        return new Response(
          JSON.stringify({
            status: isValid ? "healthy" : "unhealthy",
            schemaVersion: await this.schemaManager.getSchemaVersion()
          }),
          {
            status: isValid ? 200 : 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (request.method === "POST" && path === "/internal/reset") {
        await this.reset();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (request.method === "GET" && path === "/internal/dump") {
        const data = await this.dump();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (request.method === "POST") {
        const body = await request.json();
        const collection = body.collection;
        if (!collection) {
          return new Response(JSON.stringify({ error: "Collection name required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/insertOne") {
          const result = await this.insertOne(collection, body.document || {});
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/insertMany") {
          const result = await this.insertMany(collection, body.documents || []);
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/findOne") {
          const result = await this.findOne(collection, body.filter || {});
          return new Response(JSON.stringify({ document: result }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/find") {
          const result = await this.find(collection, body.filter || {});
          return new Response(JSON.stringify({ documents: result }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/updateOne") {
          const result = await this.updateOne(
            collection,
            body.filter || {},
            body.update || {}
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/deleteOne") {
          const result = await this.deleteOne(collection, body.filter || {});
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/deleteMany") {
          const result = await this.deleteMany(collection, body.filter || {});
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/countDocuments") {
          const result = await this.countDocuments(collection, body.filter || {});
          return new Response(JSON.stringify({ count: result }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path === "/aggregate") {
          const result = await this.aggregate(collection, body.pipeline || []);
          return new Response(JSON.stringify({ documents: result }), {
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error3) {
      const message = error3 instanceof Error ? error3.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

// src/worker.ts
var worker_default = {
  async fetch(request, env2, ctx) {
    const entrypoint = new MondoEntrypoint(ctx, env2);
    return entrypoint.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    return Response.json(error3, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-3cyEtF/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-3cyEtF/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MondoDatabase,
  MondoEntrypoint,
  WorkerEntrypoint,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
