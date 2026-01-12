# frozen_string_literal: true

module Mongo
  # Async support module for Ruby 3.2+ Fiber Scheduler
  #
  # Provides non-blocking I/O for MongoDB operations using Ruby's fiber scheduler.
  # Works with the async gem and other fiber scheduler implementations.
  #
  # @example Using with async gem
  #   require 'async'
  #   require 'mongo_do'
  #
  #   Async do
  #     client = Mongo::Client.async_connect('wss://mongo.do')
  #     users = client.database[:users]
  #
  #     # These run concurrently
  #     results = Async do |task|
  #       user_task = task.async { users.find_one(_id: '123') }
  #       count_task = task.async { users.count_documents }
  #
  #       [user_task.wait, count_task.wait]
  #     end
  #   end
  #
  # @example Parallel queries
  #   Mongo.async do |client|
  #     users, orders, products = Mongo.gather(
  #       client.db[:users].find(active: true),
  #       client.db[:orders].find(status: 'pending'),
  #       client.db[:products].find(in_stock: true)
  #     )
  #   end
  #
  module Async
    # Check if we're running in an async context
    # @return [Boolean]
    def self.available?
      # Check for Ruby 3.2+ fiber scheduler
      return true if Fiber.respond_to?(:scheduler) && Fiber.scheduler

      # Check for async gem
      begin
        require 'async'
        true
      rescue LoadError
        false
      end
    end

    # Run a block in an async context
    # @yield Block to run
    # @return [Object] Block result
    def self.run(&block)
      if Fiber.respond_to?(:scheduler) && Fiber.scheduler
        # Already in async context, just run
        block.call
      else
        # Try to use async gem
        begin
          require 'async'
          ::Async(&block)
        rescue LoadError
          # Fall back to synchronous execution
          block.call
        end
      end
    end

    # Wait for multiple async operations to complete
    # @param operations [Array] Operations to wait for
    # @return [Array] Results from all operations
    def self.gather(*operations)
      if available?
        run do
          operations.map do |op|
            case op
            when Fiber
              op.resume
            when FindCursor, AggregationCursor
              op.to_a
            else
              op
            end
          end
        end
      else
        operations.map do |op|
          case op
          when FindCursor, AggregationCursor
            op.to_a
          else
            op
          end
        end
      end
    end
  end

  # Async-aware transport that yields to the fiber scheduler
  class AsyncTransport
    include RpcTransport

    # Create a new async transport
    # @param base_transport [RpcTransport] Underlying transport
    def initialize(base_transport)
      @transport = base_transport
      @mutex = Mutex.new
    end

    # Make an async-aware RPC call
    # @param method [String] Method name
    # @param args [Array] Method arguments
    # @return [Object] Result from the RPC call
    def call(method, *args)
      if Fiber.respond_to?(:scheduler) && Fiber.scheduler
        # Yield to scheduler during I/O
        Fiber.scheduler.io_wait(Fiber.current, nil, :wait_readable)
      end

      @mutex.synchronize do
        @transport.call(method, *args)
      end
    end

    # Close the transport
    def close
      @transport.close
    end

    # Check if closed
    def closed?
      @transport.closed?
    end
  end

  # Promise class for async operations
  #
  # @example
  #   promise = users.async_find_one(_id: '123')
  #   # ... do other work ...
  #   user = promise.await
  #
  class Promise
    attr_reader :value, :error

    # Create a new Promise
    # @param block [Proc] Block to execute
    def initialize(&block)
      @resolved = false
      @value = nil
      @error = nil
      @fiber = nil
      @block = block
    end

    # Check if promise is resolved
    # @return [Boolean]
    def resolved?
      @resolved
    end

    # Check if promise succeeded
    # @return [Boolean]
    def success?
      @resolved && @error.nil?
    end

    # Check if promise failed
    # @return [Boolean]
    def failed?
      @resolved && !@error.nil?
    end

    # Start executing the promise
    # @return [self]
    def start
      return self if @fiber

      @fiber = Fiber.new do
        begin
          @value = @block.call
        rescue StandardError => e
          @error = e
        ensure
          @resolved = true
        end
      end

      @fiber.resume

      self
    end

    # Wait for the promise to resolve
    # @return [Object] The resolved value
    # @raise [StandardError] If the promise failed
    def await
      start unless @fiber

      # Resume fiber until complete
      until @resolved
        if Fiber.respond_to?(:scheduler) && Fiber.scheduler
          Fiber.scheduler.yield
        else
          @fiber.resume if @fiber.alive?
        end
      end

      raise @error if @error

      @value
    end

    alias wait await
    alias value! await

    # Chain a callback
    # @yield [value] Block called with resolved value
    # @return [Promise] New promise for chained result
    def then(&block)
      Promise.new do
        result = await
        block.call(result)
      end
    end

    # Handle errors
    # @yield [error] Block called with error
    # @return [Promise] New promise with error handling
    def catch(&block)
      Promise.new do
        begin
          await
        rescue StandardError => e
          block.call(e)
        end
      end
    end

    # Create a resolved promise
    # @param value [Object]
    # @return [Promise]
    def self.resolve(value)
      promise = new { value }
      promise.instance_variable_set(:@resolved, true)
      promise.instance_variable_set(:@value, value)
      promise
    end

    # Create a rejected promise
    # @param error [StandardError]
    # @return [Promise]
    def self.reject(error)
      promise = new { raise error }
      promise.instance_variable_set(:@resolved, true)
      promise.instance_variable_set(:@error, error)
      promise
    end

    # Wait for all promises to resolve
    # @param promises [Array<Promise>]
    # @return [Array] Values from all promises
    def self.all(*promises)
      promises.flatten.map(&:await)
    end

    # Wait for first promise to resolve
    # @param promises [Array<Promise>]
    # @return [Object] Value from first resolved promise
    def self.race(*promises)
      promises = promises.flatten
      promises.each(&:start)

      loop do
        promises.each do |p|
          return p.value if p.success?
          raise p.error if p.failed?
        end

        if Fiber.respond_to?(:scheduler) && Fiber.scheduler
          Fiber.scheduler.yield
        else
          sleep(0.001)
        end
      end
    end
  end

  # Extension methods for Collection to support async operations
  module CollectionAsync
    # Async find_one
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [Promise<Hash>]
    def async_find_one(filter = {}, options = {})
      Promise.new { find_one(filter, options) }
    end

    # Async find (returns promise of array)
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [Promise<Array>]
    def async_find(filter = {}, options = {})
      Promise.new { find(filter, options).to_a }
    end

    # Async insert_one
    # @param document [Hash] Document to insert
    # @return [Promise<InsertOneResult>]
    def async_insert_one(document)
      Promise.new { insert_one(document) }
    end

    # Async insert_many
    # @param documents [Array<Hash>] Documents to insert
    # @return [Promise<InsertManyResult>]
    def async_insert_many(documents)
      Promise.new { insert_many(documents) }
    end

    # Async update_one
    # @param filter [Hash] Query filter
    # @param update [Hash] Update operations
    # @param options [Hash] Options
    # @return [Promise<UpdateResult>]
    def async_update_one(filter, update, options = {})
      Promise.new { update_one(filter, update, options) }
    end

    # Async update_many
    # @param filter [Hash] Query filter
    # @param update [Hash] Update operations
    # @param options [Hash] Options
    # @return [Promise<UpdateResult>]
    def async_update_many(filter, update, options = {})
      Promise.new { update_many(filter, update, options) }
    end

    # Async delete_one
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [Promise<DeleteResult>]
    def async_delete_one(filter, options = {})
      Promise.new { delete_one(filter, options) }
    end

    # Async delete_many
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [Promise<DeleteResult>]
    def async_delete_many(filter, options = {})
      Promise.new { delete_many(filter, options) }
    end

    # Async count_documents
    # @param filter [Hash] Query filter
    # @param options [Hash] Options
    # @return [Promise<Integer>]
    def async_count_documents(filter = {}, options = {})
      Promise.new { count_documents(filter, options) }
    end

    # Async aggregate
    # @param pipeline [Array<Hash>] Aggregation pipeline
    # @param options [Hash] Options
    # @return [Promise<Array>]
    def async_aggregate(pipeline = [], options = {})
      Promise.new { aggregate(pipeline, options).to_a }
    end
  end

  # Extension methods for Client to support async connections
  module ClientAsync
    # Create an async-enabled connection
    # @param uri [String] MongoDB connection URI
    # @param options [Hash] Client options
    # @return [Client]
    def self.async_connect(uri, options = {})
      client = Client.new(uri, options)
      client.connect

      # Wrap transport in async transport
      if client.instance_variable_get(:@transport)
        async_transport = AsyncTransport.new(client.instance_variable_get(:@transport))
        client.instance_variable_set(:@transport, async_transport)
      end

      client
    end
  end

  # Include async support in classes
  class Collection
    include CollectionAsync
  end

  class Client
    extend ClientAsync
  end

  # Module-level async helpers
  class << self
    # Run a block in an async context with a MongoDB connection
    # @param uri [String] MongoDB connection URI
    # @param options [Hash] Client options
    # @yield [client] Block with connected client
    # @return [Object] Block result
    #
    # @example
    #   Mongo.async('wss://mongo.do') do |client|
    #     users = client.db[:users]
    #     users.find(active: true).to_a
    #   end
    #
    def async(uri = nil, options = {}, &block)
      Async.run do
        if uri
          client = Client.async_connect(uri, options)
          begin
            block.call(client)
          ensure
            client.close
          end
        else
          block.call
        end
      end
    end

    # Wait for multiple async operations
    # @param operations [Array] Operations to wait for
    # @return [Array] Results
    def gather(*operations)
      Async.gather(*operations)
    end
  end
end
