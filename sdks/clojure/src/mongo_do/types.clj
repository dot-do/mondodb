(ns mongo-do.types
  "Type definitions and error handling for mongo-do SDK.

   All operations return plain Clojure maps for results.
   Errors are represented as ex-info exceptions with data maps."
  (:require [clojure.string :as str]))

;; ============================================================================
;; Result Types (as maps)
;; ============================================================================

(defn insert-one-result
  "Create an InsertOneResult map.

   Keys:
     :inserted-id - The _id of the inserted document
     :acknowledged - Whether the write was acknowledged (default true)"
  [inserted-id & {:keys [acknowledged] :or {acknowledged true}}]
  {:inserted-id inserted-id
   :acknowledged acknowledged})

(defn insert-many-result
  "Create an InsertManyResult map.

   Keys:
     :inserted-ids - Vector of _ids of the inserted documents
     :acknowledged - Whether the write was acknowledged (default true)"
  [inserted-ids & {:keys [acknowledged] :or {acknowledged true}}]
  {:inserted-ids (vec inserted-ids)
   :acknowledged acknowledged})

(defn update-result
  "Create an UpdateResult map.

   Keys:
     :matched-count - Number of documents matched
     :modified-count - Number of documents modified
     :upserted-id - The _id of the upserted document (if any)
     :acknowledged - Whether the write was acknowledged (default true)"
  [& {:keys [matched-count modified-count upserted-id acknowledged]
      :or {matched-count 0 modified-count 0 acknowledged true}}]
  {:matched-count matched-count
   :modified-count modified-count
   :upserted-id upserted-id
   :acknowledged acknowledged})

(defn delete-result
  "Create a DeleteResult map.

   Keys:
     :deleted-count - Number of documents deleted
     :acknowledged - Whether the write was acknowledged (default true)"
  [& {:keys [deleted-count acknowledged]
      :or {deleted-count 0 acknowledged true}}]
  {:deleted-count deleted-count
   :acknowledged acknowledged})

(defn bulk-write-result
  "Create a BulkWriteResult map.

   Keys:
     :inserted-count - Number of documents inserted
     :matched-count - Number of documents matched for update
     :modified-count - Number of documents modified
     :deleted-count - Number of documents deleted
     :upserted-count - Number of documents upserted
     :upserted-ids - Map of operation index to upserted _id
     :acknowledged - Whether the write was acknowledged (default true)"
  [& {:keys [inserted-count matched-count modified-count
             deleted-count upserted-count upserted-ids acknowledged]
      :or {inserted-count 0 matched-count 0 modified-count 0
           deleted-count 0 upserted-count 0 upserted-ids {} acknowledged true}}]
  {:inserted-count inserted-count
   :matched-count matched-count
   :modified-count modified-count
   :deleted-count deleted-count
   :upserted-count upserted-count
   :upserted-ids upserted-ids
   :acknowledged acknowledged})

;; ============================================================================
;; Error Types
;; ============================================================================

(defn mongo-error
  "Create a MongoDB error as ExceptionInfo.

   Args:
     message - Error message
     type - Error type keyword (:connection, :query, :write, :duplicate-key, :operation)
     code - Optional error code"
  [message type & {:keys [code suggestion]}]
  (ex-info message
           (cond-> {:type type}
             code (assoc :code code)
             suggestion (assoc :suggestion suggestion))))

(defn connection-error
  "Create a connection error."
  [message]
  (mongo-error message :connection))

(defn query-error
  "Create a query error."
  [message & {:keys [code suggestion]}]
  (mongo-error message :query :code code :suggestion suggestion))

(defn write-error
  "Create a write error."
  [message & {:keys [code]}]
  (mongo-error message :write :code code))

(defn duplicate-key-error
  "Create a duplicate key error."
  [message]
  (mongo-error message :duplicate-key :code 11000))

(defn operation-error
  "Create an operation failure error."
  [message & {:keys [code]}]
  (mongo-error message :operation :code code))

;; ============================================================================
;; Error Predicates
;; ============================================================================

(defn mongo-error?
  "Check if an exception is a MongoDB error."
  [e]
  (and (instance? clojure.lang.ExceptionInfo e)
       (contains? (ex-data e) :type)))

(defn connection-error?
  "Check if an exception is a connection error."
  [e]
  (and (mongo-error? e)
       (= :connection (:type (ex-data e)))))

(defn query-error?
  "Check if an exception is a query error."
  [e]
  (and (mongo-error? e)
       (= :query (:type (ex-data e)))))

(defn write-error?
  "Check if an exception is a write error."
  [e]
  (and (mongo-error? e)
       (#{:write :duplicate-key} (:type (ex-data e)))))

(defn duplicate-key-error?
  "Check if an exception is a duplicate key error."
  [e]
  (and (mongo-error? e)
       (= :duplicate-key (:type (ex-data e)))))

;; ============================================================================
;; Result Parsing
;; ============================================================================

(defn parse-insert-one-result
  "Parse an InsertOneResult from RPC response."
  [result doc-id]
  (if (and (map? result) (:error result))
    (let [msg (or (:message result) "Insert failed")]
      (if (or (str/includes? (str/lower-case msg) "duplicate")
              (str/includes? msg "E11000"))
        (throw (duplicate-key-error msg))
        (throw (write-error msg))))
    (insert-one-result (or (:insertedId result) doc-id)
                       :acknowledged (get result :acknowledged true))))

(defn parse-insert-many-result
  "Parse an InsertManyResult from RPC response."
  [result doc-ids]
  (if (and (map? result) (:error result))
    (throw (write-error (or (:message result) "Insert failed")))
    (insert-many-result (or (:insertedIds result) doc-ids)
                        :acknowledged (get result :acknowledged true))))

(defn parse-update-result
  "Parse an UpdateResult from RPC response."
  [result]
  (if (and (map? result) (:error result))
    (throw (write-error (or (:message result) "Update failed")))
    (update-result :matched-count (get result :matchedCount 0)
                   :modified-count (get result :modifiedCount 0)
                   :upserted-id (:upsertedId result)
                   :acknowledged (get result :acknowledged true))))

(defn parse-delete-result
  "Parse a DeleteResult from RPC response."
  [result]
  (if (and (map? result) (:error result))
    (throw (write-error (or (:message result) "Delete failed")))
    (delete-result :deleted-count (get result :deletedCount 0)
                   :acknowledged (get result :acknowledged true))))

;; ============================================================================
;; ID Generation
;; ============================================================================

(defn generate-id
  "Generate a unique document ID."
  []
  (str (java.util.UUID/randomUUID)))

(defn ensure-id
  "Ensure a document has an _id field."
  [doc]
  (if (contains? doc :_id)
    doc
    (assoc doc :_id (generate-id))))
