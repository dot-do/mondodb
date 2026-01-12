module Mongo
  # Represents a MongoDB database
  class Database
    getter name : String
    getter client : Client
    @collections : Hash(String, Collection) = {} of String => Collection

    def initialize(@client : Client, @name : String)
    end

    # Get a collection by name
    #
    # Example:
    #   users = db["users"]
    #   users = db.collection("users")
    def [](name : String) : Collection
      collection(name)
    end

    # Get a collection by name
    def collection(name : String) : Collection
      @collections[name] ||= Collection.new(self, name)
    end

    # Get a typed collection
    #
    # Example:
    #   users = db.typed_collection(User, "users")
    #   user = users.find_one({"email" => "alice@example.com"})
    def typed_collection(type : T.class, name : String) : TypedCollection(T) forall T
      TypedCollection(T).new(collection(name))
    end

    # List all collection names in this database
    def collection_names : Array(String)
      response = @client.rpc_call("database.listCollections", {
        "database" => @name,
      })

      response["collections"]?.try(&.as_a.map(&.as_s)) || [] of String
    end

    # List all collections with metadata
    def list_collections : Array(JSON::Any)
      response = @client.rpc_call("database.listCollections", {
        "database"     => @name,
        "includeStats" => true,
      })

      response["collections"]?.try(&.as_a) || [] of JSON::Any
    end

    # Create a new collection
    #
    # Example:
    #   db.create_collection("logs", capped: true, size: 10_000_000)
    def create_collection(
      name : String,
      *,
      capped : Bool = false,
      size : Int64? = nil,
      max : Int64? = nil,
      validator : Hash(String, JSON::Any)? = nil
    ) : Collection
      options = {} of String => JSON::Any
      options["capped"] = JSON::Any.new(capped) if capped
      options["size"] = JSON::Any.new(size) if size
      options["max"] = JSON::Any.new(max) if max
      options["validator"] = to_json_any(validator) if validator

      @client.rpc_call("database.createCollection", {
        "database" => @name,
        "name"     => name,
        "options"  => options,
      })

      collection(name)
    end

    # Drop a collection
    def drop_collection(name : String) : Nil
      @client.rpc_call("database.dropCollection", {
        "database"   => @name,
        "collection" => name,
      })
      @collections.delete(name)
    end

    # Drop the entire database
    def drop : Nil
      @client.rpc_call("database.drop", {
        "database" => @name,
      })
    end

    # Run a database command
    #
    # Example:
    #   result = db.run_command({"ping" => 1})
    def run_command(command : Hash(String, JSON::Any) | NamedTuple) : JSON::Any
      @client.rpc_call("database.runCommand", {
        "database" => @name,
        "command"  => to_json_any(command),
      })
    end

    # Get database statistics
    def stats : JSON::Any
      run_command({"dbStats" => 1})
    end

    # Helper to convert to JSON::Any
    private def to_json_any(value) : JSON::Any
      case value
      when JSON::Any
        value
      when Hash
        hash = {} of String => JSON::Any
        value.each { |k, v| hash[k.to_s] = to_json_any(v) }
        JSON::Any.new(hash)
      when NamedTuple
        hash = {} of String => JSON::Any
        value.each { |k, v| hash[k.to_s] = to_json_any(v) }
        JSON::Any.new(hash)
      when Array
        JSON::Any.new(value.map { |v| to_json_any(v) })
      when String
        JSON::Any.new(value)
      when Int32, Int64
        JSON::Any.new(value.to_i64)
      when Float32, Float64
        JSON::Any.new(value.to_f64)
      when Bool
        JSON::Any.new(value)
      when Nil
        JSON::Any.new(nil)
      else
        JSON::Any.new(value.to_s)
      end
    end
  end
end
