import XCTest

/// Which UI tests a test-plan configuration skips (#105).
final class TestPlanSkipsTests: XCTestCase {
    func test_E002_listedTestIsSkipped() {
        let list = "HomeUITests/test_a,HomeUITests/test_b"

        XCTAssertTrue(TestPlanSkips.lists("HomeUITests/test_b", in: list))
    }

    func test_E002_unlistedTestRuns() {
        XCTAssertFalse(TestPlanSkips.lists("HomeUITests/test_c", in: "HomeUITests/test_a,HomeUITests/test_b"))
    }

    func test_E002_aTestOfAnotherClassWithTheSameNameRuns() {
        XCTAssertFalse(TestPlanSkips.lists("OtherUITests/test_a", in: "HomeUITests/test_a"))
    }

    func test_E002_noListSkipsNothing() {
        XCTAssertFalse(TestPlanSkips.lists("HomeUITests/test_a", in: nil))
        XCTAssertFalse(TestPlanSkips.lists("HomeUITests/test_a", in: ""))
    }

    func test_E002_spacesAroundNamesAreIgnored() {
        XCTAssertTrue(TestPlanSkips.lists("HomeUITests/test_b", in: " HomeUITests/test_a , HomeUITests/test_b "))
    }

    func test_E002_namesATestAsClassAndMethod() {
        XCTAssertEqual(
            TestPlanSkips.identifier(ofTestNamed: "-[FivviProUITests.HomeUITests test_a]"), "HomeUITests/test_a"
        )
        XCTAssertEqual(
            TestPlanSkips.identifier(ofTestNamed: "-[HomeUITests test_a]"), "HomeUITests/test_a"
        )
    }
}
