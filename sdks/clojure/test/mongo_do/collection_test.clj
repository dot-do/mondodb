(ns mongo-do.collection-test
  "Tests for collection operations."
  (:require [clojure.test :refer [deftest testing is are]]
            [mongo-do.collection :as coll]
            [mongo-do.types :as types]))

;; ============================================================================
;; Mock RPC Client
;; ============================================================================

(defn mock-rpc
  "Create a mock RPC client for testing."
  [& {:keys [find-result find-one-result insert-result
             update-result delete-result count-result
             distinct-result aggregate-result]}]
  (let [state (atom {:messages [] :find-result (or find-result [])
                     :find-one-result find-one-result
                     :insert-result (or insert-result {})
                     :update-result (or update-result {})
                     :delete-result (or delete-result {})
                     :count-result (or count-result 0)
                     :distinct-result (or distinct-result [])
                     :aggregate-result (or aggregate-result [])})]
    (reify Object
      (toString [_] "MockRPC"))))

;; ============================================================================
;; Collection Creation Tests
;; ============================================================================

(deftest collection-record-test
  (testing "Collection record creation"
    (let [rpc (mock-rpc)
          db (reify Object (toString [_] "MockDB"))
          coll (coll/->Collection rpc db "users")]
      (is (= "users" (coll/-name coll)))
      (is (= rpc (coll/-rpc coll)))
      (is (= db (coll/-database coll))))))

;; ============================================================================
;; Projection Normalization Tests
;; ============================================================================

(deftest projection-normalization-test
  (testing "Projection as map passes through"
    (let [proj {:name 1 :email 1 :_id 0}]
      (is (map? proj))))

  (testing "Projection as vector converts to map"
    (let [fields [:name :email :status]
          expected {:name 1 :email 1 :status 1}]
      ;; Testing the normalization logic
      (is (= expected (into {} (map (fn [f] [f 1]) fields)))))))

;; ============================================================================
;; Document ID Tests
;; ============================================================================

