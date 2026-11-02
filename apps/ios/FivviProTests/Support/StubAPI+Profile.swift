import Foundation
import FivviAPI

/// What the stub does with `PUT` and `DELETE /api/v1/workspaces/{id}/trainer-profile` (F005): the answer, the calls, and
/// the calls on hold, and the `PATCH /api/v1/me` calls on hold. A struct of its own so `StubAPI.swift` stays within
/// SwiftLint's length limit.
struct ProfileScript {
    enum Answer: Sendable {
        case accepted
        case forbidden
        case notFound
        case status(Int)
        case offline
        /// No answer until the test calls `releaseHangingTrainerCalls()`, then accepted.
        case hang
    }

    struct Call: Equatable, Sendable {
        let workspaceID: String
        /// True for the `PUT` (trains here), false for the `DELETE`.
        let trains: Bool
    }

    var answer = Answer.accepted
    var calls: [Call] = []
    var hanging: [CheckedContinuation<Void, Never>] = []
    var watchers: [CheckedContinuation<Void, Never>] = []
    var hangingUpdates: [CheckedContinuation<Void, Never>] = []
    var updateWatchers: [CheckedContinuation<Void, Never>] = []
}

extension StubAPI {
    func answerTrainerProfile(with answer: ProfileScript.Answer) {
        trainers.answer = answer
    }

    /// Every `PUT` and `DELETE` of a trainer profile so far, in order.
    var trainerCalls: [ProfileScript.Call] { trainers.calls }

    /// Returns once a trainer-profile call hangs.
    func untilTrainerCallHangs() async {
        guard trainers.hanging.isEmpty else { return }
        await withCheckedContinuation { trainers.watchers.append($0) }
    }

    /// Lets every hanging trainer-profile call answer as accepted.
    func releaseHangingTrainerCalls() {
        let waiting = trainers.hanging
        trainers.hanging = []
        waiting.forEach { $0.resume() }
    }

    /// Returns once an `updateMe` call hangs.
    func untilUpdateMeHangs() async {
        guard trainers.hangingUpdates.isEmpty else { return }
        await withCheckedContinuation { trainers.updateWatchers.append($0) }
    }

    /// Lets every hanging `updateMe` answer as accepted.
    func releaseHangingUpdateMes() {
        let waiting = trainers.hangingUpdates
        trainers.hangingUpdates = []
        waiting.forEach { $0.resume() }
    }

    /// Holds an `updateMe` that is answered `.hang` until the test releases it.
    func holdUpdateMe() async {
        await withCheckedContinuation { continuation in
            trainers.hangingUpdates.append(continuation)
            let watchers = trainers.updateWatchers
            trainers.updateWatchers = []
            watchers.forEach { $0.resume() }
        }
    }

    func putTrainerProfile(
        _ input: Operations.PutTrainerProfile.Input
    ) async throws -> Operations.PutTrainerProfile.Output {
        let id = input.path.workspaceId
        switch try await answerTrainerCall(id, trains: true) {
        case .accepted:
            let profile = Components.Schemas.TrainerProfile(
                teamMemberId: "5b1c2d3e-0000-4000-8000-000000000009", trainsHere: true
            )
            return .ok(.init(body: .json(profile)))
        case .forbidden:
            return .forbidden(.init(body: .json(.init(code: .forbidden))))
        case .notFound:
            return .notFound(.init(body: .json(.init(code: .notFound))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline, .hang:
            preconditionFailure("answerTrainerCall settles these")
        }
    }

    func deleteTrainerProfile(
        _ input: Operations.DeleteTrainerProfile.Input
    ) async throws -> Operations.DeleteTrainerProfile.Output {
        let id = input.path.workspaceId
        switch try await answerTrainerCall(id, trains: false) {
        case .accepted:
            return .noContent(.init())
        case .forbidden:
            return .forbidden(.init(body: .json(.init(code: .forbidden))))
        case .notFound:
            return .notFound(.init(body: .json(.init(code: .notFound))))
        case let .status(code):
            return .undocumented(statusCode: code, .init())
        case .offline, .hang:
            preconditionFailure("answerTrainerCall settles these")
        }
    }

    /// Records the call, throws when offline and waits while hanging; returns what is left of the answer.
    private func answerTrainerCall(_ id: String, trains: Bool) async throws -> ProfileScript.Answer {
        trainers.calls.append(.init(workspaceID: id, trains: trains))
        switch trainers.answer {
        case .offline:
            throw URLError(.notConnectedToInternet)
        case .hang:
            await withCheckedContinuation { continuation in
                trainers.hanging.append(continuation)
                let watchers = trainers.watchers
                trainers.watchers = []
                watchers.forEach { $0.resume() }
            }
            return .accepted
        default:
            return trainers.answer
        }
    }
}
