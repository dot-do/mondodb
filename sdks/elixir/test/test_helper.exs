ExUnit.start()

# Configure Mox for mocking
Mox.defmock(MongoDo.MockTransport, for: MongoDo.Transport)
