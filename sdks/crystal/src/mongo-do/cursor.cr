module Mongo
  # Cursor for iterating over query results
  class Cursor(T)
    @documents : Array(T)
    @position : Int32 = 0
    @exhausted : Bool = false
    @batch_size : Int32
    @cursor_id : String?
    @client : Client?
    @collection_name : String?
    @database_name : String?

    def initialize(
      @documents : Array(T),
      @cursor_id : String? = nil,
      @client : Client? = nil,
      @collection_name : String? = nil,
      @database_name : String? = nil,
      @batch_size : Int32 = 101
    )
    end

    # Get the next document
    def next : T?
      return nil if @exhausted

      if @position >= @documents.size
        # Try to fetch more documents if we have a cursor_id
        if cursor_id = @cursor_id
          if client = @client
            fetch_more(client, cursor_id)
          else
            @exhausted = true
            return nil
          end
        else
          @exhausted = true
          return nil
        end
      end

      if @position < @documents.size
        doc = @documents[@position]
        @position += 1
        doc
      else
        nil
      end
    end

    # Check if there are more documents
    def has_next? : Bool
      return false if @exhausted
      @position < @documents.size || @cursor_id != nil
    end

    # Iterate over all documents
    def each(&)
      while doc = self.next
        yield doc
      end
    end

    # Convert to array
    def to_a : Array(T)
      result = [] of T
      each { |doc| result << doc }
      result
    end

    # Get first document
    def first : T?
      return nil if @documents.empty?
      @documents.first
    end

    # Get first document or raise
    def first! : T
      first || raise DocumentNotFoundError.new
    end

    # Count documents (consumes cursor)
    def count : Int32
      to_a.size
    end

    # Map documents to another type
    def map(&block : T -> R) : Array(R) forall R
      result = [] of R
      each { |doc| result << block.call(doc) }
      result
    end

    # Filter documents
    def select(&block : T -> Bool) : Array(T)
      result = [] of T
      each { |doc| result << doc if block.call(doc) }
      result
    end

    # Reduce documents
    def reduce(initial : R, &block : R, T -> R) : R forall R
      result = initial
      each { |doc| result = block.call(result, doc) }
      result
    end

    # Skip documents
    def skip(n : Int32) : self
      n.times { self.next }
      self
    end

    # Limit documents
    def limit(n : Int32) : Array(T)
      result = [] of T
      n.times do
        if doc = self.next
          result << doc
        else
          break
        end
      end
      result
    end

    # Check if cursor is exhausted
    def exhausted? : Bool
      @exhausted
    end

    # Close the cursor
    def close : Nil
      @exhausted = true
      @cursor_id = nil
    end

    # Fetch more documents from the server
    private def fetch_more(client : Client, cursor_id : String) : Nil
      begin
        response = client.rpc_call("cursor.getMore", {
          "cursorId"   => cursor_id,
          "batchSize"  => @batch_size,
          "database"   => @database_name,
          "collection" => @collection_name,
        })

        if docs = response["documents"]?.try(&.as_a)
          @documents = docs.map { |d| d.as(T) }
          @position = 0

          # Check if there are more documents
          if response["cursorId"]?.try(&.as_s?) == nil || docs.empty?
            @cursor_id = nil
          end
        else
          @exhausted = true
        end
      rescue
        @exhausted = true
      end
    end
  end

  # Cursor specifically for JSON documents
  alias DocumentCursor = Cursor(JSON::Any)
end
