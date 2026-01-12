## MongoDB configuration for the .do platform

import std/[os, times, httpclient, json, options]

type
  MongoConfig* = ref object
    uri*: string
    name*: string
    domain*: string
    timeout*: Duration
    maxRetries*: int
    retryDelayMs*: int
    apiKey*: string
    vector*: bool
    fulltext*: bool
    analytics*: bool
    hotStorage*: string
    warmStorage*: string
    coldStorage*: string

const
  DefaultTimeout* = initDuration(seconds = 30)
  DefaultMaxRetries* = 3
  DefaultRetryDelayMs* = 100

proc newMongoConfig*(): MongoConfig =
  ## Create a new configuration with defaults from environment
  MongoConfig(
    uri: getEnv("MONGO_DO_URL", "https://mongo.do"),
    name: getEnv("MONGO_DO_DATABASE", ""),
    domain: getEnv("MONGO_DO_DOMAIN", ""),
    timeout: DefaultTimeout,
    maxRetries: DefaultMaxRetries,
    retryDelayMs: DefaultRetryDelayMs,
    apiKey: getEnv("MONGO_DO_API_KEY", ""),
    vector: false,
    fulltext: false,
    analytics: false,
    hotStorage: "sqlite",
    warmStorage: "r2",
    coldStorage: "archive"
  )

proc newMongoConfig*(uri: string, apiKey: string = ""): MongoConfig =
  ## Create a configuration with a specific URI
  result = newMongoConfig()
  result.uri = uri
  if apiKey.len > 0:
    result.apiKey = apiKey

proc headers*(config: MongoConfig): HttpHeaders =
  ## Get HTTP headers for API requests
  result = newHttpHeaders()
  result["Content-Type"] = "application/json"
  if config.apiKey.len > 0:
    result["Authorization"] = "Bearer " & config.apiKey

proc toJson*(config: MongoConfig): JsonNode =
  ## Serialize config to JSON
  result = %*{
    "uri": config.uri,
    "name": config.name,
    "domain": config.domain,
    "timeout": config.timeout.inMilliseconds,
    "maxRetries": config.maxRetries,
    "vector": config.vector,
    "fulltext": config.fulltext,
    "analytics": config.analytics
  }

# Configuration DSL

template configureMongo*(body: untyped): untyped =
  ## Configure MongoDB with a DSL
  ##
  ## Example:
  ## ```nim
  ## configureMongo:
  ##   name = "my-database"
  ##   domain = "db.myapp.com"
  ##   vector = true
  ##   fulltext = true
  ## ```
  block:
    var config = newMongoConfig()

    template name(val: string) {.used.} = config.name = val
    template domain(val: string) {.used.} = config.domain = val
    template uri(val: string) {.used.} = config.uri = val
    template apiKey(val: string) {.used.} = config.apiKey = val
    template timeout(val: Duration) {.used.} = config.timeout = val
    template maxRetries(val: int) {.used.} = config.maxRetries = val
    template vector(val: bool) {.used.} = config.vector = val
    template fulltext(val: bool) {.used.} = config.fulltext = val
    template analytics(val: bool) {.used.} = config.analytics = val

    template storage(sbody: untyped) {.used.} =
      block:
        template hot(val: string) {.used.} = config.hotStorage = val
        template warm(val: string) {.used.} = config.warmStorage = val
        template cold(val: string) {.used.} = config.coldStorage = val
        sbody

    body
    configure(config)
