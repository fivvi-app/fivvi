import XCTest

@testable import FivviPro

/// What the personal screens keep on the phone (F013 AC7): the day and the workspaces, in a file that goes with the
/// sign-out.
final class PersonalStoreTests: XCTestCase {
    private func store() throws -> FilePersonalStore {
        let directory = FileManager.default.temporaryDirectory.appending(path: "personal-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return FilePersonalStore(directory: directory)
    }

    func test_F013_AC7_theDayComesBackAsItWasKept() throws {
        let cache = PersonalCache(store: try store())
        XCTAssertNil(cache.day)

        cache.day = .init(day: PersonalFixtures.sarah(), savedAt: PersonalFixtures.now)

        XCTAssertEqual(cache.day?.day, PersonalFixtures.sarah())
        XCTAssertEqual(cache.day?.savedAt, PersonalFixtures.now)
    }

    func test_F013_AC7_aSignOutForgetsEverything() throws {
        let files = try store()
        let cache = PersonalCache(store: files)
        cache.day = .init(day: PersonalFixtures.sarah(), savedAt: PersonalFixtures.now)
        cache.workspaces = [.init(id: PersonalFixtures.johns.id, name: PersonalFixtures.johns.name)]

        files.clear()

        XCTAssertNil(cache.day)
        XCTAssertNil(cache.workspaces, "the next account starts with no workspace to miss")
    }
}
