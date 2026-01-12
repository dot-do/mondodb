package do_.mongo

/**
 * MongoDB sort order builders.
 */
object Sorts:

  /**
   * Sorts in ascending order by the specified field.
   */
  def ascending(field: String): Bson =
    Bson.doc(field -> 1)

  /**
   * Sorts in ascending order by multiple fields.
   */
  def ascending(fields: String*): Bson =
    Bson(fields.map(_ -> 1).toMap)

  /**
   * Sorts in descending order by the specified field.
   */
  def descending(field: String): Bson =
    Bson.doc(field -> -1)

  /**
   * Sorts in descending order by multiple fields.
   */
  def descending(fields: String*): Bson =
    Bson(fields.map(_ -> -1).toMap)

  /**
   * Sorts by text score metadata.
   */
  def metaTextScore(field: String): Bson =
    Bson.doc(field -> Map("$meta" -> "textScore"))

  /**
   * Combines multiple sort specifications.
   */
  def orderBy(sorts: Bson*): Bson =
    sorts.foldLeft(Bson.empty)(_ ++ _)

  /**
   * Creates a natural sort order (document order on disk).
   */
  def natural: Bson =
    Bson.doc("$natural" -> 1)

  /**
   * Creates a reverse natural sort order.
   */
  def naturalReverse: Bson =
    Bson.doc("$natural" -> -1)

  /**
   * Extension methods for fluent sort building.
   */
  extension (sort: Bson)
    def thenBy(other: Bson): Bson = orderBy(sort, other)
