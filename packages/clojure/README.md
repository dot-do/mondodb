# com.dotdo/mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```clojure
(ns myapp.core
  (:require [dotdo.mongo :refer [mongo]]))

(def users (mongo "users who haven't logged in this month"))
(def vips (mongo "customers with orders over $1000"))
```

One require. Natural language queries. Zero infrastructure.

---

## Why com.dotdo/mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **monger/congomongo compatible** - Drop-in replacement for popular MongoDB Clojure libraries
- **Clojure-native** - Lazy sequences, transducers, and core.async support
- **Promise pipelining** - Chain operations with single round trip via RPC
- **REPL-friendly** - Explore your data interactively

```clojure
;; Three dependent operations, ONE network round trip:
(def result
  (->> (mongo "customers in Texas")
       (remap #(mongo (str "orders for " %)))
       (remap #(mongo (str "total revenue from " %)))))
```

---

## Installation

### Leiningen/Boot

```clojure
[com.dotdo/mongo "0.1.0"]
```

### deps.edn

```clojure
com.dotdo/mongo {:mvn/version "0.1.0"}
```

Requires Clojure 1.11+ and JVM 17+.

---

## Quick Start

### Natural Language API

```clojure
(ns myapp.core
  (:require [dotdo.mongo :refer [mongo remap]]))

;; Query in plain English
(def inactive (mongo "users who haven't logged in this month"))
(def vips (mongo "customers with orders over $1000"))
(def trending (mongo "most popular products this week"))

;; Chain with threading macros
(def result
  (->> (mongo "users in Austin")
       (remap #(mongo (str "recent orders for " %)))
       (remap #(mongo (str "shipping status for " %)))))

;; Search semantically
(def tutorials
  (-> (mongo "tutorials similar to machine learning")
      (limit 10)))
```

### MongoDB Compatible API

```clojure
(ns myapp.core
  (:require [dotdo.mongo.client :as mc]
            [dotdo.mongo.collection :as coll]))

(def client (mc/connect "https://your-worker.workers.dev"))
(def db (mc/get-db client "myapp"))
(def users (mc/get-collection db "users"))

;; Standard MongoDB operations
(coll/insert-one users {:name "Alice" :email "alice@example.com"})

(def user (coll/find-one users {:email "alice@example.com"}))
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```clojure
;; CRUD Operations
(def alice (mongo "user alice@example.com"))
(def active (mongo "active users in Austin"))
(def vips (mongo "users with 10+ orders"))

;; AI infers what you need
(mongo "alice@example.com")              ; returns user
(mongo "orders for alice@example.com")   ; returns orders
(mongo "alice order history")            ; returns full timeline

;; Aggregation
(def revenue (mongo "revenue by category this month"))
(def growth (mongo "user growth rate last 6 months"))
(def top (mongo "top 10 customers by lifetime value"))
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```clojure
;; Build the pipeline - nothing sent yet
(def users (mongo "active users"))
(def orders (remap users #(mongo (str "pending orders for " (:id %)))))
(def totals (remap orders :total))

;; NOW we send everything - one round trip
(def result @totals)

;; Parallel fan-out with core.async
(require '[clojure.core.async :as async])

(let [users-ch (async/thread (mongo "active users"))
      orders-ch (async/thread (mongo "pending orders"))
      products-ch (async/thread (mongo "low stock products"))]
  (let [users (async/<!! users-ch)
        orders (async/<!! orders-ch)
        products (async/<!! products-ch)]
    {:users users :orders orders :products products}))
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```clojure
;; Semantic search in plain English
(def similar (-> (mongo "tutorials similar to machine learning") (limit 10)))
(def related (mongo "products like this hiking backpack"))
(def answers (mongo "documents about serverless architecture"))

;; Embeddings are automatic
(mongo "index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```clojure
(def results (-> (mongo "serverless database in title and content") highlight))
(def fuzzy (-> (mongo "find articles matching \"kubernets\"") fuzzy))
(def scored (mongo "search \"edge computing\" with relevance scores"))
```

---

## Real-Time Changes

Watch for database changes with lazy sequences or core.async:

```clojure
;; With lazy sequences
(doseq [change (mongo "watch orders for changes")]
  (case (:operation-type change)
    "insert" (notify (-> change :full-document :customer))
    "update" (update-dashboard (:full-document change))
    nil))

;; With core.async
(let [ch (watch-chan (mongo "watch orders for changes"))]
  (async/go-loop []
    (when-let [change (async/<! ch)]
      (case (:operation-type change)
        "insert" (notify (-> change :full-document :customer))
        "update" (update-dashboard (:full-document change)))
      (recur))))

;; Or query changes directly
(def recent (mongo "changes to products in last hour"))
```

---

## Transactions

Atomic operations with natural language:

```clojure
(-> (mongo "
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer")
    atomic)

;; Or chain with transactions
(with-transaction [tx]
  (-> (query tx "alice account") (debit 100))
  (-> (query tx "bob account") (credit 100)))
```

---

## Type-Safe Documents

Use specs or malli for schema validation:

```clojure
(require '[clojure.spec.alpha :as s])

(s/def ::id string?)
(s/def ::name string?)
(s/def ::email string?)
(s/def ::created-at inst?)
(s/def ::user (s/keys :req-un [::id ::name ::email ::created-at]))

(def client (mc/connect "https://db.example.com"))
(def db (mc/get-db client "myapp"))
(def users (mc/get-collection db "users" {:spec ::user}))

;; Validated operations
(def user (coll/find-one users {:email "alice@example.com"}))
;; user conforms to ::user spec

(coll/insert-one users
  {:id (str (java.util.UUID/randomUUID))
   :name "Bob"
   :email "bob@example.com"
   :created-at (java.time.Instant/now)})
```

---

## Transducers

```clojure
;; Use transducers for efficient processing
(def xf
  (comp
    (filter #(= (:status %) "active"))
    (map :email)
    (take 100)))

(into [] xf (mongo "all users"))

;; With server-side processing
(def emails
  (->> (mongo "active users")
       (remap :email)
       (remap-take 100)))
```

---

## Error Handling

```clojure
(require '[dotdo.mongo :refer [mongo]]
         '[dotdo.mongo.error :as err])

(try
  (mongo "complex query here")
  (catch clojure.lang.ExceptionInfo e
    (let [data (ex-data e)]
      (case (:type data)
        :query-error
        (do
          (println "Query failed:" (:message data))
          (when-let [suggestion (:suggestion data)]
            (println "Suggestion:" suggestion)))

        :connection-error
        (println "Connection lost:" (:message data))

        (throw e)))))

;; Or with error monad
(require '[cats.monad.either :as either])

(either/branch
  (mongo-try "complex query here")
  (fn [error] (println "Error:" error))
  (fn [result] (println "Success:" result)))
```

---

## Configuration

```clojure
(require '[dotdo.mongo :as mongo])

(mongo/configure!
  {:name "my-database"
   :domain "db.myapp.com"
   :vector true           ; Vector search with Vectorize
   :fulltext true         ; FTS5 text search
   :analytics true        ; OLAP with ClickHouse
   :storage {:hot "sqlite"    ; Recent data, fast queries
             :warm "r2"       ; Historical data
             :cold "archive"}}); Long-term retention
```

---

## API Reference

### Core Functions

```clojure
;; Execute a natural language query
(mongo query) ; => MongoQuery

;; Remote map operation (server-side)
(remap coll f) ; => MongoQuery

;; Limit results
(limit query n) ; => MongoQuery

;; Skip results
(skip query n) ; => MongoQuery

;; Sort results
(sort query field direction) ; => MongoQuery

;; Enable highlighting
(highlight query) ; => MongoQuery

;; Enable fuzzy matching
(fuzzy query) ; => MongoQuery

;; Execute atomically
(atomic query) ; => MongoQuery

;; Dereference to get result
@query ; => result
```

### Client

```clojure
(require '[dotdo.mongo.client :as mc])

;; Connect to server
(mc/connect uri) ; => Client

;; Get database
(mc/get-db client name) ; => Database

;; Get collection
(mc/get-collection db name) ; => Collection
(mc/get-collection db name {:spec spec}) ; => Collection with validation

;; Close client
(mc/close client) ; => nil
```

### Collection

```clojure
(require '[dotdo.mongo.collection :as coll])

;; Find documents
(coll/find coll filter) ; => seq of maps
(coll/find-one coll filter) ; => map or nil

;; Insert documents
(coll/insert-one coll doc) ; => InsertOneResult
(coll/insert-many coll docs) ; => InsertManyResult

;; Update documents
(coll/update-one coll filter update) ; => UpdateResult
(coll/update-many coll filter update) ; => UpdateResult

;; Delete documents
(coll/delete-one coll filter) ; => DeleteResult
(coll/delete-many coll filter) ; => DeleteResult

;; Aggregation
(coll/aggregate coll pipeline) ; => seq of maps
```

---

## Complete Example

```clojure
(ns myapp.core
  (:require [dotdo.mongo :refer [mongo remap limit]]
            [dotdo.mongo.client :as mc]
            [dotdo.mongo.collection :as coll]))

(defn -main []
  ;; Natural language queries
  (println "=== Natural Language API ===")

  (let [inactive (mongo "users who haven't logged in this month")]
    (println "Found" (count @inactive) "inactive users"))

  (let [revenue (mongo "total revenue by category this quarter")]
    (println "Revenue by category:" @revenue))

  ;; MongoDB compatible API
  (println "\n=== MongoDB Compatible API ===")

  (let [client (mc/connect "https://db.example.com")
        db (mc/get-db client "myapp")
        users (mc/get-collection db "users")]

    (try
      ;; Insert
      (coll/insert-one users
        {:name "Alice"
         :email "alice@example.com"
         :created-at (java.time.Instant/now)})

      ;; Query
      (if-let [alice (coll/find-one users {:email "alice@example.com"})]
        (println "Found user:" (:name alice))
        (println "User not found"))

      ;; Aggregation
      (let [stats (coll/aggregate users
                    [{"$group" {"_id" nil "total" {"$sum" 1}}}])]
        (println "Total users:" (-> stats first :total)))

      (finally
        (mc/close client))))

  ;; Pipelining
  (println "\n=== Promise Pipelining ===")

  (let [result (->> (mongo "active customers")
                    (remap #(mongo (str "orders for " %)))
                    (remap #(mongo (str "calculate total from " %)))
                    deref)]
    (println "Totals:" result)))
```

---

## License

MIT
