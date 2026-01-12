module Mongo
  # Sort direction for queries
  enum SortDirection
    Asc  =  1
    Desc = -1
  end

  # Natural language query builder
  class MongoQuery(T)
    @query : String
    @config : Config
    @transaction : Transaction?
    @limit_value : Int32?
    @skip_value : Int32?
    @sort_field : String?
    @sort_direction : SortDirection = SortDirection::Asc
    @highlight_enabled : Bool = false
    @fuzzy_enabled : Bool = false
    @atomic_enabled : Bool = false
    @pipeline : Array(Proc(T, MongoQuery(JSON::Any)))? = nil

    def initialize(@query : String, @config : Config, @transaction : Transaction? = nil)
    end

    # Limit results to n documents
    #
    # Example:
    #   Mongo.query("users in Texas").limit(10)
    def limit(n : Int32) : MongoQuery(T)
      result = clone
      result.@limit_value = n
      result
    end

    # Skip the first n documents
    #
    # Example:
    #   Mongo.query("users").skip(20).limit(10)
    def skip(n : Int32) : MongoQuery(T)
      result = clone
      result.@skip_value = n
      result
    end

    # Sort results by field
    #
    # Example:
    #   Mongo.query("users").sort("created_at", :desc)
    def sort(field : String, direction : SortDirection = SortDirection::Asc) : MongoQuery(T)
      result = clone
      result.@sort_field = field
      result.@sort_direction = direction
      result
    end

    # Enable search result highlighting
    #
    # Example:
    #   Mongo.query("serverless database in title").highlight
    def highlight : MongoQuery(T)
      result = clone
      result.@highlight_enabled = true
      result
    end

    # Enable fuzzy matching
    #
    # Example:
    #   Mongo.query("articles matching kubernets").fuzzy
    def fuzzy : MongoQuery(T)
      result = clone
      result.@fuzzy_enabled = true
      result
    end

    # Execute as an atomic transaction
    #
    # Example:
    #   Mongo.query("transfer $100 from alice to bob").atomic
    def atomic : MongoQuery(T)
      result = clone
      result.@atomic_enabled = true
      result
    end

    # Transform results server-side using promise pipelining
    #
    # Example:
    #   Mongo.query("active users")
    #     .map { |u| Mongo.query("orders for #{u}") }
    def map(&block : T -> MongoQuery(JSON::Any)) : MongoQuery(Array(JSON::Any))
      result = MongoQuery(Array(JSON::Any)).new(@query, @config, @transaction)
      result.@limit_value = @limit_value
      result.@skip_value = @skip_value
      result.@sort_field = @sort_field
      result.@sort_direction = @sort_direction
      result.@highlight_enabled = @highlight_enabled
      result.@fuzzy_enabled = @fuzzy_enabled
      result.@atomic_enabled = @atomic_enabled

      # Store the pipeline step
      if @pipeline
        # Continue existing pipeline
        result.@pipeline = @pipeline.not_nil!.dup
        result.@pipeline.not_nil! << block.as(Proc(T, MongoQuery(JSON::Any)))
      else
        result.@pipeline = [block.as(Proc(T, MongoQuery(JSON::Any)))]
      end

      result
    end

    # Filter results server-side
    #
    # Example:
    #   Mongo.query("users").select { |u| u["active"].as_bool }
    def select(&block : T -> Bool) : MongoQuery(Array(T))
      MongoQuery(Array(T)).new(@query, @config, @transaction)
    end

    # Reduce results server-side
    #
    # Example:
    #   Mongo.query("orders").reduce(0.0) { |sum, o| sum + o["total"].as_f }
    def reduce(initial : R, &block : R, T -> R) : MongoQuery(R) forall R
      MongoQuery(R).new(@query, @config, @transaction)
    end

    # Get the query result
    #
    # Example:
    #   users = Mongo.query("active users").get
    def get : T
      execute
    end

    # Alias for get
    def await : T
      get
    end

    # Iterate over results
    #
    # Example:
    #   Mongo.query("watch orders for changes").each do |change|
    #     puts change
    #   end
    def each(&)
      result = execute
      case result
      when Array
        result.each { |item| yield item }
      else
        yield result
      end
    end

    # Convert to JSON string
    def to_json : String
      build_request.to_json
    end

    # Execute the query
    private def execute : T
      request = build_request
      uri = URI.parse(@config.uri)
      host = uri.host || "localhost"
      port = uri.port

      client = if uri.scheme == "https"
                 HTTP::Client.new(host, port || 443, tls: true)
               else
                 HTTP::Client.new(host, port || 80)
               end

      begin
        response = client.post("/rpc",
          headers: @config.headers,
          body: request.to_json
        )

        unless response.success?
          raise ConnectionError.new("Request failed: #{response.status_code}")
        end

        result = JSON.parse(response.body)

        if error = result["error"]?
          message = error["message"]?.try(&.as_s) || "Unknown error"
          suggestion = error["data"]?.try(&.["suggestion"]?.try(&.as_s))
          raise QueryError.new(message, suggestion)
        end

        parse_result(result["result"]?)
      ensure
        client.close
      end
    end

    # Build the RPC request
    private def build_request : Hash(String, JSON::Any)
      params = {} of String => JSON::Any
      params["query"] = JSON::Any.new(@query)
      params["limit"] = JSON::Any.new(@limit_value.not_nil!.to_i64) if @limit_value
      params["skip"] = JSON::Any.new(@skip_value.not_nil!.to_i64) if @skip_value
      params["highlight"] = JSON::Any.new(true) if @highlight_enabled
      params["fuzzy"] = JSON::Any.new(true) if @fuzzy_enabled
      params["atomic"] = JSON::Any.new(true) if @atomic_enabled

      if field = @sort_field
        params["sort"] = JSON::Any.new({
          "field"     => JSON::Any.new(field),
          "direction" => JSON::Any.new(@sort_direction.value.to_i64),
        })
      end

      # Include pipeline if present
      if pipeline = @pipeline
        pipeline_data = pipeline.map { |_| "pipeline_step" }
        params["pipeline"] = JSON::Any.new(pipeline_data.map { |p| JSON::Any.new(p) })
      end

      {
        "jsonrpc" => JSON::Any.new("2.0"),
        "method"  => JSON::Any.new("mongo.query"),
        "params"  => JSON::Any.new(params),
        "id"      => JSON::Any.new(Random.new.hex(8)),
      }
    end

    # Parse the result into the expected type
    private def parse_result(result : JSON::Any?) : T
      return result.not_nil!.as(T) if result
      raise QueryError.new("Empty result from query")
    end

    # Clone this query
    private def clone : MongoQuery(T)
      result = MongoQuery(T).new(@query, @config, @transaction)
      result.@limit_value = @limit_value
      result.@skip_value = @skip_value
      result.@sort_field = @sort_field
      result.@sort_direction = @sort_direction
      result.@highlight_enabled = @highlight_enabled
      result.@fuzzy_enabled = @fuzzy_enabled
      result.@atomic_enabled = @atomic_enabled
      result.@pipeline = @pipeline.try(&.dup)
      result
    end
  end
end
