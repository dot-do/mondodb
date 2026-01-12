(ns mongo-do.client
  "MongoDB client for .do services.

   Provides connection management and database access.

   Example:
     (def client (connect \"https://mongo.do\"))
     (def db (database client \"myapp\"))
     (close! client)"
  (:require [mongo-do.types :as types]
            [mongo-do.database :as database]
            [clojure.core.async :as async]))

;; ============================================================================
;; Client Protocol
;; ============================================================================

(defprotocol IMongoClient
  "Protocol for MongoDB client operations."
  (-connected? [this] "Check if client is connected.")
  (-close! [this] "Close the client connection.")
  (-rpc [this] "Get the underlying RPC client.")
  (-list-database-names [this] "List all database names.")
  (-list-databases [this] "List all databases with metadata.")
  (-drop-database! [this name] "Drop a database.")
  (-server-info [this] "Get server information."))

;; ============================================================================
;; Client Implementation
;; ============================================================================

(defrecord MongoClient [uri rpc-client connected databases options]
  IMongoClient
  (-connected? [_]
    @connected)

  (-close! [this]
    (when @connected
      (reset! connected false)
      (reset! databases {})
      ;; Close RPC client if available
      (when-let [rpc @rpc-client]
        (try
          (.close rpc)
          (catch Exception _))))
    nil)

  (-rpc [_]
    (when-not @connected
      (throw (types/connection-error "Client is not connected. Call connect first.")))
    @rpc-client)

  (-list-database-names [this]
    (let [rpc (-rpc this)
          result (-> rpc .-mongo (.listDatabaseNames))]
      (if (sequential? result) result [])))

  (-list-databases [this]
    (let [rpc (-rpc this)
          result (-> rpc .-mongo (.listDatabases))]
      (if (sequential? result) result [])))

  (-drop-database! [this name]
    (let [rpc (-rpc this)]
      (-> rpc .-mongo (.dropDatabase name))
      (swap! databases dissoc name)
      nil))

  (-server-info [this]
    (let [rpc (-rpc this)
          result (-> rpc .-mongo (.serverInfo))]
      (if (map? result) result {}))))

;; ============================================================================
;; Public API
;; ============================================================================

(defn connect
  "Connect to a MongoDB service.

   Args:
     uri - Connection URI (e.g., \"https://mongo.do\")
           If not provided, uses MONGO_URL environment variable.
     opts - Optional configuration map:
            :timeout - Request timeout in milliseconds (default: 30000)
            :retries - Number of retries (default: 3)

   Returns:
     Connected MongoClient instance.

   Example:
     (def client (connect \"https://mongo.do\"))
     (def client (connect \"https://mongo.do\" {:timeout 60000}))"
  ([]
   (connect (or (System/getenv "MONGO_URL") "https://mongo.do")))
  ([uri]
   (connect uri {}))
  ([uri opts]
   (let [client (->MongoClient uri
                               (atom nil)
                               (atom false)
                               (atom {})
                               opts)]
     ;; Connect via RPC
     (try
       ;; In real implementation, would use rpc-do library:
       ;; (require '[rpc-do.core :as rpc])
       ;; (reset! (:rpc-client client) (rpc/connect uri opts))
       (reset! (:connected client) true)
       client
       (catch Exception e
         (throw (types/connection-error
                 (str "Failed to connect to " uri ": " (.getMessage e)))))))))

(defn close!
  "Close the client connection.

   Example:
     (close! client)"
  [client]
  (-close! client))

(defn connected?
  "Check if the client is connected.

   Example:
     (when (connected? client)
       (do-something))"
  [client]
  (-connected? client))

(defn database
  "Get a database by name.

   Args:
     client - MongoClient instance
     name - Database name

   Returns:
     Database instance (cached for subsequent calls).

   Example:
     (def db (database client \"myapp\"))"
  [client name]
  (when-not (-connected? client)
    (throw (types/connection-error "Client is not connected.")))
  (let [databases (:databases client)]
    (if-let [db (get @databases name)]
      db
      (let [db (database/->Database (-rpc client) client name (atom {}))]
        (swap! databases assoc name db)
        db))))

(defn list-database-names
  "List all database names.

   Returns:
     Vector of database names.

   Example:
     (list-database-names client) ;=> [\"admin\" \"myapp\" \"test\"]"
  [client]
  (-list-database-names client))

(defn list-databases
  "List all databases with metadata.

   Returns:
     Vector of database info maps with keys:
       :name - Database name
       :sizeOnDisk - Size in bytes
       :empty - Whether the database is empty

   Example:
     (list-databases client)
     ;=> [{:name \"myapp\" :sizeOnDisk 4096 :empty false}]"
  [client]
  (-list-databases client))

(defn drop-database!
  "Drop a database.

   Args:
     client - MongoClient instance
     name - Name of the database to drop

   Example:
     (drop-database! client \"test-db\")"
  [client name]
  (-drop-database! client name))

(defn server-info
  "Get server information.

   Returns:
     Map with server info.

   Example:
     (server-info client)
     ;=> {:version \"7.0\" :platform \"...\"}"
  [client]
  (-server-info client))

;; ============================================================================
;; with-client Macro
;; ============================================================================

(defmacro with-client
  "Execute body with a connected client, ensuring cleanup.

   Example:
     (with-client [client \"https://mongo.do\"]
       (let [db (database client \"myapp\")]
         (println (list-collection-names db))))"
  [[binding uri & opts] & body]
  `(let [~binding (connect ~uri ~@opts)]
     (try
       ~@body
       (finally
         (close! ~binding)))))
