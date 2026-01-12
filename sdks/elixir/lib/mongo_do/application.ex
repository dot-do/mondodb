defmodule MongoDo.Application do
  @moduledoc """
  Application supervisor for MongoDo.

  Starts the connection pool and related processes.
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Registry, keys: :unique, name: MongoDo.Registry},
      {DynamicSupervisor, strategy: :one_for_one, name: MongoDo.ConnectionSupervisor},
      MongoDo.Pool
    ]

    opts = [strategy: :one_for_one, name: MongoDo.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
