defmodule MongoDo.InsertOneResult do
  @moduledoc """
  Result of an insert_one operation.
  """

  @type t :: %__MODULE__{
          acknowledged: boolean(),
          inserted_id: term()
        }

  defstruct acknowledged: true, inserted_id: nil
end

defmodule MongoDo.InsertManyResult do
  @moduledoc """
  Result of an insert_many operation.
  """

  @type t :: %__MODULE__{
          acknowledged: boolean(),
          inserted_ids: [term()],
          inserted_count: non_neg_integer()
        }

  defstruct acknowledged: true, inserted_ids: [], inserted_count: 0
end

defmodule MongoDo.UpdateResult do
  @moduledoc """
  Result of an update operation.
  """

  @type t :: %__MODULE__{
          acknowledged: boolean(),
          matched_count: non_neg_integer(),
          modified_count: non_neg_integer(),
          upserted_id: term() | nil
        }

  defstruct acknowledged: true, matched_count: 0, modified_count: 0, upserted_id: nil
end

defmodule MongoDo.DeleteResult do
  @moduledoc """
  Result of a delete operation.
  """

  @type t :: %__MODULE__{
          acknowledged: boolean(),
          deleted_count: non_neg_integer()
        }

  defstruct acknowledged: true, deleted_count: 0
end

defmodule MongoDo.BulkWriteResult do
  @moduledoc """
  Result of a bulk_write operation.
  """

  @type t :: %__MODULE__{
          acknowledged: boolean(),
          inserted_count: non_neg_integer(),
          matched_count: non_neg_integer(),
          modified_count: non_neg_integer(),
          deleted_count: non_neg_integer(),
          upserted_count: non_neg_integer(),
          upserted_ids: [term()],
          write_errors: [map()]
        }

  defstruct acknowledged: true,
            inserted_count: 0,
            matched_count: 0,
            modified_count: 0,
            deleted_count: 0,
            upserted_count: 0,
            upserted_ids: [],
            write_errors: []
end
