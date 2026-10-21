import XCTest

/// Which UI tests a test-plan configuration skips (#105).
final class TestPlanSkipsTests: XCTestCase {
    func test_E002_listedTestIsSkipped() {
        let list = "HelloUITests/test_a,HelloUITests/test_b"

        XCTAssertTrue(TestPlanSkips.lists("HelloUITests/test_b", in: list))
    }

    func test_E002_unlistedTestRuns() {
        XCTAssertFalse(TestPlanSkips.lists("HelloUITests/test_c", in: "HelloUITests/test_a,HelloUITests/test_b"))
    }

    func test_E002_aTestOfAnotherClassWithTheSameNameRuns() {
        XCTAssertFalse(TestPlanSkips.lists("OtherUITests/test_a", in: "HelloUITests/test_a"))
    }

    func test_E002_noListSkipsNothing() {
        XCTAssertFalse(TestPlanSkips.lists("HelloUITests/test_a", in: nil))
        XCTAssertFalse(TestPlanSkips.lists("HelloUITests/test_a", in: ""))
    }

    func test_E002_spacesAroundNamesAreIgnored() {
        XCTAssertTrue(TestPlanSkips.lists("HelloUITests/test_b", in: " HelloUITests/test_a , HelloUITests/test_b "))
    }

    func test_E002_namesATestAsClassAndMethod() {
        XCTAssertEqual(
            TestPlanSkips.identifier(ofTestNamed: "-[FivviProUITests.HelloUITests test_a]"), "HelloUITests/test_a"
        )
        XCTAssertEqual(
            TestPlanSkips.identifier(ofTestNamed: "-[HelloUITests test_a]"), "HelloUITests/test_a"
        )
    }
}
