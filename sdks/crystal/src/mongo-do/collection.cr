module Mongo
  # Represents a MongoDB collection
  class Collection
    getter name : String
    getter database : Database

    def initialize(@database : Database, @name : String)
    end

    # Get the full namespace (database.collection)
    def namespace : String
      "#{@database.name}.#{@name}"
    end

    # Find documents matching a filter
    #
    # Example:
    #   cursor = collection.find({"status" => "active"})
    #   cursor.each { |doc| puts doc }
    def find(
      filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any,
      *,
      projection : Hash(String, Int32)? = nil,
      sort : Hash(String, Int32)? = nil,
      skip : Int32? = nil,
      limit : Int32? = nil,
      batch_size : Int32 = 101
    ) : DocumentCursor
      options = {} of String => JSON::Any
      options["filter"] = to_json_any(filter)
      options["projection"] = to_json_any(projection) if projection
      options["sort"] = to_json_any(sort) if sort
      options["skip"] = JSON::Any.new(skip.to_i64) if skip
      options["limit"] = JSON::Any.new(limit.to_i64) if limit
      options["batchSize"] = JSON::Any.new(batch_size.to_i64)

      response = @database.client.rpc_call("collection.find", {
        "database"   => @database.name,
        "collection" => @name,
        "options"    => options,
      })

      documents = response["documents"]?.try(&.as_a) || [] of JSON::Any
      cursor_id = response["cursorId"]?.try(&.as_s?)

      DocumentCursor.new(
        documents: documents,
        cursor_id: cursor_id,
        client: @database.client,
        collection_name: @name,
        database_name: @database.name,
        batch_size: batch_size
      )
    end

    # Find a single document
    #
    # Example:
    #   user = collection.find_one({"email" => "alice@example.com"})
    def find_one(
      filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any,
      *,
      projection : Hash(String, Int32)? = nil
    ) : JSON::Any?
      options = {} of String => JSON::Any
      options["filter"] = to_json_any(filter)
      options["projection"] = to_json_any(projection) if projection

      response = @database.client.rpc_call("collection.findOne", {
        "database"   => @database.name,
        "collection" => @name,
        "options"    => options,
      })

      response["document"]?
    end

    # Insert a single document
    #
    # Example:
    #   result = collection.insert_one({"name" => "Alice", "email" => "alice@example.com"})
    #   puts result.inserted_id
    def insert_one(document : Hash(String, JSON::Any) | NamedTuple | JSON::Any) : InsertOneResult
      response = @database.client.rpc_call("collection.insertOne", {
        "database"   => @database.name,
        "collection" => @name,
        "document"   => to_json_any(document),
      })

      InsertOneResult.from_json(response)
    end

    # Insert multiple documents
    #
    # Example:
    #   result = collection.insert_many([
    #     {"name" => "Alice"},
    #     {"name" => "Bob"},
    #   ])
    #   puts result.inserted_count
    def insert_many(
      documents : Array,
      *,
      ordered : Bool = true
    ) : InsertManyResult
      docs = documents.map { |d| to_json_any(d) }

      response = @database.client.rpc_call("collection.insertMany", {
        "database"   => @database.name,
        "collection" => @name,
        "documents"  => docs,
        "ordered"    => ordered,
      })

      InsertManyResult.from_json(response)
    end

    # Update a single document
    #
    # Example:
    #   result = collection.update_one(
    #     {"email" => "alice@example.com"},
    #     {"$set" => {"name" => "Alice Smith"}}
    #   )
    def update_one(
      filter : Hash(String, JSON::Any) | NamedTuple,
      update : Hash(String, JSON::Any) | NamedTuple,
      *,
      upsert : Bool = false
    ) : UpdateResult
      response = @database.client.rpc_call("collection.updateOne", {
        "database"   => @database.name,
        "collection" => @name,
        "filter"     => to_json_any(filter),
        "update"     => to_json_any(update),
        "upsert"     => upsert,
      })

      UpdateResult.from_json(response)
    end

    # Update multiple documents
    #
    # Example:
    #   result = collection.update_many(
    #     {"status" => "pending"},
    #     {"$set" => {"status" => "processed"}}
    #   )
    def update_many(
      filter : Hash(String, JSON::Any) | NamedTuple,
      update : Hash(String, JSON::Any) | NamedTuple,
      *,
      upsert : Bool = false
    ) : UpdateResult
      response = @database.client.rpc_call("collection.updateMany", {
        "database"   => @database.name,
        "collection" => @name,
        "filter"     => to_json_any(filter),
        "update"     => to_json_any(update),
        "upsert"     => upsert,
      })

      UpdateResult.from_json(response)
    end

    # Replace a single document
    #
    # Example:
    #   result = collection.replace_one(
    #     {"_id" => id},
    #     {"name" => "New Name", "email" => "new@example.com"}
    #   )
    def replace_one(
      filter : Hash(String, JSON::Any) | NamedTuple,
      replacement : Hash(String, JSON::Any) | NamedTuple,
      *,
      upsert : Bool = false
    ) : UpdateResult
      response = @database.client.rpc_call("collection.replaceOne", {
        "database"    => @database.name,
        "collection"  => @name,
        "filter"      => to_json_any(filter),
        "replacement" => to_json_any(replacement),
        "upsert"      => upsert,
      })

      UpdateResult.from_json(response)
    end

    # Delete a single document
    #
    # Example:
    #   result = collection.delete_one({"email" => "alice@example.com"})
    def delete_one(filter : Hash(String, JSON::Any) | NamedTuple) : DeleteResult
      response = @database.client.rpc_call("collection.deleteOne", {
        "database"   => @database.name,
        "collection" => @name,
        "filter"     => to_json_any(filter),
      })

      DeleteResult.from_json(response)
    end

    # Delete multiple documents
    #
    # Example:
    #   result = collection.delete_many({"status" => "inactive"})
    def delete_many(filter : Hash(String, JSON::Any) | NamedTuple) : DeleteResult
      response = @database.client.rpc_call("collection.deleteMany", {
        "database"   => @database.name,
        "collection" => @name,
        "filter"     => to_json_any(filter),
      })

      DeleteResult.from_json(response)
    end

    # Count documents matching a filter
    #
    # Example:
    #   count = collection.count_documents({"status" => "active"})
    def count_documents(filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any) : Int64
      response = @database.client.rpc_call("collection.countDocuments", {
        "database"   => @database.name,
        "collection" => @name,
        "filter"     => to_json_any(filter),
      })

      response["count"]?.try(&.as_i64) || 0_i64
    end

    # Estimated document count
    def estimated_document_count : Int64
      response = @database.client.rpc_call("collection.estimatedDocumentCount", {
        "database"   => @database.name,
        "collection" => @name,
      })

      response["count"]?.try(&.as_i64) || 0_i64
    end

    # Run an aggregation pipeline
    #
    # Example:
    #   cursor = collection.aggregate([
    #     {"$match" => {"status" => "active"}},
    #     {"$group" => {"_id" => "$category", "count" => {"$sum" => 1}}},
    #   ])
    def aggregate(pipeline : Array, *, batch_size : Int32 = 101) : DocumentCursor
      response = @database.client.rpc_call("collection.aggregate", {
        "database"   => @database.name,
        "collection" => @name,
        "pipeline"   => pipeline.map { |stage| to_json_any(stage) },
        "batchSize"  => batch_size,
      })

      documents = response["documents"]?.try(&.as_a) || [] of JSON::Any
      cursor_id = response["cursorId"]?.try(&.as_s?)

      DocumentCursor.new(
        documents: documents,
        cursor_id: cursor_id,
        client: @database.client,
        collection_name: @name,
        database_name: @database.name,
        batch_size: batch_size
      )
    end

    # Get distinct values for a field
    #
    # Example:
    #   categories = collection.distinct("category", {"status" => "active"})
    def distinct(
      field : String,
      filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any
    ) : Array(JSON::Any)
      response = @database.client.rpc_call("collection.distinct", {
        "database"   => @database.name,
        "collection" => @name,
        "field"      => field,
        "filter"     => to_json_any(filter),
      })

      response["values"]?.try(&.as_a) || [] of JSON::Any
    end

    # Create an index
    #
    # Example:
    #   collection.create_index({"email" => 1}, unique: true)
    def create_index(
      keys : Hash(String, Int32),
      *,
      unique : Bool = false,
      name : String? = nil,
      sparse : Bool = false,
      background : Bool = false
    ) : String
      options = {} of String => JSON::Any
      options["unique"] = JSON::Any.new(unique) if unique
      options["name"] = JSON::Any.new(name) if name
      options["sparse"] = JSON::Any.new(sparse) if sparse
      options["background"] = JSON::Any.new(background) if background

      response = @database.client.rpc_call("collection.createIndex", {
        "database"   => @database.name,
        "collection" => @name,
        "keys"       => to_json_any(keys),
        "options"    => options,
      })

      response["name"]?.try(&.as_s) || ""
    end

    # Drop an index
    def drop_index(name : String) : Nil
      @database.client.rpc_call("collection.dropIndex", {
        "database"   => @database.name,
        "collection" => @name,
        "name"       => name,
      })
    end

    # Drop all indexes
    def drop_indexes : Nil
      @database.client.rpc_call("collection.dropIndexes", {
        "database"   => @database.name,
        "collection" => @name,
      })
    end

    # List indexes
    def list_indexes : Array(JSON::Any)
      response = @database.client.rpc_call("collection.listIndexes", {
        "database"   => @database.name,
        "collection" => @name,
      })

      response["indexes"]?.try(&.as_a) || [] of JSON::Any
    end

    # Drop the collection
    def drop : Nil
      @database.client.rpc_call("collection.drop", {
        "database"   => @database.name,
        "collection" => @name,
      })
    end

    # Rename the collection
    def rename(new_name : String, *, drop_target : Bool = false) : Nil
      @database.client.rpc_call("collection.rename", {
        "database"   => @database.name,
        "collection" => @name,
        "newName"    => new_name,
        "dropTarget" => drop_target,
      })
      @name = new_name
    end

    # Helper to convert various types to JSON::Any
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

  # Generic typed collection for type-safe operations
  class TypedCollection(T)
    getter collection : Collection

    def initialize(@collection : Collection)
    end

    # Find documents with type-safe return
    def find(filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any) : Array(T)
      @collection.find(filter).map { |doc| T.from_json(doc.to_json) }
    end

    # Find a single document with type-safe return
    def find_one(filter : Hash(String, JSON::Any) | NamedTuple = {} of String => JSON::Any) : T?
      if doc = @collection.find_one(filter)
        T.from_json(doc.to_json)
      end
    end

    # Insert a typed document
    def insert_one(document : T) : InsertOneResult
      @collection.insert_one(JSON.parse(document.to_json))
    end

    # Insert multiple typed documents
    def insert_many(documents : Array(T)) : InsertManyResult
      docs = documents.map { |d| JSON.parse(d.to_json) }
      @collection.insert_many(docs)
    end

    # Forward other methods to the underlying collection
    delegate :name, :namespace, :update_one, :update_many, :delete_one, :delete_many,
      :count_documents, :estimated_document_count, :aggregate, :distinct,
      :create_index, :drop_index, :drop_indexes, :list_indexes, :drop, :rename,
      to: @collection
  end
end
