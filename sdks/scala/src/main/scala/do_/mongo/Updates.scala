package do_.mongo

import java.time.Instant

/**
 * MongoDB update operation builders.
 * Provides type-safe construction of update documents.
 */
object Updates:

  /**
   * Sets a field to a value.
   */
  def set[T](field: String, value: T): Bson =
    Bson.doc("$set" -> Map(field -> value))

  /**
   * Sets multiple fields at once.
   */
  def setAll(updates: (String, Any)*): Bson =
    Bson.doc("$set" -> updates.toMap)

  /**
   * Unsets (removes) a field.
   */
  def unset(field: String): Bson =
    Bson.doc("$unset" -> Map(field -> ""))

  /**
   * Unsets multiple fields.
   */
  def unsetAll(fields: String*): Bson =
    Bson.doc("$unset" -> fields.map(_ -> "").toMap)

  /**
   * Sets a field only if the document is being inserted (upsert).
   */
  def setOnInsert[T](field: String, value: T): Bson =
    Bson.doc("$setOnInsert" -> Map(field -> value))

  /**
   * Increments a numeric field by the given amount.
   */
  def inc(field: String, amount: Number): Bson =
    Bson.doc("$inc" -> Map(field -> amount))

  /**
   * Multiplies a numeric field by the given factor.
   */
  def mul(field: String, factor: Number): Bson =
    Bson.doc("$mul" -> Map(field -> factor))

  /**
   * Renames a field.
   */
  def rename(field: String, newName: String): Bson =
    Bson.doc("$rename" -> Map(field -> newName))

  /**
   * Sets a field to the lesser of its current value or the specified value.
   */
  def min[T](field: String, value: T): Bson =
    Bson.doc("$min" -> Map(field -> value))

  /**
   * Sets a field to the greater of its current value or the specified value.
   */
  def max[T](field: String, value: T): Bson =
    Bson.doc("$max" -> Map(field -> value))

  /**
   * Sets a field to the current date/time.
   */
  def currentDate(field: String): Bson =
    Bson.doc("$currentDate" -> Map(field -> true))

  /**
   * Sets a field to the current timestamp.
   */
  def currentTimestamp(field: String): Bson =
    Bson.doc("$currentDate" -> Map(field -> Map("$type" -> "timestamp")))

  /**
   * Pushes a value to an array field.
   */
  def push[T](field: String, value: T): Bson =
    Bson.doc("$push" -> Map(field -> value))

  /**
   * Pushes multiple values to an array field.
   */
  def pushAll[T](field: String, values: Iterable[T]): Bson =
    Bson.doc("$push" -> Map(field -> Map("$each" -> values.toList)))

  /**
   * Pushes values to an array with modifiers (position, slice, sort).
   */
  def pushWithModifiers[T](
    field: String,
    values: Iterable[T],
    position: Option[Int] = None,
    slice: Option[Int] = None,
    sort: Option[Bson] = None
  ): Bson =
    val modifiers = Map("$each" -> values.toList) ++
      position.map("$position" -> _) ++
      slice.map("$slice" -> _) ++
      sort.map("$sort" -> _.toMap)
    Bson.doc("$push" -> Map(field -> modifiers))

  /**
   * Adds values to an array only if they don't already exist (set union).
   */
  def addToSet[T](field: String, value: T): Bson =
    Bson.doc("$addToSet" -> Map(field -> value))

  /**
   * Adds multiple values to an array (set union).
   */
  def addToSetAll[T](field: String, values: Iterable[T]): Bson =
    Bson.doc("$addToSet" -> Map(field -> Map("$each" -> values.toList)))

  /**
   * Removes the first element from an array.
   */
  def popFirst(field: String): Bson =
    Bson.doc("$pop" -> Map(field -> -1))

  /**
   * Removes the last element from an array.
   */
  def popLast(field: String): Bson =
    Bson.doc("$pop" -> Map(field -> 1))

  /**
   * Removes all occurrences of a value from an array.
   */
  def pull[T](field: String, value: T): Bson =
    Bson.doc("$pull" -> Map(field -> value))

  /**
   * Removes all occurrences of values matching a condition from an array.
   */
  def pullByFilter(field: String, filter: Bson): Bson =
    Bson.doc("$pull" -> Map(field -> filter.toMap))

  /**
   * Removes all occurrences of any of the specified values from an array.
   */
  def pullAll[T](field: String, values: Iterable[T]): Bson =
    Bson.doc("$pullAll" -> Map(field -> values.toList))

  /**
   * Performs a bitwise AND update.
   */
  def bitwiseAnd(field: String, value: Long): Bson =
    Bson.doc("$bit" -> Map(field -> Map("and" -> value)))

  /**
   * Performs a bitwise OR update.
   */
  def bitwiseOr(field: String, value: Long): Bson =
    Bson.doc("$bit" -> Map(field -> Map("or" -> value)))

  /**
   * Performs a bitwise XOR update.
   */
  def bitwiseXor(field: String, value: Long): Bson =
    Bson.doc("$bit" -> Map(field -> Map("xor" -> value)))

  /**
   * Combines multiple update operations.
   */
  def combine(updates: Bson*): Bson =
    updates.foldLeft(Bson.empty)(_ ++ _)

  /**
   * Extension methods for fluent update building.
   */
  extension (update: Bson)
    def combine(other: Bson): Bson = Updates.combine(update, other)
    def and(other: Bson): Bson = Updates.combine(update, other)
