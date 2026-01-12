(ns mongo-do.core
  "MongoDB SDK for Clojure - Data-oriented API with maps.

   Provides idiomatic Clojure access to MongoDB via RPC with:
   - Pure data structures (maps, vectors)
   - Lazy sequences for cursors
   - Transducer support
   - core.async integration

   Example:
     (require '[mongo-do.core :as mongo])

     (def client (mongo/connect \"https://mongo.do\"))
     (def db (mongo/database client \"myapp\"))
     (def users (mongo/collection db \"users\"))

     ;; Insert
     (mongo/insert-one! users {:name \"Alice\" :email \"alice@example.com\"})

     ;; Find
     (mongo/find-one users {:email \"alice@example.com\"})

     ;; Query with lazy sequence
     (doseq [user (mongo/find users {:status \"active\"})]
       (println user))

     (mongo/close! client)"
  (:require [mongo-do.client :as client]
            [mongo-do.database :as database]
            [mongo-do.collection :as collection]
            [mongo-do.types :as types]))

;; Re-export core functions for convenience

;; Client functions
(def connect client/connect)
(def close! client/close!)
(def connected? client/connected?)
(def list-database-names client/list-database-names)
(def list-databases client/list-databases)
(def drop-database! client/drop-database!)
(def server-info client/server-info)

;; Database functions
(def database client/database)
(def list-collection-names database/list-collection-names)
(def list-collections database/list-collections)
(def create-collection! database/create-collection!)
(def drop-collection! database/drop-collection!)

;; Collection functions
(def collection database/collection)
(def insert-one! collection/insert-one!)
(def insert-many! collection/insert-many!)
(def find-one collection/find-one)
(def find collection/find)
(def find-seq collection/find-seq)
(def update-one! collection/update-one!)
(def update-many! collection/update-many!)
(def replace-one! collection/replace-one!)
(def delete-one! collection/delete-one!)
(def delete-many! collection/delete-many!)
(def count-documents collection/count-documents)
(def distinct-values collection/distinct-values)
(def aggregate collection/aggregate)
(def create-index! collection/create-index!)
(def drop-index! collection/drop-index!)
(def drop! collection/drop!)

;; Error types
(def mongo-error? types/mongo-error?)
(def connection-error? types/connection-error?)
(def query-error? types/query-error?)
(def write-error? types/write-error?)
(def duplicate-key-error? types/duplicate-key-error?)
