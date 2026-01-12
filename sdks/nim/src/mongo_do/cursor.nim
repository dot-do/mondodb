## MongoDB cursor for the .do platform

import std/[json, options, asyncdispatch]

type
  SortDirection* = enum
    Ascending = 1
    Descending = -1

  Cursor* = ref object
    documents*: seq[JsonNode]
    index: int
    exhausted: bool
    batchSize: int
    # For server-side cursors
    cursorId: int64
    namespace: string

proc newCursor*(documents: seq[JsonNode] = @[]): Cursor =
  Cursor(
    documents: documents,
    index: 0,
    exhausted: documents.len == 0,
    batchSize: 100,
    cursorId: 0
  )

proc newCursor*(cursorId: int64, namespace: string, batchSize: int = 100): Cursor =
  Cursor(
    documents: @[],
    index: 0,
    exhausted: false,
    batchSize: batchSize,
    cursorId: cursorId,
    namespace: namespace
  )

proc hasNext*(cursor: Cursor): bool =
  ## Check if there are more documents
  cursor.index < cursor.documents.len or not cursor.exhausted

proc next*(cursor: var Cursor): Option[JsonNode] =
  ## Get the next document
  if cursor.index < cursor.documents.len:
    result = some(cursor.documents[cursor.index])
    inc cursor.index
  elif cursor.exhausted:
    result = none(JsonNode)
  else:
    # Would fetch more from server in real implementation
    cursor.exhausted = true
    result = none(JsonNode)

proc toSeq*(cursor: Cursor): seq[JsonNode] =
  ## Convert cursor to a sequence
  cursor.documents

proc count*(cursor: Cursor): int =
  ## Count remaining documents
  cursor.documents.len - cursor.index

proc close*(cursor: var Cursor) =
  ## Close the cursor
  cursor.exhausted = true
  cursor.documents = @[]
  cursor.index = 0

iterator items*(cursor: Cursor): JsonNode =
  ## Iterate over cursor documents
  for doc in cursor.documents:
    yield doc

iterator pairs*(cursor: Cursor): (int, JsonNode) =
  ## Iterate with index
  var idx = 0
  for doc in cursor.documents:
    yield (idx, doc)
    inc idx

# Cursor methods for chaining (builder pattern)

type
  CursorBuilder* = ref object
    filter*: JsonNode
    projection*: JsonNode
    sortSpec*: JsonNode
    skipCount*: int
    limitCount*: int
    collation*: JsonNode
    hint*: JsonNode
    comment*: string

proc newCursorBuilder*(filter: JsonNode = nil): CursorBuilder =
  CursorBuilder(
    filter: if filter.isNil: newJObject() else: filter,
    projection: nil,
    sortSpec: nil,
    skipCount: 0,
    limitCount: 0
  )

proc project*(builder: CursorBuilder, projection: JsonNode): CursorBuilder =
  builder.projection = projection
  builder

proc sort*(builder: CursorBuilder, field: string, direction: SortDirection = Ascending): CursorBuilder =
  if builder.sortSpec.isNil:
    builder.sortSpec = newJObject()
  builder.sortSpec[field] = %direction.ord
  builder

proc sort*(builder: CursorBuilder, spec: JsonNode): CursorBuilder =
  builder.sortSpec = spec
  builder

proc skip*(builder: CursorBuilder, n: int): CursorBuilder =
  builder.skipCount = n
  builder

proc limit*(builder: CursorBuilder, n: int): CursorBuilder =
  builder.limitCount = n
  builder

proc collation*(builder: CursorBuilder, spec: JsonNode): CursorBuilder =
  builder.collation = spec
  builder

proc hint*(builder: CursorBuilder, indexName: string): CursorBuilder =
  builder.hint = %indexName
  builder

proc hint*(builder: CursorBuilder, indexSpec: JsonNode): CursorBuilder =
  builder.hint = indexSpec
  builder

proc comment*(builder: CursorBuilder, text: string): CursorBuilder =
  builder.comment = text
  builder

proc toFindOptions*(builder: CursorBuilder): JsonNode =
  result = %*{}
  if not builder.projection.isNil:
    result["projection"] = builder.projection
  if not builder.sortSpec.isNil:
    result["sort"] = builder.sortSpec
  if builder.skipCount > 0:
    result["skip"] = %builder.skipCount
  if builder.limitCount > 0:
    result["limit"] = %builder.limitCount
  if not builder.collation.isNil:
    result["collation"] = builder.collation
  if not builder.hint.isNil:
    result["hint"] = builder.hint
  if builder.comment.len > 0:
    result["comment"] = %builder.comment
