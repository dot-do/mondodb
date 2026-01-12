(ns mongo-do.core-test
  "Tests for mongo-do core functionality."
  (:require [clojure.test :refer [deftest testing is are use-fixtures]]
            [mongo-do.core :as mongo]
            [mongo-do.types :as types]))

;; ============================================================================
;; Test Fixtures
;; ============================================================================

(def ^:dynamic *client* nil)
(def ^:dynamic *db* nil)
(def ^:dynamic *coll* nil)

(defn with-test-client [f]
  (binding [*client* (mongo/connect "https://test.mongo.do")]
    (try
      (f)
      (finally
        (mongo/close! *client*)))))

(defn with-test-db [f]
  (binding [*db* (mongo/database *client* (str "test-" (System/currentTimeMillis)))]
    (try
      (f)
      (finally
        ;; Cleanup would happen here in real tests
        ))))

(defn with-test-collection [f]
  (binding [*coll* (mongo/collection *db* "test-collection")]
    (f)))

;; ============================================================================
;; Type Tests
;; ============================================================================

(deftest insert-one-result-test
  (testing "InsertOneResult creation"
    (let [result (types/insert-one-result "abc123")]
      (is (= "abc123" (:inserted-id result)))
      (is (true? (:acknowledged result))))

    (let [result (types/insert-one-result "xyz" :acknowledged false)]
      (is (= "xyz" (:inserted-id result)))
      (is (false? (:acknowledged result))))))

(deftest insert-many-result-test
  (testing "InsertManyResult creation"
    (let [result (types/insert-many-result ["id1" "id2" "id3"])]
      (is (= ["id1" "id2" "id3"] (:inserted-ids result)))
      (is (true? (:acknowledged result))))))

(deftest update-result-test
  (testing "UpdateResult creation"
    (let [result (types/update-result :matched-count 5
                                      :modified-count 3
                                      :upserted-id "new-id")]
      (is (= 5 (:matched-count result)))
      (is (= 3 (:modified-count result)))
      (is (= "new-id" (:upserted-id result)))
      (is (true? (:acknowledged result))))

    (let [result (types/update-result)]
      (is (= 0 (:matched-count result)))
      (is (= 0 (:modified-count result)))
      (is (nil? (:upserted-id result))))))

(deftest delete-result-test
  (testing "DeleteResult creation"
    (let [result (types/delete-result :deleted-count 10)]
      (is (= 10 (:deleted-count result)))
      (is (true? (:acknowledged result))))))

;; ============================================================================
;; Error Tests
;; ============================================================================

(deftest error-creation-test
  (testing "MongoDB error creation"
    (let [err (types/mongo-error "Test error" :query :code "ERR001")]
      (is (instance? clojure.lang.ExceptionInfo err))
      (is (= "Test error" (.getMessage err)))
      (is (= :query (:type (ex-data err))))
      (is (= "ERR001" (:code (ex-data err))))))

  (testing "Connection error"
    (let [err (types/connection-error "Connection failed")]
      (is (types/connection-error? err))
      (is (not (types/query-error? err)))))

  (testing "Query error with suggestion"
    (let [err (types/query-error "Invalid field" :suggestion "Did you mean 'name'?")]
      (is (types/query-error? err))
      (is (= "Did you mean 'name'?" (:suggestion (ex-data err))))))

  (testing "Duplicate key error"
    (let [err (types/duplicate-key-error "E11000 duplicate key")]
      (is (types/duplicate-key-error? err))
      (is (types/write-error? err))
      (is (= 11000 (:code (ex-data err)))))))

;; ============================================================================
;; ID Generation Tests
;; ============================================================================

(deftest id-generation-test
  (testing "ID generation produces unique values"
    (let [ids (repeatedly 100 types/generate-id)]
      (is (= 100 (count (set ids))))))

  (testing "ensure-id adds _id if missing"
    (let [doc {:name "Alice"}
          result (types/ensure-id doc)]
      (is (contains? result :_id))
      (is (string? (:_id result)))
      (is (= "Alice" (:name result)))))

  (testing "ensure-id preserves existing _id"
    (let [doc {:_id "custom-id" :name "Bob"}
          result (types/ensure-id doc)]
      (is (= "custom-id" (:_id result))))))

;; ============================================================================
;; Result Parsing Tests
;; ============================================================================

(deftest parse-insert-one-result-test
  (testing "Successful insert parsing"
    (let [result (types/parse-insert-one-result
                   {:insertedId "abc" :acknowledged true}
                   "fallback-id")]
      (is (= "abc" (:inserted-id result)))
      (is (true? (:acknowledged result)))))

  (testing "Fallback to provided ID"
    (let [result (types/parse-insert-one-result {} "fallback-id")]
      (is (= "fallback-id" (:inserted-id result)))))

  (testing "Duplicate key error parsing"
    (is (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"duplicate"
          (types/parse-insert-one-result
            {:error true :message "E11000 duplicate key error"}
            "id")))))

(deftest parse-update-result-test
  (testing "Update result parsing"
    (let [result (types/parse-update-result
                   {:matchedCount 5 :modifiedCount 3})]
      (is (= 5 (:matched-count result)))
      (is (= 3 (:modified-count result)))))

  (testing "Update error parsing"
    (is (thrown?
          clojure.lang.ExceptionInfo
          (types/parse-update-result {:error true :message "Update failed"})))))

(deftest parse-delete-result-test
  (testing "Delete result parsing"
    (let [result (types/parse-delete-result {:deletedCount 7})]
      (is (= 7 (:deleted-count result))))))

;; ============================================================================
;; Integration Test Examples (Mock-based)
;; ============================================================================

(deftest collection-operations-test
  (testing "Collection operations return expected types"
    ;; These would use mocks in real tests
    (let [insert-result (types/insert-one-result "new-id")]
      (is (map? insert-result))
      (is (contains? insert-result :inserted-id)))

    (let [update-result (types/update-result :matched-count 1 :modified-count 1)]
      (is (map? update-result))
      (is (= 1 (:matched-count update-result))))

    (let [delete-result (types/delete-result :deleted-count 1)]
      (is (map? delete-result))
      (is (= 1 (:deleted-count delete-result))))))

;; ============================================================================
;; Transducer Compatibility Tests
;; ============================================================================

(deftest transducer-test
  (testing "Results work with transducers"
    (let [docs [{:_id "1" :name "Alice" :age 30}
                {:_id "2" :name "Bob" :age 25}
                {:_id "3" :name "Carol" :age 35}]
          xf (comp (filter #(> (:age %) 25))
                   (map :name))]
      (is (= ["Alice" "Carol"]
             (into [] xf docs))))))

;; ============================================================================
;; Error Predicate Tests
;; ============================================================================

(deftest error-predicate-test
  (testing "Error predicates"
    (let [conn-err (types/connection-error "test")
          query-err (types/query-error "test")
          write-err (types/write-error "test")
          dup-err (types/duplicate-key-error "test")
          other-err (Exception. "other")]

      (is (types/mongo-error? conn-err))
      (is (types/mongo-error? query-err))
      (is (types/mongo-error? write-err))
      (is (types/mongo-error? dup-err))
      (is (not (types/mongo-error? other-err)))

      (is (types/connection-error? conn-err))
      (is (not (types/connection-error? query-err)))

      (is (types/write-error? write-err))
      (is (types/write-error? dup-err))
      (is (not (types/write-error? query-err))))))
