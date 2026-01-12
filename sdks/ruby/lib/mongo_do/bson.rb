# frozen_string_literal: true

require 'securerandom'
require 'time'

module Mongo
  # MongoDB ObjectId implementation
  #
  # ObjectId is a 12-byte identifier typically represented as a 24-character hex string.
  # Format: 4-byte timestamp + 5-byte random + 3-byte counter
  #
  # @example Creating ObjectIds
  #   oid = ObjectId.new                    # Generate new ObjectId
  #   oid = ObjectId.from_string('507f...')  # From hex string
  #   oid = ObjectId.from_time(Time.now)     # From timestamp
  #
  # @example Using ObjectIds
  #   oid.to_s         # => "507f1f77bcf86cd799439011"
  #   oid.timestamp    # => 2024-01-01 12:00:00 UTC
  #   oid == other_oid # => true/false
  #
  class ObjectId
    include Comparable

    # Machine identifier (random 5 bytes, generated once per process)
    @machine_id = SecureRandom.random_bytes(5)

    # Counter (starts random, increments per ObjectId)
    @counter = SecureRandom.random_bytes(3).unpack1('N') & 0xFFFFFF

    # Mutex for counter increment
    @counter_mutex = Mutex.new

    class << self
      attr_reader :machine_id

      # Get and increment counter
      def next_counter
        @counter_mutex.synchronize do
          counter = @counter
          @counter = (@counter + 1) & 0xFFFFFF
          counter
        end
      end

      # Create ObjectId from hex string
      # @param hex [String] 24-character hex string
      # @return [ObjectId]
      def from_string(hex)
        raise ArgumentError, 'Invalid ObjectId string' unless hex.is_a?(String) && hex.match?(/\A[0-9a-f]{24}\z/i)

        bytes = [hex].pack('H*')
        new(bytes)
      end

      # Create ObjectId from timestamp
      # @param time [Time] Timestamp
      # @return [ObjectId]
      def from_time(time)
        timestamp = [time.to_i].pack('N')
        random = SecureRandom.random_bytes(8)
        new(timestamp + random)
      end

      # Check if a string is a valid ObjectId
      # @param string [String] String to check
      # @return [Boolean]
      def valid?(string)
        string.is_a?(String) && string.match?(/\A[0-9a-f]{24}\z/i)
      end
    end

    attr_reader :bytes

    # Create a new ObjectId
    # @param bytes [String, nil] 12-byte string, or nil to generate new
    def initialize(bytes = nil)
      if bytes
        raise ArgumentError, 'ObjectId must be 12 bytes' unless bytes.bytesize == 12

        @bytes = bytes.dup.force_encoding('BINARY')
      else
        @bytes = generate_bytes
      end
    end

    # Get timestamp from ObjectId
    # @return [Time]
    def timestamp
      Time.at(@bytes[0, 4].unpack1('N')).utc
    end

    alias generation_time timestamp

    # Convert to hex string
    # @return [String]
    def to_s
      @bytes.unpack1('H*')
    end

    alias to_str to_s

    # Convert to JSON representation
    # @return [Hash]
    def as_json(_options = nil)
      { '$oid' => to_s }
    end

    # Convert to JSON string
    # @return [String]
    def to_json(*args)
      as_json.to_json(*args)
    end

    # Equality comparison
    # @param other [Object]
    # @return [Boolean]
    def ==(other)
      return false unless other.is_a?(ObjectId)

      @bytes == other.bytes
    end

    alias eql? ==

    # Hash for use in Hash keys
    # @return [Integer]
    def hash
      @bytes.hash
    end

    # Comparison for sorting
    # @param other [ObjectId]
    # @return [Integer, nil]
    def <=>(other)
      return nil unless other.is_a?(ObjectId)

      @bytes <=> other.bytes
    end

    # Inspect string
    # @return [String]
    def inspect
      "ObjectId('#{self}')"
    end

    private

    # Generate 12 bytes for new ObjectId
    def generate_bytes
      timestamp = [Time.now.to_i].pack('N')
      machine = self.class.machine_id
      counter = [self.class.next_counter].pack('N')[1, 3]

      (timestamp + machine + counter).force_encoding('BINARY')
    end
  end

  # MongoDB Timestamp type (used for replication oplog)
  #
  # Timestamp is a special BSON type with seconds and increment components.
  # Different from Date/Time - used internally by MongoDB.
  #
  # @example
  #   ts = Timestamp.new(1234567890, 1)
  #   ts.seconds    # => 1234567890
  #   ts.increment  # => 1
  #
  class Timestamp
    include Comparable

    attr_reader :seconds, :increment

    # Create a new Timestamp
    # @param seconds [Integer] Seconds since epoch
    # @param increment [Integer] Increment within second
    def initialize(seconds, increment)
      @seconds = seconds.to_i
      @increment = increment.to_i
    end

    # Create from Time
    # @param time [Time]
    # @param increment [Integer]
    # @return [Timestamp]
    def self.from_time(time, increment = 0)
      new(time.to_i, increment)
    end

    # Convert to Time
    # @return [Time]
    def to_time
      Time.at(@seconds).utc
    end

    # Equality comparison
    # @param other [Object]
    # @return [Boolean]
    def ==(other)
      return false unless other.is_a?(Timestamp)

      @seconds == other.seconds && @increment == other.increment
    end

    alias eql? ==

    # Hash for use in Hash keys
    # @return [Integer]
    def hash
      [@seconds, @increment].hash
    end

    # Comparison for sorting
    # @param other [Timestamp]
    # @return [Integer, nil]
    def <=>(other)
      return nil unless other.is_a?(Timestamp)

      result = @seconds <=> other.seconds
      result.zero? ? @increment <=> other.increment : result
    end

    # Convert to JSON representation
    # @return [Hash]
    def as_json(_options = nil)
      { '$timestamp' => { 't' => @seconds, 'i' => @increment } }
    end

    # Convert to JSON string
    # @return [String]
    def to_json(*args)
      as_json.to_json(*args)
    end

    # Inspect string
    # @return [String]
    def inspect
      "Timestamp(#{@seconds}, #{@increment})"
    end
  end

  # MongoDB Binary data type
  #
  # @example
  #   bin = Binary.new("\x00\x01\x02", :generic)
  #   bin = Binary.new(uuid_bytes, :uuid)
  #
  class Binary
    SUBTYPES = {
      generic: 0x00,
      function: 0x01,
      old_binary: 0x02,
      uuid_old: 0x03,
      uuid: 0x04,
      md5: 0x05,
      encrypted: 0x06,
      user: 0x80
    }.freeze

    attr_reader :data, :subtype

    # Create a new Binary
    # @param data [String] Binary data
    # @param subtype [Symbol, Integer] Subtype
    def initialize(data, subtype = :generic)
      @data = data.dup.force_encoding('BINARY')
      @subtype = subtype.is_a?(Symbol) ? SUBTYPES[subtype] : subtype
    end

    # Create Binary from Base64
    # @param base64 [String]
    # @param subtype [Symbol, Integer]
    # @return [Binary]
    def self.from_base64(base64, subtype = :generic)
      require 'base64'
      new(Base64.decode64(base64), subtype)
    end

    # Convert to Base64
    # @return [String]
    def to_base64
      require 'base64'
      Base64.strict_encode64(@data)
    end

    # Equality comparison
    def ==(other)
      return false unless other.is_a?(Binary)

      @data == other.data && @subtype == other.subtype
    end

    alias eql? ==

    # Hash
    def hash
      [@data, @subtype].hash
    end

    # Convert to JSON representation
    def as_json(_options = nil)
      {
        '$binary' => {
          'base64' => to_base64,
          'subType' => format('%02x', @subtype)
        }
      }
    end

    def to_json(*args)
      as_json.to_json(*args)
    end

    def inspect
      "Binary('#{to_base64}', #{@subtype})"
    end
  end

  # MongoDB Decimal128 type for high-precision decimals
  #
  # @example
  #   d = Decimal128.new('123.456')
  #   d = Decimal128.from_string('1.23E+10')
  #
  class Decimal128
    attr_reader :value

    # Create a new Decimal128
    # @param value [String, Numeric] Decimal value
    def initialize(value)
      @value = value.to_s
    end

    # Create from string
    # @param string [String]
    # @return [Decimal128]
    def self.from_string(string)
      new(string)
    end

    # Convert to BigDecimal
    # @return [BigDecimal]
    def to_d
      require 'bigdecimal'
      BigDecimal(@value)
    end

    # Convert to Float (with potential precision loss)
    # @return [Float]
    def to_f
      @value.to_f
    end

    # Convert to string
    # @return [String]
    def to_s
      @value
    end

    # Equality comparison
    def ==(other)
      return false unless other.is_a?(Decimal128)

      @value == other.value
    end

    alias eql? ==

    def hash
      @value.hash
    end

    def as_json(_options = nil)
      { '$numberDecimal' => @value }
    end

    def to_json(*args)
      as_json.to_json(*args)
    end

    def inspect
      "Decimal128('#{@value}')"
    end
  end

  # MongoDB MinKey type (sorts before all other values)
  class MinKey
    def self.instance
      @instance ||= new
    end

    def ==(other)
      other.is_a?(MinKey)
    end

    alias eql? ==

    def hash
      self.class.hash
    end

    def as_json(_options = nil)
      { '$minKey' => 1 }
    end

    def to_json(*args)
      as_json.to_json(*args)
    end

    def inspect
      'MinKey()'
    end
  end

  # MongoDB MaxKey type (sorts after all other values)
  class MaxKey
    def self.instance
      @instance ||= new
    end

    def ==(other)
      other.is_a?(MaxKey)
    end

    alias eql? ==

    def hash
      self.class.hash
    end

    def as_json(_options = nil)
      { '$maxKey' => 1 }
    end

    def to_json(*args)
      as_json.to_json(*args)
    end

    def inspect
      'MaxKey()'
    end
  end

  # MongoDB Regular Expression type with options
  class Regex
    attr_reader :pattern, :options

    # Create a new Regex
    # @param pattern [String] Regular expression pattern
    # @param options [String] Options (i, m, x, s)
    def initialize(pattern, options = '')
      @pattern = pattern
      @options = options.to_s
    end

    # Convert to Ruby Regexp
    # @return [Regexp]
    def to_regexp
      opts = 0
      opts |= Regexp::IGNORECASE if @options.include?('i')
      opts |= Regexp::MULTILINE if @options.include?('m')
      opts |= Regexp::EXTENDED if @options.include?('x')
      Regexp.new(@pattern, opts)
    end

    def ==(other)
      return false unless other.is_a?(Regex)

      @pattern == other.pattern && @options == other.options
    end

    alias eql? ==

    def hash
      [@pattern, @options].hash
    end

    def as_json(_options = nil)
      { '$regularExpression' => { 'pattern' => @pattern, 'options' => @options } }
    end

    def to_json(*args)
      as_json.to_json(*args)
    end

    def inspect
      "Regex(#{@pattern.inspect}, #{@options.inspect})"
    end
  end

  # Helper module for BSON serialization
  module BSON
    class << self
      # Serialize a Ruby value to BSON-compatible JSON
      # @param value [Object]
      # @return [Object]
      def serialize(value)
        case value
        when ObjectId, Timestamp, Binary, Decimal128, MinKey, MaxKey, Regex
          value.as_json
        when Time
          { '$date' => value.iso8601(3) }
        when ::Regexp
          { '$regularExpression' => { 'pattern' => value.source, 'options' => regexp_options(value) } }
        when Hash
          value.transform_keys(&:to_s).transform_values { |v| serialize(v) }
        when Array
          value.map { |v| serialize(v) }
        when Symbol
          value.to_s
        else
          value
        end
      end

      # Deserialize BSON-compatible JSON to Ruby values
      # @param value [Object]
      # @return [Object]
      def deserialize(value)
        case value
        when Hash
          deserialize_hash(value)
        when Array
          value.map { |v| deserialize(v) }
        else
          value
        end
      end

      private

      # Deserialize a hash (checking for extended JSON types)
      def deserialize_hash(hash)
        if hash.key?('$oid')
          ObjectId.from_string(hash['$oid'])
        elsif hash.key?('$date')
          Time.parse(hash['$date'])
        elsif hash.key?('$timestamp')
          ts = hash['$timestamp']
          Timestamp.new(ts['t'], ts['i'])
        elsif hash.key?('$binary')
          bin = hash['$binary']
          Binary.from_base64(bin['base64'], bin['subType'].to_i(16))
        elsif hash.key?('$numberDecimal')
          Decimal128.new(hash['$numberDecimal'])
        elsif hash.key?('$minKey')
          MinKey.instance
        elsif hash.key?('$maxKey')
          MaxKey.instance
        elsif hash.key?('$regularExpression')
          re = hash['$regularExpression']
          Regex.new(re['pattern'], re['options'])
        else
          hash.transform_values { |v| deserialize(v) }
        end
      end

      # Get Regexp options as string
      def regexp_options(regexp)
        opts = ''
        opts += 'i' if (regexp.options & Regexp::IGNORECASE).positive?
        opts += 'm' if (regexp.options & Regexp::MULTILINE).positive?
        opts += 'x' if (regexp.options & Regexp::EXTENDED).positive?
        opts
      end
    end
  end
end
