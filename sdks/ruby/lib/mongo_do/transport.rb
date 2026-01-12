# frozen_string_literal: true

module Mongo
  # RPC Transport interface - abstracts the underlying RPC client
  module RpcTransport
    # Make an RPC call
    # @param method [String] Method name
    # @param args [Array] Method arguments
    # @return [Object] Result from the RPC call
    def call(method, *args)
      raise NotImplementedError, 'Subclasses must implement #call'
    end

    # Close the transport connection
    def close
      raise NotImplementedError, 'Subclasses must implement #close'
    end

    # Check if transport is closed
    # @return [Boolean]
    def closed?
      raise NotImplementedError, 'Subclasses must implement #closed?'
    end
  end
end

module MongoDo
  # Mock RPC transport for testing
  # Implements an in-memory MongoDB-like database
  class MockRpcTransport
    include Mongo::RpcTransport

    attr_reader :call_log

    def initialize
      @data = {} # { db_name => { collection_name => [documents] } }
      @next_id = 1
      @closed = false
      @call_log = []
    end

    # Make an RPC call
    # @param method [String] Method name
    # @param args [Array] Method arguments
    # @return [Object] Result from the RPC call
    def call(method, *args)
      raise Mongo::TransportClosedError if @closed

      @call_log << { method: method, args: args }

      case method.to_s
      when 'connect'      then handle_connect(*args)
      when 'ping'         then handle_ping
      when 'insertOne'    then handle_insert_one(*args)
      when 'insertMany'   then handle_insert_many(*args)
      when 'find'         then handle_find(*args)
      when 'findOneAndUpdate'  then handle_find_one_and_update(*args)
      when 'findOneAndDelete'  then handle_find_one_and_delete(*args)
      when 'findOneAndReplace' then handle_find_one_and_replace(*args)
      when 'updateOne'    then handle_update_one(*args)
      when 'updateMany'   then handle_update_many(*args)
      when 'replaceOne'   then handle_replace_one(*args)
      when 'deleteOne'    then handle_delete_one(*args)
      when 'deleteMany'   then handle_delete_many(*args)
      when 'countDocuments'    then handle_count_documents(*args)
      when 'estimatedDocumentCount' then handle_estimated_document_count(*args)
      when 'aggregate'    then handle_aggregate(*args)
      when 'distinct'     then handle_distinct(*args)
      when 'createCollection'  then handle_create_collection(*args)
      when 'dropCollection'    then handle_drop_collection(*args)
      when 'dropDatabase'      then handle_drop_database(*args)
      when 'listCollections'   then handle_list_collections(*args)
      when 'listDatabases'     then handle_list_databases
      when 'createIndex'       then handle_create_index(*args)
      when 'createIndexes'     then handle_create_indexes(*args)
      when 'dropIndex'         then handle_drop_index(*args)
      when 'dropIndexes'       then handle_drop_indexes(*args)
      when 'listIndexes'       then handle_list_indexes(*args)
      when 'runCommand'        then handle_run_command(*args)
      when 'serverStatus'      then handle_server_status
      when 'adminCommand'      then handle_admin_command(*args)
      when 'renameCollection'  then handle_rename_collection(*args)
      when 'bulkWrite'         then handle_bulk_write(*args)
      else
        raise Mongo::UnknownMethodError, method
      end
    end

    # Close the transport
    def close
      @closed = true
    end

    # Check if transport is closed
    # @return [Boolean]
    def closed?
      @closed
    end

    # Clear call log
    def clear_call_log
      @call_log.clear
    end

    private

    # Get or create a database
    def get_or_create_db(name)
      @data[name] ||= {}
    end

    # Get or create a collection
    def get_or_create_collection(db_name, coll_name)
      db = get_or_create_db(db_name)
      db[coll_name] ||= []
    end

    # Get a collection (returns empty array if not exists)
    def get_collection(db_name, coll_name)
      get_or_create_collection(db_name, coll_name)
    end

    # Generate next ID
    def next_id
      id = "id_#{@next_id}"
      @next_id += 1
      id
    end

    # Handle connect
    def handle_connect(*)
      { 'ok' => 1 }
    end

    # Handle ping
    def handle_ping
      { 'ok' => 1 }
    end

    # Handle insertOne
    def handle_insert_one(db_name, coll_name, doc)
      collection = get_or_create_collection(db_name, coll_name)
      id = doc[:_id] || doc['_id'] || next_id
      new_doc = doc.merge('_id' => id)
      collection << new_doc
      { 'acknowledged' => true, 'insertedId' => id }
    end

    # Handle insertMany
    def handle_insert_many(db_name, coll_name, docs)
      collection = get_or_create_collection(db_name, coll_name)
      inserted_ids = {}
      docs.each_with_index do |doc, i|
        id = doc[:_id] || doc['_id'] || next_id
        new_doc = doc.merge('_id' => id)
        collection << new_doc
        inserted_ids[i] = id
      end
      { 'acknowledged' => true, 'insertedCount' => docs.length, 'insertedIds' => inserted_ids }
    end

    # Handle find
    def handle_find(db_name, coll_name, filter = {}, options = {})
      collection = get_collection(db_name, coll_name)
      results = collection.select { |doc| matches_filter?(doc, filter) }

      # Apply sort
      if options[:sort] || options['sort']
        sort_spec = options[:sort] || options['sort']
        results = sort_docs(results, sort_spec)
      end

      # Apply skip
      skip = options[:skip] || options['skip'] || 0
      results = results.drop(skip)

      # Apply limit
      if (limit = options[:limit] || options['limit'])
        results = results.take(limit)
      end

      # Apply projection
      if (projection = options[:projection] || options['projection'])
        results = results.map { |doc| apply_projection(doc, projection) }
      end

      results
    end

    # Handle findOneAndUpdate
    def handle_find_one_and_update(db_name, coll_name, filter, update, options = {})
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      if index.nil?
        if options[:upsert] || options['upsert']
          id = next_id
          new_doc = apply_update({ '_id' => id }, update).merge(filter)
          collection << new_doc
          return (options[:returnDocument] || options['returnDocument']) == 'after' ? new_doc : nil
        end
        return nil
      end

      original = collection[index].dup
      collection[index] = apply_update(collection[index], update)

      (options[:returnDocument] || options['returnDocument']) == 'after' ? collection[index] : original
    end

    # Handle findOneAndDelete
    def handle_find_one_and_delete(db_name, coll_name, filter)
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      return nil if index.nil?

      collection.delete_at(index)
    end

    # Handle findOneAndReplace
    def handle_find_one_and_replace(db_name, coll_name, filter, replacement, options = {})
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      if index.nil?
        if options[:upsert] || options['upsert']
          id = next_id
          new_doc = replacement.merge('_id' => id)
          collection << new_doc
          return (options[:returnDocument] || options['returnDocument']) == 'after' ? new_doc : nil
        end
        return nil
      end

      original = collection[index].dup
      id = original['_id'] || original[:_id]
      collection[index] = replacement.merge('_id' => id)

      (options[:returnDocument] || options['returnDocument']) == 'after' ? collection[index] : original
    end

    # Handle updateOne
    def handle_update_one(db_name, coll_name, filter, update, options = {})
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      if index.nil?
        if options[:upsert] || options['upsert']
          id = next_id
          new_doc = apply_update({ '_id' => id }, update)
          collection << new_doc
          return { 'acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0,
                   'upsertedId' => id, 'upsertedCount' => 1 }
        end
        return { 'acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0 }
      end

      collection[index] = apply_update(collection[index], update)
      { 'acknowledged' => true, 'matchedCount' => 1, 'modifiedCount' => 1 }
    end

    # Handle updateMany
    def handle_update_many(db_name, coll_name, filter, update, options = {})
      collection = get_collection(db_name, coll_name)
      matched_count = 0
      modified_count = 0

      collection.each_with_index do |doc, i|
        next unless matches_filter?(doc, filter)

        matched_count += 1
        updated = apply_update(doc, update)
        if updated != doc
          collection[i] = updated
          modified_count += 1
        end
      end

      if matched_count.zero? && (options[:upsert] || options['upsert'])
        id = next_id
        new_doc = apply_update({ '_id' => id }, update)
        collection << new_doc
        return { 'acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0,
                 'upsertedId' => id, 'upsertedCount' => 1 }
      end

      { 'acknowledged' => true, 'matchedCount' => matched_count, 'modifiedCount' => modified_count }
    end

    # Handle replaceOne
    def handle_replace_one(db_name, coll_name, filter, replacement, options = {})
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      if index.nil?
        if options[:upsert] || options['upsert']
          id = next_id
          new_doc = replacement.merge('_id' => id)
          collection << new_doc
          return { 'acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0,
                   'upsertedId' => id, 'upsertedCount' => 1 }
        end
        return { 'acknowledged' => true, 'matchedCount' => 0, 'modifiedCount' => 0 }
      end

      id = collection[index]['_id'] || collection[index][:_id]
      collection[index] = replacement.merge('_id' => id)
      { 'acknowledged' => true, 'matchedCount' => 1, 'modifiedCount' => 1 }
    end

    # Handle deleteOne
    def handle_delete_one(db_name, coll_name, filter, _options = {})
      collection = get_collection(db_name, coll_name)
      index = collection.find_index { |doc| matches_filter?(doc, filter) }

      if index.nil?
        return { 'acknowledged' => true, 'deletedCount' => 0 }
      end

      collection.delete_at(index)
      { 'acknowledged' => true, 'deletedCount' => 1 }
    end

    # Handle deleteMany
    def handle_delete_many(db_name, coll_name, filter, _options = {})
      collection = get_collection(db_name, coll_name)
      original_count = collection.length
      collection.reject! { |doc| matches_filter?(doc, filter) }
      { 'acknowledged' => true, 'deletedCount' => original_count - collection.length }
    end

    # Handle countDocuments
    def handle_count_documents(db_name, coll_name, filter = {}, options = {})
      collection = get_collection(db_name, coll_name)
      results = collection.select { |doc| matches_filter?(doc, filter) }

      skip = options[:skip] || options['skip'] || 0
      results = results.drop(skip)

      if (limit = options[:limit] || options['limit'])
        results = results.take(limit)
      end

      results.length
    end

    # Handle estimatedDocumentCount
    def handle_estimated_document_count(db_name, coll_name)
      get_collection(db_name, coll_name).length
    end

    # Handle aggregate
    def handle_aggregate(db_name, coll_name, pipeline, _options = {})
      results = get_collection(db_name, coll_name).dup

      pipeline.each do |stage|
        stage = symbolize_keys(stage)
        if stage[:$match]
          results = results.select { |doc| matches_filter?(doc, stage[:$match]) }
        elsif stage[:$limit]
          results = results.take(stage[:$limit])
        elsif stage[:$skip]
          results = results.drop(stage[:$skip])
        elsif stage[:$sort]
          results = sort_docs(results, stage[:$sort])
        elsif stage[:$project]
          results = results.map { |doc| apply_projection(doc, stage[:$project]) }
        elsif stage[:$count]
          results = [{ stage[:$count] => results.length }]
        elsif stage[:$group]
          results = group_docs(results, stage[:$group])
        end
      end

      results
    end

    # Handle distinct
    def handle_distinct(db_name, coll_name, field, filter = {})
      collection = get_collection(db_name, coll_name)
      filtered = filter.empty? ? collection : collection.select { |doc| matches_filter?(doc, filter) }
      values = filtered.map { |doc| get_field_value(doc, field) }.compact.uniq
      values
    end

    # Handle createCollection
    def handle_create_collection(db_name, coll_name, _options = {})
      get_or_create_collection(db_name, coll_name)
      { 'ok' => 1 }
    end

    # Handle dropCollection
    def handle_drop_collection(db_name, coll_name)
      db = @data[db_name]
      db&.delete(coll_name)
      true
    end

    # Handle dropDatabase
    def handle_drop_database(db_name)
      @data.delete(db_name)
      true
    end

    # Handle listCollections
    def handle_list_collections(db_name, _filter = {})
      db = @data[db_name]
      return [] unless db

      db.keys.map { |name| { 'name' => name, 'type' => 'collection' } }
    end

    # Handle listDatabases
    def handle_list_databases
      databases = @data.keys.map do |name|
        { 'name' => name, 'sizeOnDisk' => 0, 'empty' => @data[name]&.empty? }
      end
      { 'databases' => databases, 'totalSize' => 0 }
    end

    # Handle createIndex
    def handle_create_index(_db_name, _coll_name, _keys, _options = {})
      'index_name'
    end

    # Handle createIndexes
    def handle_create_indexes(_db_name, _coll_name, _indexes)
      %w[index_1 index_2]
    end

    # Handle dropIndex
    def handle_drop_index(_db_name, _coll_name, _index_name)
      nil
    end

    # Handle dropIndexes
    def handle_drop_indexes(_db_name, _coll_name)
      nil
    end

    # Handle listIndexes
    def handle_list_indexes(_db_name, _coll_name)
      [{ 'v' => 2, 'key' => { '_id' => 1 }, 'name' => '_id_' }]
    end

    # Handle runCommand
    def handle_run_command(db_name, command)
      command = symbolize_keys(command)
      if command[:dbStats]
        {
          'db' => db_name, 'collections' => 0, 'objects' => 0,
          'avgObjSize' => 0, 'dataSize' => 0, 'storageSize' => 0,
          'indexes' => 0, 'indexSize' => 0, 'ok' => 1
        }
      else
        { 'ok' => 1 }
      end
    end

    # Handle serverStatus
    def handle_server_status
      { 'host' => 'localhost', 'version' => '1.0.0', 'ok' => 1 }
    end

    # Handle adminCommand
    def handle_admin_command(_command)
      { 'ok' => 1 }
    end

    # Handle renameCollection
    def handle_rename_collection(db_name, from_name, to_name, _options = {})
      db = @data[db_name]
      return unless db

      collection = db.delete(from_name)
      db[to_name] = collection if collection
      nil
    end

    # Handle bulkWrite
    def handle_bulk_write(db_name, coll_name, operations, _options = {})
      inserted_count = 0
      matched_count = 0
      modified_count = 0
      deleted_count = 0
      upserted_count = 0
      upserted_ids = {}

      operations.each_with_index do |op, i|
        op = symbolize_keys(op)

        if op[:insertOne]
          call('insertOne', db_name, coll_name, op[:insertOne][:document])
          inserted_count += 1
        elsif op[:updateOne]
          result = call('updateOne', db_name, coll_name,
                        op[:updateOne][:filter], op[:updateOne][:update],
                        { upsert: op[:updateOne][:upsert] })
          matched_count += result['matchedCount']
          modified_count += result['modifiedCount']
          if result['upsertedId']
            upserted_ids[i] = result['upsertedId']
            upserted_count += result['upsertedCount'] || 0
          end
        elsif op[:updateMany]
          result = call('updateMany', db_name, coll_name,
                        op[:updateMany][:filter], op[:updateMany][:update],
                        { upsert: op[:updateMany][:upsert] })
          matched_count += result['matchedCount']
          modified_count += result['modifiedCount']
        elsif op[:deleteOne]
          result = call('deleteOne', db_name, coll_name, op[:deleteOne][:filter])
          deleted_count += result['deletedCount']
        elsif op[:deleteMany]
          result = call('deleteMany', db_name, coll_name, op[:deleteMany][:filter])
          deleted_count += result['deletedCount']
        elsif op[:replaceOne]
          result = call('replaceOne', db_name, coll_name,
                        op[:replaceOne][:filter], op[:replaceOne][:replacement],
                        { upsert: op[:replaceOne][:upsert] })
          matched_count += result['matchedCount']
          modified_count += result['modifiedCount']
          if result['upsertedId']
            upserted_ids[i] = result['upsertedId']
            upserted_count += 1
          end
        end
      end

      {
        'insertedCount' => inserted_count,
        'matchedCount' => matched_count,
        'modifiedCount' => modified_count,
        'deletedCount' => deleted_count,
        'upsertedCount' => upserted_count,
        'upsertedIds' => upserted_ids
      }
    end

    # Helper: Symbolize keys recursively
    def symbolize_keys(hash)
      return hash unless hash.is_a?(Hash)

      hash.transform_keys { |k| k.is_a?(String) ? k.to_sym : k }
          .transform_values { |v| v.is_a?(Hash) ? symbolize_keys(v) : v }
    end

    # Helper: Check if a document matches a filter
    def matches_filter?(doc, filter)
      return true if filter.nil? || filter.empty?

      filter = symbolize_keys(filter)

      filter.all? do |key, value|
        case key
        when :$and
          value.all? { |f| matches_filter?(doc, f) }
        when :$or
          value.any? { |f| matches_filter?(doc, f) }
        when :$nor
          value.none? { |f| matches_filter?(doc, f) }
        else
          doc_value = get_field_value(doc, key.to_s)
          matches_value?(doc_value, value)
        end
      end
    end

    # Helper: Check if a document value matches a filter value
    def matches_value?(doc_value, filter_value)
      case filter_value
      when Hash
        filter_value = symbolize_keys(filter_value)
        filter_value.all? do |op, op_value|
          case op
          when :$eq  then compare_values(doc_value, op_value)
          when :$ne  then !compare_values(doc_value, op_value)
          when :$gt  then doc_value && doc_value > op_value
          when :$gte then doc_value && doc_value >= op_value
          when :$lt  then doc_value && doc_value < op_value
          when :$lte then doc_value && doc_value <= op_value
          when :$in  then op_value.any? { |v| compare_values(doc_value, v) }
          when :$nin then op_value.none? { |v| compare_values(doc_value, v) }
          when :$exists then op_value ? !doc_value.nil? : doc_value.nil?
          when :$regex
            flags = filter_value[:$options] || ''
            regex_opts = flags.include?('i') ? Regexp::IGNORECASE : 0
            doc_value.is_a?(String) && doc_value.match?(Regexp.new(op_value, regex_opts))
          when :$size then doc_value.is_a?(Array) && doc_value.length == op_value
          when :$all then doc_value.is_a?(Array) && op_value.all? { |v| doc_value.include?(v) }
          when :$elemMatch
            if doc_value.is_a?(Array)
              doc_value.any? { |elem| matches_filter?({ '_' => elem }, { '_' => op_value }) }
            else
              false
            end
          when :$not
            !matches_value?(doc_value, op_value)
          else
            # Unknown operator or nested object
            compare_values(doc_value, filter_value)
          end
        end
      when Array
        doc_value.is_a?(Array) && doc_value == filter_value
      else
        if doc_value.is_a?(Array)
          doc_value.include?(filter_value)
        else
          compare_values(doc_value, filter_value)
        end
      end
    end

    # Helper: Compare two values for equality
    def compare_values(a, b)
      return true if a == b
      return a == b if a.nil? || b.nil?

      # Handle symbol vs string comparison
      if a.is_a?(Symbol) && b.is_a?(String)
        a.to_s == b
      elsif a.is_a?(String) && b.is_a?(Symbol)
        a == b.to_s
      else
        a == b
      end
    end

    # Helper: Get a nested field value using dot notation
    def get_field_value(doc, path)
      parts = path.to_s.split('.')
      value = doc

      parts.each do |part|
        return nil if value.nil?

        value = if value.is_a?(Hash)
                  value[part] || value[part.to_sym]
                else
                  nil
                end
      end

      value
    end

    # Helper: Set a nested field value using dot notation
    def set_field_value(doc, path, value)
      parts = path.to_s.split('.')
      current = doc

      parts[0..-2].each do |part|
        current[part] ||= {}
        current = current[part]
      end

      current[parts.last] = value
    end

    # Helper: Delete a nested field using dot notation
    def delete_field_value(doc, path)
      parts = path.to_s.split('.')
      current = doc

      parts[0..-2].each do |part|
        return if current.nil?

        current = current[part] || current[part.to_sym]
      end

      return if current.nil?

      current.delete(parts.last)
      current.delete(parts.last.to_sym)
    end

    # Helper: Sort documents
    def sort_docs(docs, sort_spec)
      sort_spec = symbolize_keys(sort_spec) if sort_spec.is_a?(Hash)

      docs.sort do |a, b|
        result = 0
        sort_spec.each do |key, direction|
          direction = direction == 'asc' || direction == 1 ? 1 : -1
          a_val = get_field_value(a, key.to_s)
          b_val = get_field_value(b, key.to_s)

          if a_val == b_val
            next
          elsif a_val.nil?
            result = direction
          elsif b_val.nil?
            result = -direction
          elsif a_val < b_val
            result = -direction
          else
            result = direction
          end
          break if result != 0
        end
        result
      end
    end

    # Helper: Apply projection to a document
    def apply_projection(doc, projection)
      projection = symbolize_keys(projection)
      has_inclusion = projection.values.any? { |v| v == 1 || v == true }
      has_exclusion = projection.values.any? { |v| v == 0 || v == false }

      if has_inclusion
        result = projection[:_id] != 0 ? { '_id' => doc['_id'] || doc[:_id] } : {}
        projection.each do |key, value|
          next if key == :_id

          if value == 1 || value == true
            result[key.to_s] = get_field_value(doc, key.to_s)
          end
        end
        result
      else
        result = doc.dup
        projection.each do |key, value|
          if value == 0 || value == false
            result.delete(key.to_s)
            result.delete(key)
          end
        end
        result
      end
    end

    # Helper: Apply update operators to a document
    def apply_update(doc, update)
      update = symbolize_keys(update)
      result = doc.dup

      if update[:$set]
        update[:$set].each { |k, v| set_field_value(result, k.to_s, v) }
      end

      if update[:$unset]
        update[:$unset].each_key { |k| delete_field_value(result, k.to_s) }
      end

      if update[:$inc]
        update[:$inc].each do |k, v|
          current = get_field_value(result, k.to_s) || 0
          set_field_value(result, k.to_s, current + v)
        end
      end

      if update[:$mul]
        update[:$mul].each do |k, v|
          current = get_field_value(result, k.to_s) || 0
          set_field_value(result, k.to_s, current * v)
        end
      end

      if update[:$min]
        update[:$min].each do |k, v|
          current = get_field_value(result, k.to_s)
          set_field_value(result, k.to_s, v) if current.nil? || v < current
        end
      end

      if update[:$max]
        update[:$max].each do |k, v|
          current = get_field_value(result, k.to_s)
          set_field_value(result, k.to_s, v) if current.nil? || v > current
        end
      end

      if update[:$push]
        update[:$push].each do |k, v|
          arr = get_field_value(result, k.to_s) || []
          arr = [] unless arr.is_a?(Array)

          if v.is_a?(Hash) && v[:$each]
            items = v[:$each]
            position = v[:$position] || arr.length
            arr.insert(position, *items)

            if v[:$sort]
              arr = sort_docs(arr.map { |e| e.is_a?(Hash) ? e : { '_v' => e } }, v[:$sort])
                    .map { |e| e.key?('_v') ? e['_v'] : e }
            end

            arr = arr.take(v[:$slice]) if v[:$slice]&.positive?
            arr = arr.last(-v[:$slice]) if v[:$slice]&.negative?
          else
            arr << v
          end

          set_field_value(result, k.to_s, arr)
        end
      end

      if update[:$addToSet]
        update[:$addToSet].each do |k, v|
          arr = get_field_value(result, k.to_s) || []
          arr = [] unless arr.is_a?(Array)

          if v.is_a?(Hash) && v[:$each]
            v[:$each].each { |item| arr << item unless arr.include?(item) }
          else
            arr << v unless arr.include?(v)
          end

          set_field_value(result, k.to_s, arr)
        end
      end

      if update[:$pop]
        update[:$pop].each do |k, v|
          arr = get_field_value(result, k.to_s)
          next unless arr.is_a?(Array)

          v == 1 ? arr.pop : arr.shift
        end
      end

      if update[:$pull]
        update[:$pull].each do |k, v|
          arr = get_field_value(result, k.to_s)
          next unless arr.is_a?(Array)

          arr.reject! do |item|
            if v.is_a?(Hash)
              matches_filter?({ '_' => item }, { '_' => v })
            else
              item == v
            end
          end
        end
      end

      if update[:$rename]
        update[:$rename].each do |old_key, new_key|
          value = get_field_value(result, old_key.to_s)
          delete_field_value(result, old_key.to_s)
          set_field_value(result, new_key.to_s, value)
        end
      end

      if update[:$currentDate]
        update[:$currentDate].each do |k, v|
          now = Time.now
          if v == true || (v.is_a?(Hash) && v[:$type] == 'date')
            set_field_value(result, k.to_s, now)
          elsif v.is_a?(Hash) && v[:$type] == 'timestamp'
            set_field_value(result, k.to_s, { 't' => now.to_i, 'i' => 1 })
          end
        end
      end

      result
    end

    # Helper: Group documents
    def group_docs(docs, group_spec)
      group_spec = symbolize_keys(group_spec)
      groups = {}

      docs.each do |doc|
        key_value = evaluate_expression(doc, group_spec[:_id])
        key_str = key_value.to_json

        groups[key_str] ||= { key: key_value, docs: [] }
        groups[key_str][:docs] << doc
      end

      groups.map do |_, group|
        result = { '_id' => group[:key] }

        group_spec.each do |field, spec|
          next if field == :_id

          spec = symbolize_keys(spec) if spec.is_a?(Hash)

          if spec.is_a?(Hash)
            if spec[:$sum]
              result[field.to_s] = if spec[:$sum] == 1
                                     group[:docs].length
                                   else
                                     group[:docs].sum { |d| evaluate_expression(d, spec[:$sum]).to_f }
                                   end
            elsif spec[:$avg]
              values = group[:docs].map { |d| evaluate_expression(d, spec[:$avg]).to_f }
              result[field.to_s] = values.sum / values.length
            elsif spec[:$min]
              result[field.to_s] = group[:docs].map { |d| evaluate_expression(d, spec[:$min]) }.min
            elsif spec[:$max]
              result[field.to_s] = group[:docs].map { |d| evaluate_expression(d, spec[:$max]) }.max
            elsif spec[:$first]
              result[field.to_s] = evaluate_expression(group[:docs].first, spec[:$first])
            elsif spec[:$last]
              result[field.to_s] = evaluate_expression(group[:docs].last, spec[:$last])
            elsif spec[:$push]
              result[field.to_s] = group[:docs].map { |d| evaluate_expression(d, spec[:$push]) }
            elsif spec[:$addToSet]
              result[field.to_s] = group[:docs].map { |d| evaluate_expression(d, spec[:$addToSet]) }.uniq
            end
          end
        end

        result
      end
    end

    # Helper: Evaluate an aggregation expression
    def evaluate_expression(doc, expr)
      return nil if expr.nil?

      if expr.is_a?(String) && expr.start_with?('$')
        get_field_value(doc, expr[1..])
      else
        expr
      end
    end
  end
end
