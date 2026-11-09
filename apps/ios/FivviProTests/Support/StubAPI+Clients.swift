import FivviAPI

/// The client routes (F006): the stub's `clients` answers them.
extension StubAPI {
    func listClients(_ input: Operations.ListClients.Input) async throws -> Operations.ListClients.Output {
        let query = input.query
        return try clients.list(search: query.search, page: query.page ?? 1, pageSize: query.pageSize ?? 50)
    }

    func addClient(_ input: Operations.AddClient.Input) async throws -> Operations.AddClient.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try clients.add(body)
    }

    func getClient(_ input: Operations.GetClient.Input) async throws -> Operations.GetClient.Output {
        try clients.get(input.path.clientId)
    }

    func updateClient(_ input: Operations.UpdateClient.Input) async throws -> Operations.UpdateClient.Output {
        guard case let .json(body) = input.body else { fatalError("a JSON body") }
        return try clients.update(input.path.clientId, body)
    }
}
