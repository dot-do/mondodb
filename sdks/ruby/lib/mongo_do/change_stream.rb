# frozen_string_literal: true

module Mongo
  # Change Stream - watches for changes in a collection, database, or cluster
  #
  # Change streams provide a unified interface to watch for real-time changes.
  # They automatically resume from the last received token on connection issues.
  #
  # @example Watch a collection
  #   users.watch.each do |change|
  #     puts "#{change['operationType']}: #{change['fullDocument']}"
  #   end
  #
  # @example Watch with pipeline
  #   users.watch([{ '$match' => { 'operationType' => 'insert' } }]).each do |change|
  #     puts "New user: #{change['fullDocument']}"
  #   end
  #
  # @example Watch with options
  #   users.watch(
  #     full_document: 'updateLookup',
  #     max_await_time_ms: 5000
  #   ).each { |change| process(change) }
  #
  class ChangeStream
    include Enumerable

    # Operation types
    OPERATIONS = %w[insert update replace delete invalidate drop rename dropDatabase].freeze

    # Create a new ChangeStream
    # @param transport [RpcTransport] RPC transport
    # @param db_name [String, nil] Database name (nil for cluster-wide)
    # @param collection_name [String, nil] Collection name (nil for database-wide)
    # @param pipeline [Array<Hash>] Additional aggregation pipeline stages
    # @param options [Hash] Watch options
    # @option options [String] :full_document 'default', 'updateLookup', 'whenAvailable', 'required'
    # @option options [String] :full_document_before_change 'off', 'whenAvailable', 'required'
    # @option options [Integer] :batch_size Batch size for cursor
    # @option options [Integer] :max_await_time_ms Maximum time to wait for changes
    # @option options [Hash] :resume_after Resume token
    # @option options [Hash] :start_after Start after token
    # @option options [Time] :start_at_operation_time Start at specific time
    # @option options [Boolean] :show_expanded_events Show expanded events
    def initialize(transport, db_name = nil, collection_name = nil, pipeline = [], options = {})
      @transport = transport
      @db_name = db_name
      @collection_name = collection_name
      @pipeline = pipeline
      @options = normalize_options(options)
      @resume_token = nil
      @closed = false
      @buffer = []
      @position = 0
    end

    # Check if the stream is closed
    # @return [Boolean]
    def closed?
      @closed
    end

    # Get the current resume token
    # @return [Hash, nil]
    def resume_token
      @resume_token
    end

    # Get the next change document
    # @return [Hash, nil]
    def next
      return nil if @closed

      ensure_buffer

      return nil if @position >= @buffer.length

      change = @buffer[@position]
      @position += 1

      # Update resume token
      @resume_token = change['_id'] if change['_id']

      change
    end

    # Check if there's a next change available
    # @return [Boolean]
    def has_next?
      return false if @closed

      ensure_buffer
      @position < @buffer.length
    end

    # Iterate over all changes
    # @yield [change] Block called for each change
    # @yieldparam change [Hash] Change document
    def each(&block)
      return enum_for(:each) unless block_given?
      return if @closed

      loop do
        change = self.next
        break if change.nil? && @closed

        yield change if change
      end
    end

    # Try to get the next change without blocking
    # @return [Hash, nil]
    def try_next
      return nil if @closed

      # Only return buffered changes, don't fetch more
      return nil if @position >= @buffer.length

      change = @buffer[@position]
      @position += 1
      @resume_token = change['_id'] if change['_id']
      change
    end

    # Close the change stream
    def close
      return if @closed

      @closed = true
      @buffer.clear
    end

    # Convert to array (consumes the stream)
    # @param limit [Integer, nil] Maximum changes to collect
    # @return [Array<Hash>]
    def to_a(limit = nil)
      result = []
      count = 0

      each do |change|
        result << change
        count += 1
        break if limit && count >= limit
      end

      result
    end

    private

    # Normalize options hash
    def normalize_options(options)
      opts = {}

      # Convert Ruby naming to MongoDB naming
      opts['fullDocument'] = options[:full_document] if options[:full_document]
      opts['fullDocumentBeforeChange'] = options[:full_document_before_change] if options[:full_document_before_change]
      opts['batchSize'] = options[:batch_size] if options[:batch_size]
      opts['maxAwaitTimeMS'] = options[:max_await_time_ms] if options[:max_await_time_ms]
      opts['resumeAfter'] = options[:resume_after] if options[:resume_after]
      opts['startAfter'] = options[:start_after] if options[:start_after]
      opts['showExpandedEvents'] = options[:show_expanded_events] if options[:show_expanded_events]

      if options[:start_at_operation_time]
        time = options[:start_at_operation_time]
        opts['startAtOperationTime'] = { 't' => time.to_i, 'i' => 0 }
      end

      opts
    end

    # Ensure buffer has data
    def ensure_buffer
      return if @position < @buffer.length

      fetch_changes
    end

    # Fetch changes from server
    def fetch_changes
      return if @closed

      # Build watch options
      watch_options = @options.dup

      # Use resume token if we have one
      watch_options['resumeAfter'] = @resume_token if @resume_token && !watch_options['resumeAfter']

      # Make RPC call
      result = @transport.call(
        'watch',
        @db_name,
        @collection_name,
        @pipeline,
        watch_options
      )

      @buffer = result || []
      @position = 0
    rescue TransportClosedError
      @closed = true
      @buffer = []
    rescue ConnectionError
      # Try to resume on next iteration
      @buffer = []
    end
  end

  # Extension methods for Collection to support change streams
  module ChangeStreamSupport
    # Watch for changes in the collection
    # @param pipeline [Array<Hash>] Additional aggregation pipeline stages
    # @param options [Hash] Watch options (see ChangeStream#initialize)
    # @return [ChangeStream]
    def watch(pipeline = [], options = {})
      ChangeStream.new(@transport, @database_name, @name, pipeline, options)
    end
  end

  # Extension methods for Database to support change streams
  module DatabaseChangeStreamSupport
    # Watch for changes in the database
    # @param pipeline [Array<Hash>] Additional aggregation pipeline stages
    # @param options [Hash] Watch options (see ChangeStream#initialize)
    # @return [ChangeStream]
    def watch(pipeline = [], options = {})
      ChangeStream.new(@transport, @name, nil, pipeline, options)
    end
  end

  # Extension methods for Client to support change streams
  module ClientChangeStreamSupport
    # Watch for changes across the cluster
    # @param pipeline [Array<Hash>] Additional aggregation pipeline stages
    # @param options [Hash] Watch options (see ChangeStream#initialize)
    # @return [ChangeStream]
    def watch(pipeline = [], options = {})
      ChangeStream.new(@transport, nil, nil, pipeline, options)
    end
  end

  # Include change stream support in respective classes
  class Collection
    include ChangeStreamSupport
  end

  class Database
    include DatabaseChangeStreamSupport
  end

  class Client
    include ClientChangeStreamSupport
  end
end
