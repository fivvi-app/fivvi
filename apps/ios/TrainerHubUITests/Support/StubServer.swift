import Foundation
import Network

/// A tiny HTTP server in the UI-test runner that stands in for the API. The app reaches it on the simulator's
/// loopback interface (the Debug build allows plain HTTP), so UI tests can assert what the app requested.
final class StubServer: Sendable {
    enum Answer: Sendable {
        /// `200` with this greeting key.
        case greeting(key: String)
        /// An error status without a body.
        case status(Int)
        /// No answer until `answer(with:)` gives one, so the loading state stays on screen.
        case hold
    }

    /// The base URL to launch the app with (`-TrainerHubAPIBaseURL`).
    let baseURL: URL

    private let listener: NWListener
    private let responder: Responder

    init(_ answer: Answer) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        let listener = try NWListener(using: parameters)
        let responder = Responder(answer)
        let queue = DispatchQueue(label: "nl.trainerhub.uitests.StubServer")
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready, .failed, .cancelled: ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { connection in responder.accept(connection, on: queue) }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 10)
        guard let port = listener.port, let url = URL(string: "http://127.0.0.1:\(port.rawValue)/api") else {
            listener.cancel()
            throw URLError(.cannotFindHost)
        }
        self.listener = listener
        self.responder = responder
        baseURL = url
    }

    deinit {
        listener.cancel()
    }

    /// The `locale` query parameter of every `GET /api/v1/hello` so far.
    var requestedLocales: [String?] { responder.requestedLocales }

    /// Answers from now on, and answers the requests on hold (unless the new answer is `.hold` too).
    func answer(with answer: Answer) {
        responder.answer(with: answer)
    }
}

/// Reads requests and answers them; shared with Network's callbacks, so its state is behind a lock.
private final class Responder: @unchecked Sendable {
    private let lock = NSLock()
    private var currentAnswer: StubServer.Answer
    private var helloLocales: [String?] = []
    private var held: [(connection: NWConnection, locale: String?)] = []

    init(_ answer: StubServer.Answer) {
        currentAnswer = answer
    }

    var requestedLocales: [String?] { lock.withLock { helloLocales } }

    func answer(with answer: StubServer.Answer) {
        let waiting: [(connection: NWConnection, locale: String?)] = lock.withLock {
            currentAnswer = answer
            if case .hold = answer { return [] }
            defer { held = [] }
            return held
        }
        waiting.forEach { respond($0.connection, locale: $0.locale, with: answer) }
    }

    func accept(_ connection: NWConnection, on queue: DispatchQueue) {
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, isComplete, error in
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                self.handle(connection, head: String(bytes: buffer[..<end.lowerBound], encoding: .utf8) ?? "")
            } else if isComplete || error != nil {
                connection.cancel()
            } else {
                self.receive(connection, buffer: buffer)
            }
        }
    }

    private func handle(_ connection: NWConnection, head: String) {
        // Request line: GET /api/v1/hello?locale=en HTTP/1.1
        let target = head.split(separator: "\r\n").first?.split(separator: " ").dropFirst().first.map(String.init)
        let request = target.flatMap { URLComponents(string: $0) }
        let locale = request?.queryItems?.first { $0.name == "locale" }?.value
        let answer = lock.withLock {
            if request?.path == "/api/v1/hello" { helloLocales.append(locale) }
            if case .hold = currentAnswer { held.append((connection, locale)) }
            return currentAnswer
        }
        respond(connection, locale: locale, with: answer)
    }

    private func respond(_ connection: NWConnection, locale: String?, with answer: StubServer.Answer) {
        let status: Int
        let body: Data
        switch answer {
        case .hold:
            return
        case let .greeting(key):
            status = 200
            let json = ["greetingKey": key, "locale": locale ?? "en"]
            body = (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
        case let .status(code):
            status = code
            body = Data()
        }
        let head = "HTTP/1.1 \(status) Stub\r\nContent-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
}
