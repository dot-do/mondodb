# frozen_string_literal: true

module Mongo
  # Abstract cursor providing iteration methods
  #
  # @example Iteration
  #   cursor = collection.find(status: 'active')
  #
  #   # Block iteration
  #   cursor.each { |doc| puts doc }
  #
  #   # Enumerable methods
  #   cursor.map { |doc| doc['name'] }
  #   cursor.select { |doc| doc['age'] > 21 }
  #
  #   # Array conversion
  #   docs = cursor.to_a
  #
  #   # Single document access
  #   first_doc = cursor.first
  #   next_doc = cursor.next
  #
  class AbstractCursor
    include Enumerable

    def initialize
      @buffer = []
      @position = 0
      @fetched = false
      @closed = false
    end

    # Check if the cursor is closed
    # @return [Boolean]
    def closed?
      @closed
    end

    # Fetch data from the server - must be implemented by subclasses
    # @return [Array<Hash>]
    def fetch_data
      raise NotImplementedError, 'Subclasses must implement #fetch_data'
    end

    # Ensure data has been fetched
    def ensure_fetched
      return if @fetched || @closed

      @buffer = fetch_data
      @fetched = true
    end

    # Get the next document
    # @return [Hash, nil]
    def next
      return nil if @closed

      ensure_fetched
      return nil if @position >= @buffer.length

      doc = @buffer[@position]
      @position += 1
      doc
    end

    # Check if there are more documents
    # @return [Boolean]
    def has_next?
      return false if @closed

      ensure_fetched
      @position < @buffer.length
    end

    # Get all remaining documents as an array
    # @return [Array<Hash>]
    def to_a
      return [] if @closed

      ensure_fetched
      remaining = @buffer[@position..]
      @position = @buffer.length
      close
      remaining
    end

    alias to_ary to_a

    # Iterate over all documents with a block
    # @yield [doc] Block called for each document
    # @yieldparam doc [Hash] Document
    # @return [self]
    def each(&block)
      return enum_for(:each) unless block_given?
      return if @closed

      ensure_fetched
      while @position < @buffer.length
        doc = @buffer[@position]
        @position += 1
        result = yield doc
        break if result == false
      end
      self
    end

    # Get the first document
    # @return [Hash, nil]
    def first
      ensure_fetched
      @buffer.first
    end

    # Get the count of remaining documents
    # @return [Integer]
    def count
      ensure_fetched
      @buffer.length - @position
    end

    alias size count
    alias length count

    # Close the cursor
    def close
      return if @closed

      @closed = true
      @buffer = []
      @position = 0
    end
  end

  # Find cursor with fluent query building
  #
  # @example Fluent API
  #   collection.find(status: 'active')
  #     .sort(created_at: -1)
  #     .limit(10)
  #     .skip(20)
  #     .project(name: 1, email: 1)
  #     .each { |doc| puts doc }
  #
  class FindCursor < AbstractCursor
    # Create a new FindCursor
    # @param transport [RpcTransport] RPC transport
    # @param db_name [String] Database name
    # @param collection_name [String] Collection name
    # @param filter [Hash] Query filter
    def initialize(transport, db_name, collection_name, filter = {})
      super()
      @transport = transport
      @db_name = db_name
      @collection_name = collection_name
      @filter = filter
      @options = {}
    end

    # Set sort order
    # @param spec [Hash] Sort specification (field => 1 or -1)
    # @return [self]
    def sort(spec)
      @options[:sort] = spec
      self
    end

    # Limit the number of results
    # @param count [Integer] Maximum documents
    # @return [self]
    def limit(count)
      raise ArgumentError, 'Limit must be non-negative' if count.negative?

      @options[:limit] = count
      self
    end

    # Skip a number of results
    # @param count [Integer] Documents to skip
    # @return [self]
    def skip(count)
      raise ArgumentError, 'Skip must be non-negative' if count.negative?

      @options[:skip] = count
      self
    end

    # Set projection (fields to include/exclude)
    # @param spec [Hash] Projection specification
    # @return [self]
    def project(spec)
      @options[:projection] = spec
      self
    end

    alias projection project

    # Set batch size
    # @param size [Integer] Batch size
    # @return [self]
    def batch_size(size)
      @options[:batch_size] = size
      self
    end

    # Set max time
    # @param ms [Integer] Maximum time in milliseconds
    # @return [self]
    def max_time_ms(ms)
      @options[:max_time_ms] = ms
      self
    end

    # Set query hint
    # @param hint [String, Hash] Index hint
    # @return [self]
    def hint(hint)
      @options[:hint] = hint
      self
    end

    # Set query comment
    # @param comment [String] Comment
    # @return [self]
    def comment(comment)
      @options[:comment] = comment
      self
    end

    # Fetch data from the server
    # @return [Array<Hash>]
    def fetch_data
      @transport.call('find', @db_name, @collection_name, @filter, @options) || []
    end

    # Clone the cursor with current options
    # @return [FindCursor]
    def clone
      cursor = FindCursor.new(@transport, @db_name, @collection_name, @filter)
      cursor.instance_variable_set(:@options, @options.dup)
      cursor
    end

    # Rewind the cursor to the beginning
    def rewind
      @position = 0
      @fetched = false
      @closed = false
    end
  end

  # Aggregation cursor for pipeline results
  #
  # @example Aggregation pipeline
  #   collection.aggregate([
  #     { '$match' => { status: 'active' } },
  #     { '$group' => { _id: '$category', count: { '$sum' => 1 } } },
  #     { '$sort' => { count: -1 } }
  #   ]).each { |doc| puts doc }
  #
  class AggregationCursor < AbstractCursor
    # Create a new AggregationCursor
    # @param transport [RpcTransport] RPC transport
    # @param db_name [String] Database name
    # @param collection_name [String] Collection name
    # @param pipeline [Array<Hash>] Aggregation pipeline
    # @param options [Hash] Aggregation options
    def initialize(transport, db_name, collection_name, pipeline = [], options = {})
      super()
      @transport = transport
      @db_name = db_name
      @collection_name = collection_name
      @pipeline = pipeline
      @options = options
    end

    # Fetch data from the server
    # @return [Array<Hash>]
    def fetch_data
      @transport.call('aggregate', @db_name, @collection_name, @pipeline, @options) || []
    end
  end
end
