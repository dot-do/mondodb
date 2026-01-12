# frozen_string_literal: true

module Mongo
  # Natural Language Query interface for Mongo.do
  #
  # Allows querying MongoDB using natural language descriptions that are
  # translated to MongoDB queries by AI on the server side.
  #
  # @example Basic natural language queries
  #   users.ask('find all active users')
  #   users.ask('get users older than 30 who live in NYC')
  #   users.ask('count orders from last week')
  #
  # @example With context
  #   users.ask('find users similar to this one', context: { user_id: '123' })
  #
  # @example Aggregation queries
  #   orders.ask('what is the average order value by country?')
  #   products.ask('show top 10 selling products')
  #
  module NaturalQuery
    # Result of a natural language query
    class QueryResult
      attr_reader :data, :query, :explanation, :metadata

      # Create a new QueryResult
      # @param result [Hash] Raw result from server
      def initialize(result)
        @data = result['data'] || result['result'] || []
        @query = result['query'] || result['generatedQuery']
        @explanation = result['explanation']
        @metadata = result['metadata'] || {}
      end

      # Get the generated MongoDB query
      # @return [Hash, nil]
      def generated_query
        @query
      end

      # Check if query was successful
      # @return [Boolean]
      def success?
        !@data.nil?
      end

      # Iterate over results
      def each(&block)
        return enum_for(:each) unless block_given?

        @data.each(&block)
      end

      # Convert to array
      # @return [Array]
      def to_a
        @data.to_a
      end

      # Get first result
      def first
        @data.is_a?(Array) ? @data.first : @data
      end

      # Get result count
      def count
        @data.is_a?(Array) ? @data.count : 1
      end

      alias size count
      alias length count

      # Check if empty
      def empty?
        @data.nil? || (@data.is_a?(Array) && @data.empty?)
      end

      # Inspect string
      def inspect
        "#<QueryResult count=#{count} query=#{@query.inspect}>"
      end
    end

    # Query options for natural language queries
    class QueryOptions
      attr_accessor :limit, :explain, :context, :schema_hints, :language

      def initialize(options = {})
        @limit = options[:limit]
        @explain = options[:explain] || false
        @context = options[:context] || {}
        @schema_hints = options[:schema_hints] || []
        @language = options[:language] || 'en'
      end

      # Convert to hash for RPC
      def to_h
        {
          'limit' => @limit,
          'explain' => @explain,
          'context' => @context,
          'schemaHints' => @schema_hints,
          'language' => @language
        }.compact
      end
    end
  end

  # Extension methods for Collection to support natural language queries
  module CollectionNaturalQuery
    # Query the collection using natural language
    #
    # @param question [String] Natural language question/query
    # @param options [Hash] Query options
    # @option options [Integer] :limit Maximum results to return
    # @option options [Boolean] :explain Include explanation of generated query
    # @option options [Hash] :context Additional context for the query
    # @option options [Array<String>] :schema_hints Hints about the schema
    # @option options [String] :language Language of the question (default: 'en')
    # @return [NaturalQuery::QueryResult]
    #
    # @example Simple query
    #   users.ask('find all users named John')
    #
    # @example With options
    #   users.ask('find recent orders', limit: 10, explain: true)
    #
    # @example With context
    #   users.ask('find similar users', context: { user_id: current_user.id })
    #
    def ask(question, options = {})
      opts = NaturalQuery::QueryOptions.new(options)

      result = @transport.call(
        'naturalQuery',
        @database_name,
        @name,
        question,
        opts.to_h
      )

      NaturalQuery::QueryResult.new(result)
    end

    # Alias for ask - more conversational
    alias query_with ask
    alias find_by_description ask

    # Explain how a natural language query would be executed
    #
    # @param question [String] Natural language question
    # @return [Hash] Query plan and explanation
    #
    # @example
    #   explanation = users.explain_query('find active premium users')
    #   puts explanation['generatedQuery']  # The MongoDB query
    #   puts explanation['explanation']     # Natural language explanation
    #
    def explain_query(question, options = {})
      opts = NaturalQuery::QueryOptions.new(options.merge(explain: true))

      @transport.call(
        'explainNaturalQuery',
        @database_name,
        @name,
        question,
        opts.to_h
      )
    end

    # Suggest natural language queries based on schema
    #
    # @param partial [String, nil] Partial query for autocomplete
    # @return [Array<String>] Suggested queries
    #
    # @example
    #   suggestions = users.suggest_queries
    #   # => ["find all users", "find users by email", "count active users", ...]
    #
    def suggest_queries(partial = nil)
      @transport.call(
        'suggestQueries',
        @database_name,
        @name,
        partial
      )
    end
  end

  # Extension methods for Database to support natural language queries
  module DatabaseNaturalQuery
    # Query across database using natural language
    #
    # @param question [String] Natural language question
    # @param options [Hash] Query options
    # @return [NaturalQuery::QueryResult]
    #
    # @example
    #   db.ask('how many orders were placed last month?')
    #
    def ask(question, options = {})
      opts = NaturalQuery::QueryOptions.new(options)

      result = @transport.call(
        'naturalQuery',
        @name,
        nil,
        question,
        opts.to_h
      )

      NaturalQuery::QueryResult.new(result)
    end

    alias query_with ask

    # Suggest which collection to query based on the question
    #
    # @param question [String] Natural language question
    # @return [Hash] Suggested collection and confidence
    #
    def suggest_collection(question)
      @transport.call(
        'suggestCollection',
        @name,
        question
      )
    end
  end

  # Include natural language support in classes
  class Collection
    include CollectionNaturalQuery
  end

  class Database
    include DatabaseNaturalQuery
  end
end
