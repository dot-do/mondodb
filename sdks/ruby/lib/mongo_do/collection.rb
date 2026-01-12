# frozen_string_literal: true

module Mongo
  # Collection class - MongoDB-compatible collection operations
  #
  # @example CRUD operations
  #   users = db[:users]
  #
  #   # Insert
  #   users.insert_one(name: 'John', age: 30)
  #   users.insert_many([{ name: 'Jane' }, { name: 'Bob' }])
  #
  #   # Find
  #   users.find(status: 'active').each { |doc| puts doc }
  #   user = users.find_one(email: 'john@example.com')
  #
  #   # Update
  #   users.update_one({ _id: id }, { '$set' => { age: 31 } })
  #   users.update_many({ status: 'inactive' }, { '$set' => { archived: true } })
  #
  #   # Delete
  #   users.delete_one(_id: id)
  #   users.delete_many(status: 'deleted')
  #
  class Collection
    attr_reader :name, :database_name

    # Create a new Collection instance
    # @param transport [RpcTransport] RPC transport
    # @param db_name [String] Database name
    # @param name [String] Collection name
    def initialize(transport, db_name, name)
      @transport = transport
      @database_name = db_name
      @name = name
    end

    alias collection_name name
    alias db_name database_name

    # Get the full namespace
    # @return [String]
    def namespace
      "#{@database_name}.#{@name}"
    end

    # ============================================================================
    # Insert Operations
    # ============================================================================

    # Insert a single document
    # @param doc [Hash] Document to insert
    # @return [InsertOneResult]
    def insert_one(doc)
      result = @transport.call('insertOne', @database_name, @name, normalize_doc(doc))
      InsertOneResult.new(result)
    end

    # Insert multiple documents
    # @param docs [Array<Hash>] Documents to insert
    # @return [InsertManyResult]
    def insert_many(docs)
      result = @transport.call('insertMany', @database_name, @name, docs.map { |d| normalize_doc(d) })
      InsertManyResult.new(result)
    end

    # ============================================================================
    # Find Operations
    # ============================================================================

    # Find documents matching a filter - returns a cursor
    # @param filter [Hash] Query filter
    # @param options [Hash] Find options
    # @option options [Hash] :sort Sort specification
    # @option options [Integer] :limit Maximum documents to return
    # @option options [Integer] :skip Number of documents to skip
    # @option options [Hash] :projection Fields to include/exclude
    # @return [FindCursor]
    def find(filter = {}, options = {})
      cursor = FindCursor.new(@transport, @database_name, @name, normalize_doc(filter))

      cursor.sort(options[:sort]) if options[:sort]
      cursor.limit(options[:limit]) if options[:limit]
      cursor.skip(options[:skip]) if options[:skip]
      cursor.project(options[:projection]) if options[:projection]
      cursor.batch_size(options[:batch_size]) if options[:batch_size]
      cursor.max_time_ms(options[:max_time_ms]) if options[:max_time_ms]
      cursor.hint(options[:hint]) if options[:hint]
      cursor.comment(options[:comment]) if options[:comment]

      cursor
    end

    # Find a single document matching a filter
    # @param filter [Hash] Query filter
    # @param options [Hash] Find options
    # @return [Hash, nil]
    def find_one(filter = {}, options = {})
      cursor = find(filter, options.merge(limit: 1))
      cursor.first
    end

    # Find a document and update it
    # @param filter [Hash] Query filter
    # @param update [Hash] Update operations
    # @param options [Hash] Options
    # @option options [String] :return_document 'before' or 'after'
    # @option options [Boolean] :upsert Insert if not found
    # @return [Hash, nil]
    def find_one_and_update(filter, update, options = {})
      opts = {
        'returnDocument' => options[:return_document] || options['returnDocument'],
        'upsert' => options[:upsert] || options['upsert']
      }
      @transport.call('findOneAndUpdate', @database_name, @name,
                      normalize_doc(filter), normalize_doc(update), opts)
    end

    # Find a document and delete it
    # @param filter [Hash] Query filter
    # @return [Hash, nil]
    def find_one_and_delete(filter)
      @transport.call('findOneAndDelete', @database_name, @name, normalize_doc(filter))
    end

    # Find a document and replace it
    # @param filter [Hash] Query filter
    # @param replacement [Hash] Replacement document
    # @param options [Hash] Options
    # @option options [String] :return_document 'before' or 'after'
    # @option options [Boolean] :upsert Insert if not found
    # @return [Hash, nil]
    def find_one_and_replace(filter, replacement, options = {})
      opts = {
        'returnDocument' => options[:return_document] || options['returnDocument'],
        'upsert' => options[:upsert] || options['upsert']
      }
      @transport.call('findOneAndReplace', @database_name, @name,
                      normalize_doc(filter), normalize_doc(replacement), opts)
    end

    # ============================================================================
    # Update Operations
    # ============================================================================

    # Update a single document
    # @param filter [Hash] Query filter
    # @param update [Hash] Update operations
    # @param options [Hash] Options
    # @option options [Boolean] :upsert Insert if not found
    # @option options [Array<Hash>] :array_filters Array filters for updates
    # @return [UpdateResult]
    def update_one(filter, update, options = {})
      result = @transport.call('updateOne', @database_name, @name,
                               normalize_doc(filter), normalize_doc(update), options)
      UpdateResult.new(result)
    end

    # Update multiple documents
    # @param filter [Hash] Query filter
    # @param update [Hash] Update operations
    # @param options [Hash] Options
    # @option options [Boolean] :upsert Insert if not found
    # @return [UpdateResult]
    def update_many(filter, update, options = {})
      result = @transport.call('updateMany', @database_name, @name,
                               normalize_doc(filter), normalize_doc(update), options)
      UpdateResult.new(result)
    end

    # Replace a single document
    # @param filter [Hash] Query filter
    # @param replacement [Hash] Replacement document
    # @param options [Hash] Options
    # @option options [Boolean] :upsert Insert if not found
    # @return [UpdateResult]
    def replace_one(filter, replacement, options = {})
      result = @transport.call('replaceOne', @database_name, @name,
                               normalize_doc(filter), normalize_doc(replacement), options)
      UpdateResult.new(result)
    end

    # ============================================================================
    # Delete Operations
    # ============================================================================

    # Delete a single document
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [DeleteResult]
    def delete_one(filter, options = {})
      result = @transport.call('deleteOne', @database_name, @name, normalize_doc(filter), options)
      DeleteResult.new(result)
    end

    # Delete multiple documents
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [DeleteResult]
    def delete_many(filter, options = {})
      result = @transport.call('deleteMany', @database_name, @name, normalize_doc(filter), options)
      DeleteResult.new(result)
    end

    # ============================================================================
    # Count Operations
    # ============================================================================

    # Count documents matching a filter
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @option options [Integer] :skip Number of documents to skip
    # @option options [Integer] :limit Maximum documents to count
    # @return [Integer]
    def count_documents(filter = {}, options = {})
      @transport.call('countDocuments', @database_name, @name, normalize_doc(filter), options)
    end

    alias count count_documents

    # Get an estimated document count
    # @return [Integer]
    def estimated_document_count
      @transport.call('estimatedDocumentCount', @database_name, @name)
    end

    # ============================================================================
    # Aggregation Operations
    # ============================================================================

    # Run an aggregation pipeline
    # @param pipeline [Array<Hash>] Aggregation stages
    # @param options [Hash] Options
    # @return [AggregationCursor]
    def aggregate(pipeline = [], options = {})
      AggregationCursor.new(@transport, @database_name, @name, pipeline, options)
    end

    # Get distinct values for a field
    # @param field [String, Symbol] Field name
    # @param filter [Hash] Optional filter
    # @return [Array]
    def distinct(field, filter = {})
      @transport.call('distinct', @database_name, @name, field.to_s, normalize_doc(filter))
    end

    # ============================================================================
    # Index Operations
    # ============================================================================

    # Create an index
    # @param keys [Hash] Index keys
    # @param options [Hash] Index options
    # @return [String] Index name
    def create_index(keys, options = {})
      @transport.call('createIndex', @database_name, @name, keys, options)
    end

    # Create multiple indexes
    # @param indexes [Array<Hash>] Index specifications
    # @return [Array<String>] Index names
    def create_indexes(indexes)
      @transport.call('createIndexes', @database_name, @name, indexes)
    end

    # Drop an index
    # @param index_name [String] Index name
    def drop_index(index_name)
      @transport.call('dropIndex', @database_name, @name, index_name)
    end

    # Drop all indexes
    def drop_indexes
      @transport.call('dropIndexes', @database_name, @name)
    end

    # List all indexes
    # @return [Array<Hash>]
    def list_indexes
      @transport.call('listIndexes', @database_name, @name)
    end

    alias indexes list_indexes

    # ============================================================================
    # Collection Operations
    # ============================================================================

    # Drop the collection
    # @return [Boolean]
    def drop
      @transport.call('dropCollection', @database_name, @name)
    end

    # Rename the collection
    # @param new_name [String] New collection name
    # @param options [Hash] Options
    # @option options [Boolean] :drop_target Drop target collection if exists
    def rename(new_name, options = {})
      @transport.call('renameCollection', @database_name, @name, new_name, options)
      @name = new_name
    end

    # ============================================================================
    # Bulk Operations
    # ============================================================================

    # Perform bulk write operations
    # @param operations [Array<Hash>] Operations to perform
    # @param options [Hash] Options
    # @option options [Boolean] :ordered Run operations in order
    # @return [BulkWriteResult]
    def bulk_write(operations, options = {})
      result = @transport.call('bulkWrite', @database_name, @name, operations, options)
      BulkWriteResult.new(result)
    end

    private

    # Normalize a document (convert symbol keys to strings)
    def normalize_doc(doc)
      return doc unless doc.is_a?(Hash)

      doc.transform_keys(&:to_s).transform_values do |v|
        case v
        when Hash then normalize_doc(v)
        when Array then v.map { |e| e.is_a?(Hash) ? normalize_doc(e) : e }
        else v
        end
      end
    end
  end

  # Result from insert_one operation
  class InsertOneResult
    attr_reader :inserted_id

    def initialize(result)
      @acknowledged = result['acknowledged']
      @inserted_id = result['insertedId']
    end

    def acknowledged?
      @acknowledged
    end
  end

  # Result from insert_many operation
  class InsertManyResult
    attr_reader :inserted_count, :inserted_ids

    def initialize(result)
      @acknowledged = result['acknowledged']
      @inserted_count = result['insertedCount']
      @inserted_ids = result['insertedIds']
    end

    def acknowledged?
      @acknowledged
    end
  end

  # Result from update operations
  class UpdateResult
    attr_reader :matched_count, :modified_count, :upserted_id, :upserted_count

    def initialize(result)
      @acknowledged = result['acknowledged']
      @matched_count = result['matchedCount']
      @modified_count = result['modifiedCount']
      @upserted_id = result['upsertedId']
      @upserted_count = result['upsertedCount']
    end

    def acknowledged?
      @acknowledged
    end
  end

  # Result from delete operations
  class DeleteResult
    attr_reader :deleted_count

    def initialize(result)
      @acknowledged = result['acknowledged']
      @deleted_count = result['deletedCount']
    end

    def acknowledged?
      @acknowledged
    end
  end

  # Result from bulk_write operation
  class BulkWriteResult
    attr_reader :inserted_count, :matched_count, :modified_count,
                :deleted_count, :upserted_count, :upserted_ids

    def initialize(result)
      @inserted_count = result['insertedCount']
      @matched_count = result['matchedCount']
      @modified_count = result['modifiedCount']
      @deleted_count = result['deletedCount']
      @upserted_count = result['upsertedCount']
      @upserted_ids = result['upsertedIds']
    end
  end
end
