# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Mongo::ObjectId do
  describe '.new' do
    it 'generates a 24-character hex string' do
      oid = described_class.new
      expect(oid.to_s).to match(/\A[0-9a-f]{24}\z/)
    end

    it 'generates unique IDs' do
      ids = 100.times.map { described_class.new.to_s }
      expect(ids.uniq.length).to eq(100)
    end

    it 'accepts raw bytes' do
      bytes = "\x00" * 12
      oid = described_class.new(bytes)
      expect(oid.to_s).to eq('0' * 24)
    end

    it 'raises for invalid byte length' do
      expect { described_class.new('short') }.to raise_error(ArgumentError)
    end
  end

  describe '.from_string' do
    it 'parses valid hex strings' do
      hex = '507f1f77bcf86cd799439011'
      oid = described_class.from_string(hex)
      expect(oid.to_s).to eq(hex)
    end

    it 'raises for invalid strings' do
      expect { described_class.from_string('invalid') }.to raise_error(ArgumentError)
      expect { described_class.from_string('123') }.to raise_error(ArgumentError)
    end

    it 'is case-insensitive' do
      hex = '507F1F77BCF86CD799439011'
      oid = described_class.from_string(hex)
      expect(oid.to_s).to eq(hex.downcase)
    end
  end

  describe '.from_time' do
    it 'creates ObjectId from timestamp' do
      time = Time.utc(2024, 1, 1, 12, 0, 0)
      oid = described_class.from_time(time)
      expect(oid.timestamp.to_i).to eq(time.to_i)
    end
  end

  describe '.valid?' do
    it 'returns true for valid strings' do
      expect(described_class.valid?('507f1f77bcf86cd799439011')).to be true
    end

    it 'returns false for invalid strings' do
      expect(described_class.valid?('invalid')).to be false
      expect(described_class.valid?(nil)).to be false
      expect(described_class.valid?(123)).to be false
    end
  end

  describe '#timestamp' do
    it 'extracts creation time' do
      oid = described_class.new
      expect(oid.timestamp).to be_within(1).of(Time.now.utc)
    end
  end

  describe '#==' do
    it 'compares by bytes' do
      hex = '507f1f77bcf86cd799439011'
      oid1 = described_class.from_string(hex)
      oid2 = described_class.from_string(hex)
      expect(oid1).to eq(oid2)
    end

    it 'returns false for different IDs' do
      oid1 = described_class.new
      oid2 = described_class.new
      expect(oid1).not_to eq(oid2)
    end
  end

  describe '#<=>' do
    it 'allows sorting' do
      ids = 5.times.map { described_class.new }
      sleep(0.001) # Ensure timestamp difference
      ids << described_class.new
      sorted = ids.sort
      expect(sorted.last).to eq(ids.last)
    end
  end

  describe '#hash' do
    it 'allows use as Hash key' do
      oid = described_class.new
      hash = { oid => 'value' }
      expect(hash[oid]).to eq('value')
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      hex = '507f1f77bcf86cd799439011'
      oid = described_class.from_string(hex)
      expect(oid.as_json).to eq({ '$oid' => hex })
    end
  end

  describe '#inspect' do
    it 'returns readable string' do
      oid = described_class.from_string('507f1f77bcf86cd799439011')
      expect(oid.inspect).to eq("ObjectId('507f1f77bcf86cd799439011')")
    end
  end
end

RSpec.describe Mongo::Timestamp do
  describe '.new' do
    it 'stores seconds and increment' do
      ts = described_class.new(1234567890, 5)
      expect(ts.seconds).to eq(1234567890)
      expect(ts.increment).to eq(5)
    end
  end

  describe '.from_time' do
    it 'creates from Time' do
      time = Time.utc(2024, 1, 1)
      ts = described_class.from_time(time, 3)
      expect(ts.seconds).to eq(time.to_i)
      expect(ts.increment).to eq(3)
    end
  end

  describe '#to_time' do
    it 'converts to Time' do
      ts = described_class.new(1704067200, 0)
      expect(ts.to_time.to_i).to eq(1704067200)
    end
  end

  describe '#==' do
    it 'compares by seconds and increment' do
      ts1 = described_class.new(100, 5)
      ts2 = described_class.new(100, 5)
      ts3 = described_class.new(100, 6)
      expect(ts1).to eq(ts2)
      expect(ts1).not_to eq(ts3)
    end
  end

  describe '#<=>' do
    it 'orders by seconds then increment' do
      ts1 = described_class.new(100, 1)
      ts2 = described_class.new(100, 2)
      ts3 = described_class.new(200, 1)
      expect([ts3, ts1, ts2].sort).to eq([ts1, ts2, ts3])
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      ts = described_class.new(1234567890, 5)
      expect(ts.as_json).to eq({ '$timestamp' => { 't' => 1234567890, 'i' => 5 } })
    end
  end
end

RSpec.describe Mongo::Binary do
  describe '.new' do
    it 'stores data and subtype' do
      bin = described_class.new("\x00\x01\x02", :generic)
      expect(bin.data).to eq("\x00\x01\x02")
      expect(bin.subtype).to eq(0)
    end

    it 'accepts integer subtypes' do
      bin = described_class.new("\x00", 4)
      expect(bin.subtype).to eq(4)
    end
  end

  describe '.from_base64' do
    it 'decodes base64 data' do
      bin = described_class.from_base64('AAEC')
      expect(bin.data).to eq("\x00\x01\x02")
    end
  end

  describe '#to_base64' do
    it 'encodes to base64' do
      bin = described_class.new("\x00\x01\x02")
      expect(bin.to_base64).to eq('AAEC')
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      bin = described_class.new("\x00\x01\x02", :uuid)
      json = bin.as_json
      expect(json['$binary']['base64']).to eq('AAEC')
      expect(json['$binary']['subType']).to eq('04')
    end
  end
