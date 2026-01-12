package do_.mongo

/**
 * MongoDB projection builders for controlling which fields are returned.
 */
object Projections:

  /**
   * Includes the specified fields.
   */
  def include(fields: String*): Bson =
    Bson(fields.map(_ -> 1).toMap)

  /**
   * Excludes the specified fields.
   */
  def exclude(fields: String*): Bson =
    Bson(fields.map(_ -> 0).toMap)

  /**
   * Excludes the _id field.
   */
  def excludeId: Bson =
    Bson.doc("_id" -> 0)

  /**
   * Projects array elements matching a condition.
   */
  def elemMatch(field: String, filter: Bson): Bson =
    Bson.doc(field -> Map("$elemMatch" -> filter.toMap))

  /**
   * Projects the first matching array element.
   */
  def elemMatchFirst(field: String): Bson =
    Bson.doc(s"$field.$$" -> 1)

  /**
   * Projects a slice of an array field.
   */
  def slice(field: String, limit: Int): Bson =
    Bson.doc(field -> Map("$slice" -> limit))

  /**
   * Projects a slice of an array field with skip and limit.
   */
  def slice(field: String, skip: Int, limit: Int): Bson =
    Bson.doc(field -> Map("$slice" -> List(skip, limit)))

  /**
   * Projects metadata (e.g., text score).
   */
  def metaTextScore(field: String): Bson =
    Bson.doc(field -> Map("$meta" -> "textScore"))

  /**
   * Combines multiple projections.
   */
  def fields(projections: Bson*): Bson =
    projections.foldLeft(Bson.empty)(_ ++ _)

  /**
   * Creates a computed field projection.
   */
  def computed(field: String, expression: Any): Bson =
    Bson.doc(field -> expression)

  /**
   * Extension methods for fluent projection building.
   */
  extension (projection: Bson)
    def and(other: Bson): Bson = fields(projection, other)
