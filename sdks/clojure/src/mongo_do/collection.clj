(ns mongo-do.collection
  "MongoDB collection operations with data-oriented API.

   All operations work with plain Clojure maps.
   Query results can be consumed as lazy sequences."
  (:require [mongo-do.types :as types]
            [mongo-do.cursor :as cursor]))

;; ============================================================================
;; Collection Protocol
;; ============================================================================

(defprotocol ICollection
  "Protocol for MongoDB collection operations."
  (-name [this] "Get the collection name.")
  (-full-name [this] "Get the full collection name (db.collection).")
  (-database [this] "Get the parent database.")
  (-rpc [this] "Get the RPC client.")
  (-db-name [this] "Get the database name."))

;; ============================================================================
;; Collection Implementation
;; ============================================================================

(defrecord Collection [rpc database coll-name]
  ICollection
  (-name [_] coll-name)

  (-full-name [_]
    (str (.-db-name database) "." coll-name))

  (-database [_] database)

  (-rpc [_] rpc)

  (-db-name [_] (.-db-name database)))

;; ============================================================================
;; Projection Helpers
;; ============================================================================

(defn- normalize-projection
  "Normalize projection to a map.
   Accepts either a map or a vector of field names."
  [projection]
  (cond
    (nil? projection) nil
    (map? projection) projection
    (sequential? projection) (into {} (map (fn [f] [f 1]) projection))
    :else nil))

;; ============================================================================
;; Insert Operations
;; ============================================================================