end

RSpec.describe Mongo::Decimal128 do
  describe '.new' do
    it 'stores decimal value as string' do
      d = described_class.new('123.456')
      expect(d.value).to eq('123.456')
    end

    it 'converts numbers to string' do
      d = described_class.new(123.456)
      expect(d.value).to eq('123.456')
    end
  end

  describe '#to_f' do
    it 'converts to float' do
      d = described_class.new('123.456')
      expect(d.to_f).to eq(123.456)
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      d = described_class.new('1.23E+10')
      expect(d.as_json).to eq({ '$numberDecimal' => '1.23E+10' })
    end
  end
end

RSpec.describe Mongo::MinKey do
  describe '.instance' do
    it 'returns singleton instance' do
      expect(described_class.instance).to be(described_class.instance)
    end
  end

  describe '#==' do
    it 'equals other MinKeys' do
      expect(described_class.instance).to eq(described_class.new)
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      expect(described_class.instance.as_json).to eq({ '$minKey' => 1 })
    end
  end
end

RSpec.describe Mongo::MaxKey do
  describe '.instance' do
    it 'returns singleton instance' do
      expect(described_class.instance).to be(described_class.instance)
    end
  end

  describe '#==' do
    it 'equals other MaxKeys' do
      expect(described_class.instance).to eq(described_class.new)
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      expect(described_class.instance.as_json).to eq({ '$maxKey' => 1 })
    end
  end
end

RSpec.describe Mongo::Regex do
  describe '.new' do
    it 'stores pattern and options' do
      re = described_class.new('^test', 'im')
      expect(re.pattern).to eq('^test')
      expect(re.options).to eq('im')
    end
  end

  describe '#to_regexp' do
    it 'converts to Ruby Regexp' do
      re = described_class.new('^test', 'i')
      ruby_re = re.to_regexp
      expect('TEST').to match(ruby_re)
    end
  end

  describe '#as_json' do
    it 'returns extended JSON format' do
      re = described_class.new('^test', 'i')
      expect(re.as_json).to eq({
        '$regularExpression' => { 'pattern' => '^test', 'options' => 'i' }
      })
    end
  end
end

RSpec.describe Mongo::BSON do
  describe '.serialize' do
    it 'serializes ObjectId' do
      oid = Mongo::ObjectId.from_string('507f1f77bcf86cd799439011')
      result = described_class.serialize(oid)
      expect(result).to eq({ '$oid' => '507f1f77bcf86cd799439011' })
    end

    it 'serializes Time' do
      time = Time.utc(2024, 1, 1, 12, 0, 0)
      result = described_class.serialize(time)
      expect(result['$date']).to include('2024-01-01')
    end

    it 'serializes nested hashes' do
      doc = { user: { id: Mongo::ObjectId.new, name: 'Test' } }
      result = described_class.serialize(doc)
      expect(result['user']['id']).to have_key('$oid')
    end

    it 'serializes arrays' do
      arr = [Mongo::ObjectId.new, Time.now]
      result = described_class.serialize(arr)
      expect(result[0]).to have_key('$oid')
      expect(result[1]).to have_key('$date')
    end

    it 'converts symbols to strings' do
      result = described_class.serialize({ key: :value })
      expect(result['key']).to eq('value')
    end
  end

  describe '.deserialize' do
    it 'deserializes ObjectId' do
      json = { '$oid' => '507f1f77bcf86cd799439011' }
      result = described_class.deserialize(json)
      expect(result).to be_a(Mongo::ObjectId)
    end

    it 'deserializes Time' do
      json = { '$date' => '2024-01-01T12:00:00.000Z' }
      result = described_class.deserialize(json)
      expect(result).to be_a(Time)
    end

    it 'deserializes Timestamp' do
      json = { '$timestamp' => { 't' => 100, 'i' => 5 } }
      result = described_class.deserialize(json)
      expect(result).to be_a(Mongo::Timestamp)
      expect(result.seconds).to eq(100)
    end

    it 'deserializes Binary' do
      json = { '$binary' => { 'base64' => 'AAEC', 'subType' => '00' } }
      result = described_class.deserialize(json)
      expect(result).to be_a(Mongo::Binary)
    end

    it 'deserializes Decimal128' do
      json = { '$numberDecimal' => '123.456' }
      result = described_class.deserialize(json)
      expect(result).to be_a(Mongo::Decimal128)
    end

    it 'deserializes nested objects' do
      json = {
        'user' => {
          '_id' => { '$oid' => '507f1f77bcf86cd799439011' },
          'created' => { '$date' => '2024-01-01T00:00:00.000Z' }
        }
      }
      result = described_class.deserialize(json)
      expect(result['user']['_id']).to be_a(Mongo::ObjectId)
      expect(result['user']['created']).to be_a(Time)
    end

    it 'deserializes arrays' do
      json = [
        { '$oid' => '507f1f77bcf86cd799439011' },
        { '$date' => '2024-01-01T00:00:00.000Z' }
      ]
      result = described_class.deserialize(json)
      expect(result[0]).to be_a(Mongo::ObjectId)
      expect(result[1]).to be_a(Time)
    end
  end
end
