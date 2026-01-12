(ns mongo-do.database
  "MongoDB database operations.

   Provides collection access and database-level operations."
  (:require [mongo-do.types :as types]
            [mongo-do.collection :as collection]))

;; ============================================================================
;; Database Protocol
;; ============================================================================

(defprotocol IDatabase
  "Protocol for MongoDB database operations."
  (-name [this] "Get the database name.")
  (-client [this] "Get the parent client.")
  (-rpc [this] "Get the RPC client.")
  (-list-collection-names [this] "List all collection names.")
  (-list-collections [this] "List all collections with metadata.")
  (-create-collection! [this name opts] "Create a collection.")
  (-drop-collection! [this name] "Drop a collection."))

;; ============================================================================
;; Database Implementation
;; ============================================================================

(defrecord Database [rpc client db-name collections]
  IDatabase
  (-name [_] db-name)

  (-client [_] client)

  (-rpc [_] rpc)

  (-list-collection-names [_]
    (let [result (-> rpc .-mongo (.listCollectionNames db-name))]
      (if (sequential? result) result [])))

  (-list-collections [_]
    (let [result (-> rpc .-mongo (.listCollections db-name))]
      (if (sequential? result) result [])))

  (-create-collection! [_ name opts]
    (-> rpc .-mongo (.createCollection db-name name (or opts {})))
    nil)

  (-drop-collection! [this name]
    (-> rpc .-mongo (.dropCollection db-name name))
    (swap! collections dissoc name)
    nil))

;; ============================================================================
;; Public API
;; ============================================================================

(defn db-name
  "Get the database name."
  [db]
  (-name db))

(defn collection
  "Get a collection by name.

   Args:
     db - Database instance
     name - Collection name

   Returns:
     Collection instance (cached for subsequent calls).

   Example:
     (def users (collection db \"users\"))"
  [db name]
  (let [colls (:collections db)]
    (if-let [coll (get @colls name)]
      coll
      (let [coll (collection/->Collection (-rpc db) db name)]
        (swap! colls assoc name coll)
        coll))))

(defn list-collection-names
  "List all collection names in the database.

   Returns:
     Vector of collection names.

   Example:
     (list-collection-names db) ;=> [\"users\" \"orders\" \"products\"]"
  [db]
  (-list-collection-names db))

(defn list-collections
  "List all collections with metadata.

   Returns:
     Vector of collection info maps.

   Example:
     (list-collections db)"
  [db]
  (-list-collections db))

(defn create-collection!
  "Create a new collection.

   Args:
     db - Database instance
     name - Collection name
     opts - Optional configuration map:
            :capped - Whether the collection is capped
            :size - Maximum size in bytes (for capped collections)
            :max - Maximum number of documents (for capped collections)

   Example:
     (create-collection! db \"logs\" {:capped true :size 1000000})"
  ([db name]
   (create-collection! db name nil))
  ([db name opts]
   (-create-collection! db name opts)))

(defn drop-collection!
  "Drop a collection.

   Args:
     db - Database instance
     name - Collection name

   Example:
     (drop-collection! db \"temp-data\")"
  [db name]
  (-drop-collection! db name))