(defn insert-one!
  "Insert a single document.

   Args:
     coll - Collection instance
     document - Document map to insert

   Returns:
     InsertOneResult map with :inserted-id and :acknowledged

   Throws:
     ExceptionInfo with :type :duplicate-key if document with same _id exists

   Example:
     (insert-one! users {:name \"Alice\" :email \"alice@example.com\"})"
  [coll document]
  (let [doc (types/ensure-id document)
        rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)
        result (-> rpc .-mongo (.insertOne db-name coll-name doc))]
    (types/parse-insert-one-result result (:_id doc))))

(defn insert-many!
  "Insert multiple documents.

   Args:
     coll - Collection instance
     documents - Vector of document maps to insert
     opts - Optional configuration:
            :ordered - If true, stop on first error (default: true)

   Returns:
     InsertManyResult map with :inserted-ids and :acknowledged

   Example:
     (insert-many! users [{:name \"Alice\"} {:name \"Bob\"}])"
  ([coll documents]
   (insert-many! coll documents {}))
  ([coll documents opts]
   (let [docs (mapv types/ensure-id documents)
         rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.insertMany db-name coll-name docs
                                             {:ordered (get opts :ordered true)}))]
     (types/parse-insert-many-result result (mapv :_id docs)))))

;; ============================================================================
;; Find Operations
;; ============================================================================

(defn find-one
  "Find a single document.

   Args:
     coll - Collection instance
     filter - Query filter map (optional, default: {})
     opts - Optional configuration:
            :projection - Fields to include/exclude (map or vector)

   Returns:
     Document map, or nil if not found.

   Example:
     (find-one users {:email \"alice@example.com\"})
     (find-one users {:status \"active\"} {:projection [:name :email]})"
  ([coll]
   (find-one coll {} nil))
  ([coll filter]
   (find-one coll filter nil))
  ([coll filter opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         options (cond-> {}
                   (:projection opts)
                   (assoc :projection (normalize-projection (:projection opts))))
         result (-> rpc .-mongo (.findOne db-name coll-name (or filter {}) options))]
     (when (and result
                (map? result)
                (not (:error result)))
       result))))

(defn find
  "Find documents matching the filter.

   Args:
     coll - Collection instance
     filter - Query filter map (optional, default: {})
     opts - Optional configuration:
            :projection - Fields to include/exclude
            :sort - Sort specification [[field dir] ...]
            :skip - Number of documents to skip
            :limit - Maximum documents to return
            :batch-size - Cursor batch size

   Returns:
     Vector of document maps.

   Example:
     (find users {:status \"active\"})
     (find users {:age {:$gt 21}} {:sort [[:name 1]] :limit 10})"
  ([coll]
   (find coll {} nil))
  ([coll filter]
   (find coll filter nil))
  ([coll filter opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         options (cond-> {}
                   (:projection opts)
                   (assoc :projection (normalize-projection (:projection opts)))
                   (:sort opts)
                   (assoc :sort (:sort opts))
                   (:skip opts)
                   (assoc :skip (:skip opts))
                   (:limit opts)
                   (assoc :limit (:limit opts)))
         result (-> rpc .-mongo (.find db-name coll-name (or filter {}) options))]
     (if (sequential? result)
       (vec result)
       []))))

(defn find-seq
  "Find documents as a lazy sequence.

   Args:
     coll - Collection instance
     filter - Query filter map (optional, default: {})
     opts - Optional configuration (same as find)

   Returns:
     Lazy sequence of document maps.

   Example:
     (doseq [user (find-seq users {:status \"active\"})]
       (println (:name user)))

     ;; With transducers
     (into []
           (comp (filter #(> (:age %) 21))
                 (map :email)
                 (take 100))
           (find-seq users {}))"
  ([coll]
   (find-seq coll {} nil))
  ([coll filter]
   (find-seq coll filter nil))
  ([coll filter opts]
   (cursor/->lazy-seq (-rpc coll)
                      (-db-name coll)
                      (-name coll)
                      (or filter {})
                      opts)))

;; ============================================================================
;; Update Operations
;; ============================================================================

(defn update-one!
  "Update a single document.

   Args:
     coll - Collection instance
     filter - Query filter map
     update - Update operations map (e.g., {:$set {:status \"active\"}})
     opts - Optional configuration:
            :upsert - If true, insert if no document matches (default: false)

   Returns:
     UpdateResult map with :matched-count, :modified-count, :upserted-id

   Example:
     (update-one! users {:email \"alice@example.com\"}
                        {:$set {:status \"vip\"}})"
  ([coll filter update]
   (update-one! coll filter update {}))
  ([coll filter update opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.updateOne db-name coll-name filter update
                                            {:upsert (get opts :upsert false)}))]
     (types/parse-update-result result))))

(defn update-many!
  "Update multiple documents.

   Args:
     coll - Collection instance
     filter - Query filter map
     update - Update operations map
     opts - Optional configuration:
            :upsert - If true, insert if no document matches (default: false)

   Returns:
     UpdateResult map with :matched-count, :modified-count

   Example:
     (update-many! users {:status \"inactive\"}
                         {:$set {:archived true}})"
  ([coll filter update]
   (update-many! coll filter update {}))
  ([coll filter update opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.updateMany db-name coll-name filter update
                                             {:upsert (get opts :upsert false)}))]
     (types/parse-update-result result))))

(defn replace-one!
  "Replace a single document.

   Args:
     coll - Collection instance
     filter - Query filter map
     replacement - Replacement document
     opts - Optional configuration:
            :upsert - If true, insert if no document matches (default: false)

   Returns:
     UpdateResult map

   Example:
     (replace-one! users {:_id \"123\"}
                         {:_id \"123\" :name \"Alice\" :status \"vip\"})"
  ([coll filter replacement]
   (replace-one! coll filter replacement {}))
  ([coll filter replacement opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.replaceOne db-name coll-name filter replacement
                                             {:upsert (get opts :upsert false)}))]
     (types/parse-update-result result))))

;; ============================================================================
;; Delete Operations
;; ============================================================================

(defn delete-one!
  "Delete a single document.

   Args:
     coll - Collection instance
     filter - Query filter map

   Returns:
     DeleteResult map with :deleted-count

   Example:
     (delete-one! users {:email \"alice@example.com\"})"
  [coll filter]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)
        result (-> rpc .-mongo (.deleteOne db-name coll-name filter))]
    (types/parse-delete-result result)))

(defn delete-many!
  "Delete multiple documents.

   Args:
     coll - Collection instance
     filter - Query filter map

   Returns:
     DeleteResult map with :deleted-count

   Example:
     (delete-many! users {:status \"inactive\"})"
  [coll filter]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)
        result (-> rpc .-mongo (.deleteMany db-name coll-name filter))]
    (types/parse-delete-result result)))

;; ============================================================================
;; Count and Distinct
;; ============================================================================

(defn count-documents
  "Count documents matching the filter.

   Args:
     coll - Collection instance
     filter - Query filter map (optional, default: {})

   Returns:
     Number of matching documents.

   Example:
     (count-documents users {:status \"active\"})"
  ([coll]
   (count-documents coll {}))
  ([coll filter]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.countDocuments db-name coll-name (or filter {})))]
     (if (integer? result) result 0))))

(defn estimated-document-count
  "Get an estimated count of documents in the collection.

   This is faster than count-documents but may not be accurate.

   Returns:
     Estimated number of documents.

   Example:
     (estimated-document-count users)"
  [coll]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)
        result (-> rpc .-mongo (.estimatedDocumentCount db-name coll-name))]
    (if (integer? result) result 0)))

(defn distinct-values
  "Get distinct values for a field.

   Args:
     coll - Collection instance
     key - Field name to get distinct values for
     filter - Query filter map (optional, default: {})

   Returns:
     Vector of distinct values.

   Example:
     (distinct-values users :status)
     (distinct-values orders :category {:customer-id \"123\"})"
  ([coll key]
   (distinct-values coll key {}))
  ([coll key filter]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         result (-> rpc .-mongo (.distinct db-name coll-name (name key) (or filter {})))]
     (if (sequential? result) (vec result) []))))

;; ============================================================================
;; Aggregation
;; ============================================================================

(defn aggregate
  "Run an aggregation pipeline.

   Args:
     coll - Collection instance
     pipeline - Vector of aggregation stages

   Returns:
     Vector of aggregation results.

   Example:
     (aggregate users
       [{:$match {:status \"active\"}}
        {:$group {:_id \"$country\" :count {:$sum 1}}}
        {:$sort {:count -1}}])"
  [coll pipeline]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)
        result (-> rpc .-mongo (.aggregate db-name coll-name pipeline))]
    (if (sequential? result) (vec result) [])))

;; ============================================================================
;; Index Operations
;; ============================================================================

(defn create-index!
  "Create an index on the collection.

   Args:
     coll - Collection instance
     keys - Index keys as either:
            - String for single field ascending: \"name\"
            - Vector of [field direction] pairs: [[\"name\" 1] [\"age\" -1]]
     opts - Optional configuration:
            :unique - Create unique index
            :sparse - Create sparse index
            :name - Index name
            :background - Create in background

   Returns:
     Name of the created index.

   Example:
     (create-index! users \"email\" {:unique true})
     (create-index! users [[\"name\" 1] [\"created-at\" -1]])"
  ([coll keys]
   (create-index! coll keys {}))
  ([coll keys opts]
   (let [rpc (-rpc coll)
         db-name (-db-name coll)
         coll-name (-name coll)
         index-keys (if (string? keys) [[keys 1]] keys)
         result (-> rpc .-mongo (.createIndex db-name coll-name index-keys opts))]
     (if (string? result) result ""))))

(defn drop-index!
  "Drop an index from the collection.

   Args:
     coll - Collection instance
     index-name - Name of the index to drop

   Example:
     (drop-index! users \"email_1\")"
  [coll index-name]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)]
    (-> rpc .-mongo (.dropIndex db-name coll-name index-name))
    nil))

(defn drop!
  "Drop the collection.

   Example:
     (drop! temp-collection)"
  [coll]
  (let [rpc (-rpc coll)
        db-name (-db-name coll)
        coll-name (-name coll)]
    (-> rpc .-mongo (.dropCollection db-name coll-name))
    nil))

;; ============================================================================
;; Convenience Functions
;; ============================================================================

(defn find-by-id
  "Find a document by its _id.

   Args:
     coll - Collection instance
     id - Document _id

   Returns:
     Document map, or nil if not found.

   Example:
     (find-by-id users \"abc123\")"
  [coll id]
  (find-one coll {:_id id}))

(defn delete-by-id!
  "Delete a document by its _id.

   Args:
     coll - Collection instance
     id - Document _id

   Returns:
     DeleteResult map.

   Example:
     (delete-by-id! users \"abc123\")"
  [coll id]
  (delete-one! coll {:_id id}))

(defn update-by-id!
  "Update a document by its _id.

   Args:
     coll - Collection instance
     id - Document _id
     update - Update operations map

   Returns:
     UpdateResult map.

   Example:
     (update-by-id! users \"abc123\" {:$set {:status \"active\"}})"
  [coll id update]
  (update-one! coll {:_id id} update))