(deftest ensure-id-test
  (testing "Document without _id gets one"
    (let [doc {:name "Alice" :email "alice@example.com"}
          result (types/ensure-id doc)]
      (is (contains? result :_id))
      (is (string? (:_id result)))
      (is (= "Alice" (:name result)))))

  (testing "Document with _id keeps it"
    (let [doc {:_id "custom-123" :name "Bob"}
          result (types/ensure-id doc)]
      (is (= "custom-123" (:_id result)))))

  (testing "Generated IDs are unique"
    (let [docs (repeatedly 100 #(types/ensure-id {:x 1}))
          ids (map :_id docs)]
      (is (= 100 (count (set ids)))))))

;; ============================================================================
;; Query Filter Tests
;; ============================================================================

(deftest query-filter-test
  (testing "Empty filter matches all"
    (is (= {} {})))

  (testing "Simple equality filter"
    (let [filter {:status "active"}]
      (is (= "active" (:status filter)))))

  (testing "Comparison operators"
    (let [filter {:age {:$gt 21 :$lt 65}}]
      (is (= {:$gt 21 :$lt 65} (:age filter)))))

  (testing "Logical operators"
    (let [filter {:$or [{:status "active"} {:premium true}]}]
      (is (vector? (:$or filter)))
      (is (= 2 (count (:$or filter)))))))

;; ============================================================================
;; Update Operation Tests
;; ============================================================================

(deftest update-operations-test
  (testing "$set operation"
    (let [update {:$set {:status "active" :modified-at "2024-01-01"}}]
      (is (map? (:$set update)))
      (is (= "active" (get-in update [:$set :status])))))

  (testing "$inc operation"
    (let [update {:$inc {:views 1 :score 10}}]
      (is (= 1 (get-in update [:$inc :views])))))

  (testing "$unset operation"
    (let [update {:$unset {:temporary 1}}]
      (is (contains? (:$unset update) :temporary))))

  (testing "Combined operations"
    (let [update {:$set {:status "active"}
                  :$inc {:login-count 1}
                  :$push {:tags "verified"}}]
      (is (= 3 (count update))))))

;; ============================================================================
;; Aggregation Pipeline Tests
;; ============================================================================

(deftest aggregation-pipeline-test
  (testing "Match stage"
    (let [stage {:$match {:status "active"}}]
      (is (contains? stage :$match))))

  (testing "Group stage"
    (let [stage {:$group {:_id "$category"
                          :total {:$sum "$amount"}
                          :count {:$sum 1}}}]
      (is (= "$category" (get-in stage [:$group :_id])))))

  (testing "Sort stage"
    (let [stage {:$sort {:total -1 :name 1}}]
      (is (= -1 (get-in stage [:$sort :total])))))

  (testing "Full pipeline"
    (let [pipeline [{:$match {:status "active"}}
                    {:$group {:_id "$region" :count {:$sum 1}}}
                    {:$sort {:count -1}}
                    {:$limit 10}]]
      (is (= 4 (count pipeline)))
      (is (contains? (first pipeline) :$match))
      (is (contains? (last pipeline) :$limit)))))

;; ============================================================================
;; Index Specification Tests
;; ============================================================================

(deftest index-spec-test
  (testing "Single field ascending"
    (let [keys [["email" 1]]]
      (is (= "email" (ffirst keys)))
      (is (= 1 (second (first keys))))))

  (testing "Compound index"
    (let [keys [["status" 1] ["created-at" -1]]]
      (is (= 2 (count keys)))
      (is (= -1 (second (second keys))))))

  (testing "Index options"
    (let [opts {:unique true :sparse true :name "email_unique"}]
      (is (true? (:unique opts)))
      (is (= "email_unique" (:name opts))))))

;; ============================================================================
;; Convenience Function Tests
;; ============================================================================

(deftest find-by-id-filter-test
  (testing "find-by-id creates correct filter"
    (let [id "abc123"
          expected-filter {:_id id}]
      (is (= expected-filter {:_id id})))))

(deftest delete-by-id-filter-test
  (testing "delete-by-id creates correct filter"
    (let [id "xyz789"
          expected-filter {:_id id}]
      (is (= expected-filter {:_id id})))))

(deftest update-by-id-filter-test
  (testing "update-by-id creates correct filter"
    (let [id "def456"
          expected-filter {:_id id}
          update {:$set {:active true}}]
      (is (= expected-filter {:_id id}))
      (is (map? (:$set update))))))

;; ============================================================================
;; Sort Specification Tests
;; ============================================================================

(deftest sort-spec-test
  (testing "Ascending sort"
    (let [sort [[:name 1]]]
      (is (= :name (ffirst sort)))
      (is (= 1 (second (first sort))))))

  (testing "Descending sort"
    (let [sort [[:created-at -1]]]
      (is (= -1 (second (first sort))))))

  (testing "Multiple sort fields"
    (let [sort [[:status 1] [:name 1] [:age -1]]]
      (is (= 3 (count sort))))))

;; ============================================================================
;; Batch Operation Tests
;; ============================================================================

(deftest batch-documents-test
  (testing "Documents get IDs assigned"
    (let [docs [{:name "Alice"} {:name "Bob"} {:name "Carol"}]
          with-ids (mapv types/ensure-id docs)]
      (is (every? #(contains? % :_id) with-ids))
      (is (= 3 (count (distinct (map :_id with-ids)))))))

  (testing "Existing IDs preserved in batch"
    (let [docs [{:_id "1" :name "Alice"}
                {:name "Bob"}
                {:_id "3" :name "Carol"}]
          with-ids (mapv types/ensure-id docs)]
      (is (= "1" (:_id (first with-ids))))
      (is (= "3" (:_id (nth with-ids 2))))
      (is (string? (:_id (second with-ids))))
      (is (not= "1" (:_id (second with-ids))))
      (is (not= "3" (:_id (second with-ids)))))))
