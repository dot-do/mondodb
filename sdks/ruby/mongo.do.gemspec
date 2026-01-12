# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name          = 'mongo.do'
  spec.version       = '0.2.0'
  spec.authors       = ['DotDo Team']
  spec.email         = ['team@dotdo.dev']

  spec.summary       = 'MongoDB SDK for the DotDo platform'
  spec.description   = 'MongoDB-compatible Ruby SDK built on RPC with promise pipelining, ' \
                       'natural language queries, change streams, and zero infrastructure. ' \
                       'Drop-in replacement for the official mongo-ruby-driver with AI-powered ' \
                       'natural language query support.'
  spec.homepage      = 'https://github.com/dotdo/mongo'
  spec.license       = 'MIT'
  spec.required_ruby_version = '>= 3.1.0'

  spec.metadata['homepage_uri'] = spec.homepage
  spec.metadata['source_code_uri'] = 'https://github.com/dotdo/mongo'
  spec.metadata['changelog_uri'] = 'https://github.com/dotdo/mongo/blob/main/CHANGELOG.md'
  spec.metadata['documentation_uri'] = 'https://mongo.do/docs/ruby'
  spec.metadata['rubygems_mfa_required'] = 'true'

  spec.files = Dir.chdir(__dir__) do
    `git ls-files -z`.split("\x0").reject do |f|
      (f == __FILE__) || f.match(%r{\A(?:(?:bin|test|spec|features)/|\.(?:git|travis|circleci)|appveyor)})
    end
  end
  spec.bindir = 'exe'
  spec.executables = spec.files.grep(%r{\Aexe/}) { |f| File.basename(f) }
  spec.require_paths = ['lib']

  # Runtime dependencies - only standard library needed for core functionality
  spec.add_dependency 'json', '~> 2.0'

  # Optional: async gem for fiber-based concurrency (Ruby 3.2+)
  # spec.add_dependency 'async', '~> 2.6'

  # Development dependencies
  spec.add_development_dependency 'bundler', '~> 2.0'
  spec.add_development_dependency 'rake', '~> 13.0'
  spec.add_development_dependency 'rspec', '~> 3.12'
  spec.add_development_dependency 'rubocop', '~> 1.50'
  spec.add_development_dependency 'simplecov', '~> 0.22'
  spec.add_development_dependency 'webmock', '~> 3.19'
  spec.add_development_dependency 'yard', '~> 0.9'
end
