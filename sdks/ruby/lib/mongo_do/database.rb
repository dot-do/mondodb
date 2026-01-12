# frozen_string_literal: true

module Mongo
  # Database class - MongoDB-compatible database operations
  #
  # @example
  #   db = client.database('mydb')
  #   users = db[:users]
  #   db.list_collections
  #   db.drop
  #
  class Database
    attr_reader :name

    # Create a new Database instance
    # @param transport [RpcTransport] RPC transport
    # @param name [String] Database name
    def initialize(transport, name)
      @transport = transport
      @name = name
      @collections = {}
    end

    alias database_name name

    # Get a collection by name
    # @param name [String, Symbol] Collection name
    # @return [Collection]
    def collection(name)
      name = name.to_s
      @collections[name] ||= Collection.new(@transport, @name, name)
    end

    # Get a collection using bracket syntax
    # @param name [String, Symbol] Collection name
    # @return [Collection]
    def [](name)
      collection(name)
    end

    # Create a new collection
    # @param name [String] Collection name
    # @param options [Hash] Collection options
    # @option options [Boolean] :capped Create a capped collection
    # @option options [Integer] :size Maximum size in bytes (for capped)
    # @option options [Integer] :max Maximum documents (for capped)
    # @option options [Hash] :validator Document validation rules
    # @option options [String] :validationLevel Validation level ('off', 'strict', 'moderate')
    # @option options [String] :validationAction Validation action ('error', 'warn')
    # @return [Collection]
    def create_collection(name, options = {})
      @transport.call('createCollection', @name, name, options)
      collection(name)
    end

    # Drop the database
    # @return [Boolean]
    def drop
      result = @transport.call('dropDatabase', @name)
      @collections.clear
      result
    end

    # List all collections in the database
    # @param filter [Hash] Optional filter
    # @return [Array<Hash>] Collection info
    def list_collections(filter = {})
      @transport.call('listCollections', @name, filter)
    end

    # Get all collections as Collection objects
    # @return [Array<Collection>]
    def collections
      infos = list_collections
      infos.map { |info| collection(info['name']) }
    end

    # Get collection names
    # @return [Array<String>]
    def collection_names
      list_collections.map { |info| info['name'] }
    end

    # Run a database command
    # @param command [Hash] Command to run
    # @return [Hash] Command result
    def command(command)
      @transport.call('runCommand', @name, command)
    end

    # Get database stats
    # @return [Hash] Database statistics
    def stats
      command(dbStats: 1)
    end

    # Get admin database wrapper
    # @return [AdminDb]
    def admin
      AdminDb.new(@transport)
    end

    # Rename a collection
    # @param from_name [String] Current collection name
    # @param to_name [String] New collection name
    # @param options [Hash] Options
    # @option options [Boolean] :dropTarget Drop target collection if it exists
    def rename_collection(from_name, to_name, options = {})
      @transport.call('renameCollection', @name, from_name, to_name, options)

      # Update collection cache
      coll = @collections.delete(from_name)
      @collections[to_name] = coll if coll
    end
  end

  # Admin database for administrative operations
  class AdminDb
    # Create a new AdminDb instance
    # @param transport [RpcTransport] RPC transport
    def initialize(transport)
      @transport = transport
    end

    # List all databases
    # @return [Hash] Database list with metadata
    def list_databases
      @transport.call('listDatabases')
    end

    # Get server status
    # @return [Hash] Server status
    def server_status
      @transport.call('serverStatus')
    end

    # Ping the server
    # @return [Hash] Ping response
    def ping
      @transport.call('ping')
    end

    # Run an admin command
    # @param command [Hash] Command to run
    # @return [Hash] Command result
    def command(command)
      @transport.call('adminCommand', command)
    end
  end
end
