# Package

version       = "0.1.0"
author        = ".do"
description   = "MongoDB SDK for the .do platform - Natural Language First, AI-Native"
license       = "MIT"
srcDir        = "src"

# Dependencies

requires "nim >= 2.0.0"
requires "ws >= 0.5.0"

# Tasks

task test, "Run tests":
  exec "nim c -r tests/test_mongo_do.nim"
