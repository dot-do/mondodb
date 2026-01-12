# frozen_string_literal: true

require 'spec_helper'

RSpec.describe MongoDo::MockRpcTransport do
  let(:transport) { described_class.new }

  after do
    transport.close
  end

  describe '#call' do
    it 'tracks call log' do
      transport.call('connect', 'mongodb://localhost')
      transport.call('ping')

      expect(transport.call_log.length).to eq(2)
      expect(transport.call_log[0][:method]).to eq('connect')
      expect(transport.call_log[1][:method]).to eq('ping')
    end

    it 'raises when closed' do
      transport.close
      expect { transport.call('ping') }.to raise_error(Mongo::TransportClosedError)
    end

    it 'raises for unknown method' do
      expect { transport.call('unknownMethod') }.to raise_error(Mongo::UnknownMethodError)
    end
  end

  describe '#clear_call_log' do
    it 'clears the call log' do
      transport.call('ping')
      transport.clear_call_log
      expect(transport.call_log).to be_empty
    end
  end

  describe '#close' do
    it 'marks transport as closed' do
      expect(transport).not_to be_closed
      transport.close
      expect(transport).to be_closed
    end
  end

  describe 'filter operations' do
    before do
      transport.call('insertMany', 'db', 'coll', [
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 30, status: 'inactive' },
        { name: 'Charlie', age: 35, status: 'active' }
      ])
    end

    describe '$eq operator' do
      it 'matches equal values' do
        results = transport.call('find', 'db', 'coll', { age: { '$eq' => 30 } })
        expect(results.length).to eq(1)
        expect(results.first['name']).to eq('Bob')
      end
    end

    describe '$ne operator' do
      it 'matches not equal values' do
        results = transport.call('find', 'db', 'coll', { status: { '$ne' => 'active' } })
        expect(results.length).to eq(1)
        expect(results.first['name']).to eq('Bob')
      end
    end

    describe '$gt/$gte/$lt/$lte operators' do
      it 'matches greater than' do
        results = transport.call('find', 'db', 'coll', { age: { '$gt' => 30 } })
        expect(results.length).to eq(1)
      end

      it 'matches greater than or equal' do
        results = transport.call('find', 'db', 'coll', { age: { '$gte' => 30 } })
        expect(results.length).to eq(2)
      end

      it 'matches less than' do
        results = transport.call('find', 'db', 'coll', { age: { '$lt' => 30 } })
        expect(results.length).to eq(1)
      end

      it 'matches less than or equal' do
        results = transport.call('find', 'db', 'coll', { age: { '$lte' => 30 } })
        expect(results.length).to eq(2)
      end
    end

    describe '$in/$nin operators' do
      it 'matches values in array' do
        results = transport.call('find', 'db', 'coll', { age: { '$in' => [25, 35] } })
        expect(results.length).to eq(2)
      end

      it 'matches values not in array' do
        results = transport.call('find', 'db', 'coll', { age: { '$nin' => [25, 35] } })
        expect(results.length).to eq(1)
      end
    end

    describe '$exists operator' do
      it 'matches when field exists' do
        results = transport.call('find', 'db', 'coll', { status: { '$exists' => true } })
        expect(results.length).to eq(3)
      end

      it 'matches when field does not exist' do
        results = transport.call('find', 'db', 'coll', { missing: { '$exists' => false } })
        expect(results.length).to eq(3)
      end
    end

    describe '$and/$or/$nor operators' do
      it 'matches all conditions with $and' do
        results = transport.call('find', 'db', 'coll', {
          '$and' => [
            { status: 'active' },
            { age: { '$gte' => 30 } }
          ]
        })
        expect(results.length).to eq(1)
        expect(results.first['name']).to eq('Charlie')
      end

      it 'matches any condition with $or' do
        results = transport.call('find', 'db', 'coll', {
          '$or' => [
            { age: 25 },
            { status: 'inactive' }
          ]
        })
        expect(results.length).to eq(2)
      end

      it 'matches no conditions with $nor' do
        results = transport.call('find', 'db', 'coll', {
          '$nor' => [
            { age: 25 },
            { status: 'inactive' }
          ]
        })
        expect(results.length).to eq(1)
        expect(results.first['name']).to eq('Charlie')
      end
    end

    describe '$regex operator' do
      it 'matches regex pattern' do
        results = transport.call('find', 'db', 'coll', { name: { '$regex' => '^A' } })
        expect(results.length).to eq(1)
        expect(results.first['name']).to eq('Alice')
      end

      it 'supports case-insensitive matching' do
        results = transport.call('find', 'db', 'coll', { name: { '$regex' => '^a', '$options' => 'i' } })
        expect(results.length).to eq(1)
      end
    end
  end

  describe 'update operations' do
    before do
      transport.call('insertOne', 'db', 'coll', { name: 'Test', count: 5, tags: [] })
    end

    describe '$set operator' do
      it 'sets field values' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$set' => { updated: true } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['updated']).to be true
      end
    end

    describe '$unset operator' do
      it 'removes fields' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$unset' => { count: '' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result).not_to have_key('count')
      end
    end

    describe '$inc operator' do
      it 'increments numeric values' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$inc' => { count: 3 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['count']).to eq(8)
      end

      it 'decrements with negative value' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$inc' => { count: -2 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['count']).to eq(3)
      end
    end

    describe '$mul operator' do
      it 'multiplies numeric values' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$mul' => { count: 2 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['count']).to eq(10)
      end
    end

    describe '$min/$max operators' do
      it 'sets to minimum value' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$min' => { count: 3 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['count']).to eq(3)
      end

      it 'sets to maximum value' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$max' => { count: 10 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['count']).to eq(10)
      end
    end

    describe '$push operator' do
      it 'pushes to array' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$push' => { tags: 'new' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to include('new')
      end

      it 'supports $each modifier' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' },
                       { '$push' => { tags: { '$each' => %w[a b c] } } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to eq(%w[a b c])
      end
    end

    describe '$addToSet operator' do
      before do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$push' => { tags: 'existing' } })
      end

      it 'adds unique values to array' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$addToSet' => { tags: 'new' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to include('new')
      end

      it 'does not add duplicate values' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$addToSet' => { tags: 'existing' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags'].count('existing')).to eq(1)
      end
    end

    describe '$pop operator' do
      before do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' },
                       { '$push' => { tags: { '$each' => %w[a b c] } } })
      end

      it 'removes last element with 1' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$pop' => { tags: 1 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to eq(%w[a b])
      end

      it 'removes first element with -1' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$pop' => { tags: -1 } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to eq(%w[b c])
      end
    end

    describe '$pull operator' do
      before do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' },
                       { '$push' => { tags: { '$each' => %w[a b c] } } })
      end

      it 'removes matching values from array' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$pull' => { tags: 'b' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result['tags']).to eq(%w[a c])
      end
    end

    describe '$rename operator' do
      it 'renames a field' do
        transport.call('updateOne', 'db', 'coll', { name: 'Test' }, { '$rename' => { 'count' => 'total' } })
        result = transport.call('find', 'db', 'coll', { name: 'Test' }).first
        expect(result).to have_key('total')
        expect(result).not_to have_key('count')
      end
    end
  end

  describe 'aggregation operations' do
    before do
      transport.call('insertMany', 'db', 'sales', [
        { product: 'A', category: 'X', amount: 100 },
        { product: 'B', category: 'X', amount: 200 },
        { product: 'C', category: 'Y', amount: 150 }
      ])
    end

    describe '$group with aggregation operators' do
      it 'calculates $sum' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', total: { '$sum' => '$amount' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['total']).to eq(300)
      end

      it 'calculates $avg' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', avg: { '$avg' => '$amount' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['avg']).to eq(150)
      end

      it 'finds $min' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', min: { '$min' => '$amount' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['min']).to eq(100)
      end

      it 'finds $max' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', max: { '$max' => '$amount' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['max']).to eq(200)
      end

      it 'gets $first' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$sort' => { amount: 1 } },
          { '$group' => { _id: '$category', first: { '$first' => '$product' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['first']).to eq('A')
      end

      it 'gets $last' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$sort' => { amount: 1 } },
          { '$group' => { _id: '$category', last: { '$last' => '$product' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['last']).to eq('B')
      end

      it 'collects with $push' do
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', products: { '$push' => '$product' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['products'].sort).to eq(%w[A B])
      end

      it 'collects unique with $addToSet' do
        transport.call('insertOne', 'db', 'sales', { product: 'A', category: 'X', amount: 50 })
        results = transport.call('aggregate', 'db', 'sales', [
          { '$group' => { _id: '$category', products: { '$addToSet' => '$product' } } }
        ])
        cat_x = results.find { |r| r['_id'] == 'X' }
        expect(cat_x['products'].sort).to eq(%w[A B])
      end
    end
  end
end
