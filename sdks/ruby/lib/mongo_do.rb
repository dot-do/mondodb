# frozen_string_literal: true

require 'json'
require 'time'
require 'uri'

require_relative 'mongo_do/version'
require_relative 'mongo_do/errors'
require_relative 'mongo_do/bson'
require_relative 'mongo_do/transport'
require_relative 'mongo_do/http_transport'
require_relative 'mongo_do/websocket_transport'
require_relative 'mongo_do/cursor'
require_relative 'mongo_do/collection'
require_relative 'mongo_do/database'
require_relative 'mongo_do/client'
require_relative 'mongo_do/change_stream'
require_relative 'mongo_do/natural_query'
require_relative 'mongo_do/async'

# MongoDo - MongoDB SDK for the DotDo platform
#
# MongoDB-compatible Ruby SDK built on RPC with promise pipelining,
# natural language queries, and zero infrastructure.
#
# @example Basic usage
#   require 'mongo_do'
#
#   client = Mongo::Client.new('mongodb://localhost/mydb')
#   db = client.database
#   users = db[:users]
#
#   users.insert_one(name: 'John', email: 'john@example.com')
#   users.find(status: 'active').each { |doc| puts doc }
#   users.update_one({ _id: id }, '$set' => { name: 'Jane' })
#   users.delete_one(_id: id)
#
#   client.close
#
# @example Production usage with HTTP transport
#   client = Mongo::Client.new('https://mongo.do/mydb', token: 'your-api-token')
#
# @example WebSocket for real-time
#   client = Mongo::Client.new('wss://mongo.do/mydb', transport: :websocket)
#
# @example Natural language queries
#   users.ask('find all active premium users')
#
# @example Change streams
#   users.watch.each { |change| process(change) }
#
# @example Async operations (Ruby 3.2+)
#   Mongo.async('wss://mongo.do') do |client|
#     users, orders = Mongo.gather(
#       client.db[:users].async_find(active: true),
#       client.db[:orders].async_find(status: 'pending')
#     )
#   end
#
module Mongo
  # Module-level configuration
  class << self
    attr_accessor :default_transport_class, :default_url

    # Configure the Mongo module
    # @yield [config] Configuration block
    # @example
    #   Mongo.configure do |config|
    #     config.default_url = 'wss://mongo.do'
    #     config.default_transport_class = MongoDo::HttpRpcTransport
    #   end
    def configure
      yield self if block_given?
    end
  end

  # Set default transport (use mock for development, HTTP/WebSocket for production)
  self.default_transport_class = MongoDo::MockRpcTransport
  self.default_url = nil
end

# Also expose as MongoDo for explicit usage
MongoDo = Mongo
