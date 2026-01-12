(ns mongo-do.cursor
  "Cursor implementation for lazy sequence iteration over MongoDB results.

   Provides lazy sequences for memory-efficient processing of large result sets.")

;; ============================================================================
;; Cursor State
;; ============================================================================

(defn- fetch-batch
  "Fetch a batch of documents from the server."
  [rpc db-name coll-name filter opts cursor-id batch-size]
  (let [query-opts (cond-> (or opts {})
                     cursor-id (assoc :cursor-id cursor-id)
                     batch-size (assoc :batch-size batch-size))
        result (-> rpc .-mongo (.find db-name coll-name filter query-opts))]
    (if (map? result)
      ;; Cursor-based result
      {:documents (get result :documents [])
       :cursor-id (get result :cursor-id)
       :has-more (get result :has-more false)}
      ;; Simple array result
      {:documents (if (sequential? result) (vec result) [])
       :cursor-id nil
       :has-more false})))

;; ============================================================================
;; Lazy Sequence Implementation
;; ============================================================================

(defn ->lazy-seq
  "Create a lazy sequence of documents from a MongoDB query.

   The sequence fetches documents in batches for efficiency.

   Args:
     rpc - RPC client
     db-name - Database name
     coll-name - Collection name
     filter - Query filter map
     opts - Query options (projection, sort, limit, etc.)

   Returns:
     Lazy sequence of document maps."
  [rpc db-name coll-name filter opts]
  (let [batch-size (get opts :batch-size 100)
        limit (get opts :limit)
        seen (atom 0)]
    (letfn [(fetch-next [cursor-id]
              (lazy-seq
                (when (or (nil? limit) (< @seen limit))
                  (let [{:keys [documents cursor-id has-more]}
                        (fetch-batch rpc db-name coll-name filter opts cursor-id batch-size)
                        remaining (if limit
                                    (min (count documents) (- limit @seen))
                                    (count documents))
                        docs (take remaining documents)]
                    (swap! seen + (count docs))
                    (if (seq docs)
                      (concat docs
                              (when (and has-more
                                         (or (nil? limit) (< @seen limit)))
                                (fetch-next cursor-id)))
                      nil)))))]
      (fetch-next nil))))

;; ============================================================================
;; Cursor Object (for explicit control)
;; ============================================================================

(defprotocol ICursor
  "Protocol for cursor operations."
  (-has-next? [this] "Check if there are more documents.")
  (-next [this] "Get the next document.")
  (-close! [this] "Close the cursor.")
  (-to-seq [this] "Convert to lazy sequence.")
  (-to-vec [this] "Fetch all remaining documents as a vector."))

(defrecord Cursor [rpc db-name coll-name filter opts
                   ^:volatile-mutable documents
                   ^:volatile-mutable cursor-id
                   ^:volatile-mutable has-more
                   ^:volatile-mutable closed]
  ICursor
  (-has-next? [this]
    (cond
      closed false
      (seq documents) true
      (not has-more) false
      :else (do
              ;; Fetch next batch
              (let [batch (fetch-batch rpc db-name coll-name filter opts cursor-id
                                       (get opts :batch-size 100))]
                (set! documents (:documents batch))
                (set! cursor-id (:cursor-id batch))
                (set! has-more (:has-more batch))
                (seq documents)))))

  (-next [this]
    (when (-has-next? this)
      (let [doc (first documents)]
        (set! documents (rest documents))
        doc)))

  (-close! [this]
    (set! closed true)
    (set! documents nil)
    nil)

  (-to-seq [this]
    (lazy-seq
      (when (-has-next? this)
        (cons (-next this) (-to-seq this)))))

  (-to-vec [this]
    (loop [result []]
      (if (-has-next? this)
        (recur (conj result (-next this)))
        result))))

(defn cursor
  "Create a cursor for iterating over query results.

   The cursor provides explicit control over iteration and cleanup.

   Args:
     rpc - RPC client
     db-name - Database name
     coll-name - Collection name
     filter - Query filter map
     opts - Query options

   Returns:
     Cursor instance.

   Example:
     (let [c (cursor rpc \"mydb\" \"users\" {:status \"active\"} nil)]
       (try
         (while (has-next? c)
           (println (next! c)))
         (finally
           (close! c))))"
  [rpc db-name coll-name filter opts]
  (->Cursor rpc db-name coll-name filter opts
            nil nil true false))

(defn has-next?
  "Check if the cursor has more documents."
  [cursor]
  (-has-next? cursor))

(defn next!
  "Get the next document from the cursor."
  [cursor]
  (-next cursor))

(defn close!
  "Close the cursor and release resources."
  [cursor]
  (-close! cursor))

(defn to-seq
  "Convert cursor to lazy sequence."
  [cursor]
  (-to-seq cursor))

(defn to-vec
  "Fetch all remaining documents as a vector."
  [cursor]
  (-to-vec cursor))

;; ============================================================================
;; with-cursor Macro
;; ============================================================================

(defmacro with-cursor
  "Execute body with a cursor, ensuring cleanup.

   Example:
     (with-cursor [c (cursor rpc db coll filter opts)]
       (doseq [doc (to-seq c)]
         (println doc)))"
  [[binding cursor-expr] & body]
  `(let [~binding ~cursor-expr]
     (try
       ~@body
       (finally
         (close! ~binding)))))
