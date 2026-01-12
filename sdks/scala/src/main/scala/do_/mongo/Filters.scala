package do_.mongo

/**
 * MongoDB filter builders for type-safe query construction.
 * Returns Bson representations suitable for query operations.
 */
object Filters:

  /**
   * Matches documents where the field equals the value.
   */
  def eq[T](field: String, value: T): Bson =
    Bson.doc(field -> value)

  /**
   * Matches documents where the field does not equal the value.
   */
  def ne[T](field: String, value: T): Bson =
    Bson.doc(field -> Bson.doc("$ne" -> value))

  /**
   * Matches documents where the field is greater than the value.
   */
  def gt[T](field: String, value: T): Bson =
    Bson.doc(field -> Bson.doc("$gt" -> value))

  /**
   * Matches documents where the field is greater than or equal to the value.
   */
  def gte[T](field: String, value: T): Bson =
    Bson.doc(field -> Bson.doc("$gte" -> value))

  /**
   * Matches documents where the field is less than the value.
   */
  def lt[T](field: String, value: T): Bson =
    Bson.doc(field -> Bson.doc("$lt" -> value))

  /**
   * Matches documents where the field is less than or equal to the value.
   */
  def lte[T](field: String, value: T): Bson =
    Bson.doc(field -> Bson.doc("$lte" -> value))

  /**
   * Matches documents where the field value is in the given list.
   */
  def in[T](field: String, values: Iterable[T]): Bson =
    Bson.doc(field -> Bson.doc("$in" -> values.toList))

  /**
   * Matches documents where the field value is not in the given list.
   */
  def nin[T](field: String, values: Iterable[T]): Bson =
    Bson.doc(field -> Bson.doc("$nin" -> values.toList))

  /**
   * Matches documents where the field exists (or not).
   */
  def exists(field: String, exists: Boolean = true): Bson =
    Bson.doc(field -> Bson.doc("$exists" -> exists))

  /**
   * Matches documents where the field is of the specified type.
   */
  def `type`(field: String, bsonType: String): Bson =
    Bson.doc(field -> Bson.doc("$type" -> bsonType))

  /**
   * Matches documents where the field matches the regex.
   */
  def regex(field: String, pattern: String, options: String = ""): Bson =
    if options.isEmpty then
      Bson.doc(field -> Bson.doc("$regex" -> pattern))
    else
      Bson.doc(field -> Bson.doc("$regex" -> pattern, "$options" -> options))

  /**
   * Matches documents where the text matches the search string.
   */
  def text(search: String, language: Option[String] = None, caseSensitive: Boolean = false): Bson =
    val base = Map[String, Any]("$search" -> search, "$caseSensitive" -> caseSensitive)
    val withLang = language.fold(base)(l => base + ("$language" -> l))
    Bson.doc("$text" -> withLang)

  /**
   * Matches documents where the field's modulo by divisor equals remainder.
   */
  def mod(field: String, divisor: Long, remainder: Long): Bson =
    Bson.doc(field -> Bson.doc("$mod" -> List(divisor, remainder)))

  /**
   * Matches all of the given filters (AND).
   */
  def and(filters: Bson*): Bson =
    Bson.doc("$and" -> filters.toList)

  /**
   * Matches any of the given filters (OR).
   */
  def or(filters: Bson*): Bson =
    Bson.doc("$or" -> filters.toList)

  /**
   * Matches none of the given filters (NOR).
   */
  def nor(filters: Bson*): Bson =
    Bson.doc("$nor" -> filters.toList)

  /**
   * Inverts the given filter (NOT).
   */
  def not(filter: Bson): Bson =
    Bson.doc("$not" -> filter)

  /**
   * Matches documents where the array field contains all the specified elements.
   */
  def all[T](field: String, values: Iterable[T]): Bson =
    Bson.doc(field -> Bson.doc("$all" -> values.toList))

  /**
   * Matches documents where the array field contains at least one element matching the filter.
   */
  def elemMatch(field: String, filter: Bson): Bson =
    Bson.doc(field -> Bson.doc("$elemMatch" -> filter))

  /**
   * Matches documents where the array field has the specified size.
   */
  def size(field: String, size: Int): Bson =
    Bson.doc(field -> Bson.doc("$size" -> size))

  /**
   * Matches documents where the field's bits are all set.
   */
  def bitsAllSet(field: String, bitmask: Long): Bson =
    Bson.doc(field -> Bson.doc("$bitsAllSet" -> bitmask))

  /**
   * Matches documents where the field's bits are any set.
   */
  def bitsAnySet(field: String, bitmask: Long): Bson =
    Bson.doc(field -> Bson.doc("$bitsAnySet" -> bitmask))

  /**
   * Matches documents where the field's bits are all clear.
   */
  def bitsAllClear(field: String, bitmask: Long): Bson =
    Bson.doc(field -> Bson.doc("$bitsAllClear" -> bitmask))

  /**
   * Matches documents where the field's bits are any clear.
   */
  def bitsAnyClear(field: String, bitmask: Long): Bson =
    Bson.doc(field -> Bson.doc("$bitsAnyClear" -> bitmask))

  /**
   * Matches documents within a geospatial sphere.
   */
  def geoWithinSphere(field: String, x: Double, y: Double, radius: Double): Bson =
    Bson.doc(field -> Bson.doc(
      "$geoWithin" -> Bson.doc(
        "$centerSphere" -> List(List(x, y), radius)
      )
    ))

  /**
   * Matches documents near a geospatial point.
   */
  def near(field: String, x: Double, y: Double, maxDistance: Option[Double] = None): Bson =
    val nearDoc = Map[String, Any](
      "$geometry" -> Map("type" -> "Point", "coordinates" -> List(x, y))
    ) ++ maxDistance.map("$maxDistance" -> _)
    Bson.doc(field -> Bson.doc("$near" -> nearDoc))

  /**
   * Matches all documents.
   */
  def empty: Bson = Bson.doc()

  /**
   * Extension methods for fluent filter building.
   */
  extension (filter: Bson)
    def &&(other: Bson): Bson = and(filter, other)
    def ||(other: Bson): Bson = or(filter, other)
    def unary_! : Bson = not(filter)
