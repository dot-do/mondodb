# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Mongo::Client do
  let(:uri) { 'mongodb://localhost:27017/testdb' }
  let(:client) { described_class.new(uri) }

  after do
    client.close if client.connected?
  end

  describe '#initialize' do
    it 'creates a client with URI' do
      expect(client).to be_a(described_class)
      expect(client).not_to be_connected
    end

    it 'creates a client with options' do
      client_with_options = described_class.new(uri, timeout: 5000, auto_reconnect: true)
      expect(client_with_options).to be_a(described_class)
    end

    it 'handles invalid URI gracefully' do
      invalid_client = described_class.new('invalid-uri')
      expect(invalid_client).to be_a(described_class)
    end
  end

  describe '#connect' do
    it 'connects to the database' do
      client.connect
      expect(client).to be_connected
    end

    it 'returns the client instance' do
      result = client.connect
      expect(result).to be(client)
    end

    it 'is idempotent' do
      client.connect
      client.connect
      expect(client).to be_connected
    end
  end

  describe '#database' do
    before { client.connect }

    it 'returns a database instance' do
      db = client.database('testdb')
      expect(db.database_name).to eq('testdb')
    end

    it 'uses default database from URI' do
      db = client.database
      expect(db.database_name).to eq('testdb')
    end

    it 'caches database instances' do
      db1 = client.database('testdb')
      db2 = client.database('testdb')
      expect(db1).to be(db2)
    end

    it 'raises if not connected' do
      new_client = described_class.new(uri)
      expect { new_client.database('test') }.to raise_error(Mongo::Error, /must be connected/)
    end

    it 'uses fallback database name when URI has no db' do
      no_db_client = described_class.new('mongodb://localhost:27017')
      no_db_client.connect
      db = no_db_client.database
      expect(db.database_name).to eq('test')
      no_db_client.close
    end
  end

  describe '#db' do
    it 'is an alias for #database' do
      client.connect
      expect(client.db('testdb')).to be_a(Mongo::Database)
    end
  end

  describe '#[]' do
    before { client.connect }

    it 'returns a collection from the default database' do
      collection = client[:users]
      expect(collection).to be_a(Mongo::Collection)
    end
  end

  describe '#close' do
    it 'closes the connection' do
      client.connect
      client.close
      expect(client).not_to be_connected
    end

    it 'is idempotent' do
      client.connect
      client.close
      client.close
      expect(client).not_to be_connected
    end

    it 'clears database cache' do
      client.connect
      client.database('testdb')
      client.close
      client.connect
      db = client.database('testdb')
      expect(db.database_name).to eq('testdb')
    end
  end

  describe '.connect' do
    it 'creates and connects a client' do
      static_client = described_class.connect(uri)
      expect(static_client).to be_connected
      static_client.close
    end
  end

  describe '#transport' do
    it 'exposes the transport' do
      client.connect
      expect(client.transport).to be_a(MongoDo::MockRpcTransport)
    end
  end

  describe '#transport=' do
    it 'allows setting custom transport' do
      custom_transport = MongoDo::MockRpcTransport.new
      client.transport = custom_transport
      expect(client.transport).to be(custom_transport)
      expect(client).to be_connected
    end
  end

  describe '#use' do
    before { client.connect }

    it 'returns a new client using the specified database' do
      new_client = client.use('other_db')
      expect(new_client.database.name).to eq('other_db')
    end
  end

  describe '.parse_connection_uri' do
    it 'parses basic URI' do
      result = described_class.parse_connection_uri('mongodb://localhost')
      expect(result[:protocol]).to eq('mongodb')
      expect(result[:host]).to eq('localhost')
      expect(result[:port]).to be_nil
      expect(result[:database]).to be_nil
    end

    it 'parses URI with port' do
      result = described_class.parse_connection_uri('mongodb://localhost:27017')
      expect(result[:host]).to eq('localhost')
      expect(result[:port]).to eq(27017)
    end

    it 'parses URI with database' do
      result = described_class.parse_connection_uri('mongodb://localhost:27017/mydb')
      expect(result[:database]).to eq('mydb')
    end

    it 'parses URI with credentials' do
      result = described_class.parse_connection_uri('mongodb://user:pass@localhost/mydb')
      expect(result[:username]).to eq('user')
      expect(result[:password]).to eq('pass')
    end

    it 'parses URI with encoded credentials' do
      result = described_class.parse_connection_uri('mongodb://user%40domain:p%40ss@localhost/mydb')
      expect(result[:username]).to eq('user@domain')
      expect(result[:password]).to eq('p@ss')
    end

    it 'parses URI with query options' do
      result = described_class.parse_connection_uri('mongodb://localhost/mydb?retryWrites=true&w=majority')
      expect(result[:options]['retryWrites']).to eq('true')
      expect(result[:options]['w']).to eq('majority')
    end

    it 'parses mongodb+srv protocol' do
      result = described_class.parse_connection_uri('mongodb+srv://cluster.example.com/mydb')
      expect(result[:protocol]).to eq('mongodb+srv')
      expect(result[:host]).to eq('cluster.example.com')
    end

    it 'raises for invalid protocol' do
      expect { described_class.parse_connection_uri('http://localhost') }.to raise_error(Mongo::Error, /Invalid MongoDB URI/)
    end

    it 'handles username without password' do
      result = described_class.parse_connection_uri('mongodb://user@localhost/mydb')
      expect(result[:username]).to eq('user')
      expect(result[:password]).to be_nil
    end

    it 'handles empty database path' do
      result = described_class.parse_connection_uri('mongodb://localhost/')
      expect(result[:database]).to be_nil
    end
  end
end
