import XCTest

/// The UI tests a test-plan configuration skips, named in its `TRAINER_HUB_SKIP_TESTS` (TrainerHub.xctestplan).
///
/// Why: the text-dependent tests (the greeting, the error and loading text, the app's display name) run in every
/// configuration, nl and en. The ones that don't depend on the configuration's language run in nl only: AC3 sets the
/// device and per-app languages itself, AC6 checks token colours, AC7's largest text size checks the layout (nl has
/// the longer strings, so it is the harder case). Running them twice added minutes to CI for no new proof.
///
/// A test plan can't select tests per configuration (`skippedTests` is per test target), so the plan hands each
/// configuration its list in this variable and `HelloUITests` skips what it names, which the results show as
/// skipped. `scripts/test-ios.sh` checks that every name is a UI test and that none is skipped in every
/// configuration, so a test can't end up running nowhere.
enum TestPlanSkips {
    static let variable = "TRAINER_HUB_SKIP_TESTS"

    /// Skips `test` when the configuration it runs in lists it.
    static func skipIfListed(_ test: XCTestCase) throws {
        let name = identifier(ofTestNamed: test.name)
        let skipped = lists(name, in: ProcessInfo.processInfo.environment[variable])
        try XCTSkipIf(skipped, "\(name) is not run in this configuration")
    }

    /// "Class/test_name" for an `XCTestCase.name` such as "-[TrainerHubUITests.HelloUITests test_name]".
    static func identifier(ofTestNamed name: String) -> String {
        let parts = name.dropFirst(2).dropLast().split(separator: " ")
        guard parts.count == 2, let type = parts[0].split(separator: ".").last else { return name }
        return "\(type)/\(parts[1])"
    }

    /// Whether `name` ("Class/test_name") is in the comma-separated `list`.
    static func lists(_ name: String, in list: String?) -> Bool {
        (list ?? "").split(separator: ",").contains { $0.trimmingCharacters(in: .whitespaces) == name }
    }
}
