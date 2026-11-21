import XCTest

/// The group class screens (F021, iOS), in nl and en: **+** → *Groepsles* for the Owner (TD-05, AC6) and the class on a
/// date (TD-03, AC5), its description with *Meer* / *Minder* and its ⋯ menu, and what a Trainer sees (AC7). The stub
/// server starts with *Kracht* (*Strength*), tomorrow at 18:00 without a trainer and with a long description in both
/// languages; the Owner is John, the Trainer is Sarah (synthetic).
@MainActor
final class ClassUITests: PrivateSessionUITestCase {
    private var english: Bool { TestCatalog.configuredLanguage.hasPrefix("en") }

    /// **+** → *Groepsles*: TD-05 is open once its title shows.
    private func openNewClass(_ app: XCUIApplication) {
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout), requestLog)
        plus.tap()
        let item = app.buttons["home.newGroupClass"]
        XCTAssertTrue(item.waitUntilExists(timeout: timeout), requestLog)
        item.tap()
        XCTAssertTrue(app.staticTexts["newClass.title"].waitUntilExists(timeout: timeout), requestLog)
    }

    private func type(_ text: String, into id: String, _ app: XCUIApplication) {
        let field = app.textFields[id].firstMatch.exists ? app.textFields[id] : app.textViews[id]
        XCTAssertTrue(field.waitUntilExists(timeout: timeout), id)
        field.tap()
        field.typeText(text)
    }

    func test_F021_AC6_ownerAddsOneOffClass() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app)
        XCTAssertEqual(app.staticTexts["newClass.title"].label, catalog["classes.app.newTitle"])
        let repeatRow = any("newClass.repeat", in: app)
        XCTAssertTrue(repeatRow.label.contains(catalog["classes.schedule.repeatNone"]), repeatRow.label)

        type("Mobility", into: "newClass.nameNl", app)
        app.buttons["newClass.save"].tap()

        let title = app.staticTexts["classDate.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, "Mobility")
        let added = app.staticTexts["classDate.added"]
        XCTAssertTrue(added.waitUntilExists(timeout: timeout))
        XCTAssertEqual(added.label, catalog["classes.schedule.saved"], "Groepsles toegevoegd")
        let sent = try XCTUnwrap(server.createdGroupClasses.first)
        XCTAssertEqual(sent["nameNl"], "Mobility")
        XCTAssertEqual(sent["capacity"], "12")
        XCTAssertEqual(sent["durationMinutes"], "60")
        XCTAssertEqual(sent["surface"], "ios")
        XCTAssertNotNil(sent["firstDate.localDate"])
        XCTAssertEqual(server.createdGroupClasses.count, 1, "one request makes the class and its date")
        XCTAssertEqual(app.staticTexts["classDate.trainer"].label, catalog["sessions.page.you"], "John trains too")
    }

    func test_F021_Design_ownerAddsMobilityWithDutchAndEnglishDescriptionsAndTD03ShowsTheAppLanguage() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app)
        type("Mobility", into: "newClass.nameNl", app)
        type("Mobility flow", into: "newClass.nameEn", app)
        type("Rustig bewegen", into: "newClass.descriptionNl", app)
        type("Gentle moving", into: "newClass.descriptionEn", app)
        app.buttons["newClass.save"].tap()

        let title = app.staticTexts["classDate.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, english ? "Mobility flow" : "Mobility")
        let description = app.staticTexts["classDate.description"]
        XCTAssertTrue(description.waitUntilExists(timeout: timeout))
        XCTAssertEqual(description.label, english ? "Gentle moving" : "Rustig bewegen")
        let sent = try XCTUnwrap(server.createdGroupClasses.first)
        XCTAssertEqual(sent["descriptionNl"], "Rustig bewegen")
        XCTAssertEqual(sent["descriptionEn"], "Gentle moving")
        XCTAssertEqual(sent["nameEn"], "Mobility flow")
    }

    func test_F021_Design_theDescriptionIsCutAndMeerOpensItWholeAndMinderCutsItAgain() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        let description = app.staticTexts["classDate.description"]
        XCTAssertTrue(description.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(
            description.label, english ? StubSessionRoutes.seededDescriptionEn : StubSessionRoutes.seededDescriptionNl
        )
        let toggle = app.buttons["classDate.descriptionToggle"]
        XCTAssertEqual(toggle.label, catalog["classes.app.descriptionMore"])
        let cut = description.frame.height

        toggle.tap()
        let less = catalog["classes.app.descriptionLess"]
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { toggle.label == less })
        XCTAssertGreaterThan(description.frame.height, cut, "opens whole")

        toggle.tap()
        let more = catalog["classes.app.descriptionMore"]
        XCTAssertTrue(Polling.until(timeout: timeout, interval: 0.2) { toggle.label == more })
        XCTAssertEqual(description.frame.height, cut, accuracy: 1, "cut again")
    }

    func test_F021_AC5_trainerNeededShown() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        let trainer = app.staticTexts["classDate.trainer"]
        XCTAssertTrue(trainer.waitUntilExists(timeout: timeout), requestLog)
        let word = catalog["trainerWord.trainer.wordCap"]
        XCTAssertEqual(
            trainer.label, String(format: catalog["classes.trainerNeeded"], word), "Trainer nodig / Trainer needed"
        )
        XCTAssertEqual(app.staticTexts["classDate.title"].label, english ? "Strength" : "Kracht")
        XCTAssertFalse(app.staticTexts["classDate.series"].exists, "a date on its own has no series line")
        XCTAssertTrue(app.staticTexts["classDate.booked"].label.hasPrefix("0/8"))
        XCTAssertEqual(app.staticTexts["classDate.noBookings"].label, catalog["classes.date.noBookings"])
        XCTAssertEqual(app.staticTexts["classDate.location"].label, "John's Gym")
    }

    func test_F021_Design_ownersMenuHasLesWijzigenWhichSaysToUseTheWeb() throws {
        let (screen, _) = try launch(owner: true, opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        let menu = app.buttons["classDate.menu"]
        XCTAssertTrue(menu.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertTrue(app.staticTexts["classDate.ownerNote"].exists)
        menu.tap()
        let edit = app.buttons["classDate.edit"]
        XCTAssertTrue(edit.waitUntilExists(timeout: timeout))
        XCTAssertEqual(edit.label, catalog["classes.app.edit"], "Les wijzigen / Edit class")
        edit.tap()
        let onWeb = app.staticTexts["classDate.manageOnWeb"]
        XCTAssertTrue(onWeb.waitUntilExists(timeout: timeout))
        XCTAssertEqual(onWeb.label, catalog["classes.app.manageOnWeb"], "Dit beheer je op het web")
    }

    func test_F021_Design_aTrainerWhoIsNotSubstitutingOpensTD03WithoutAMenu() throws {
        let (screen, _) = try launch(opensClassDate: StubSessionRoutes.seededClassDateID)
        let app = screen.app
        let title = app.staticTexts["classDate.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, english ? "Strength" : "Kracht", "she can open TD-03 of any class date")
        XCTAssertFalse(app.staticTexts["classDate.trainer"].label.isEmpty)
        XCTAssertFalse(app.buttons["classDate.menu"].exists, "no ⋯ menu")
        XCTAssertFalse(app.staticTexts["classDate.ownerNote"].exists)
    }

    func test_F021_AC7_trainerPlusMenuHasNoGroupClass() throws {
        let (screen, _) = try launch()
        let app = screen.app
        let plus = app.buttons["home.new"]
        XCTAssertTrue(plus.waitUntilExists(timeout: timeout), requestLog)
        plus.tap()
        XCTAssertTrue(app.buttons["home.newPrivateSession"].waitUntilExists(timeout: timeout))
        XCTAssertFalse(app.buttons["home.newGroupClass"].exists, "Sarah's + has no Groepsles")
        let note = app.buttons["home.newGroupClassNote"]
        XCTAssertTrue(note.waitUntilExists(timeout: timeout), "the footnote shows")
        XCTAssertEqual(note.label, String(format: catalog["workspaceNav.newGroupClassNote"], "John's Gym"))
    }

    // MARK: Herhalen (F022, #455)

    /// *Herhalen* → *Elke week op {weekday}*: the weekly option of the picker.
    private func chooseWeekly(_ app: XCUIApplication) {
        let picker = any("newClass.repeat", in: app)
        XCTAssertTrue(picker.waitUntilExists(timeout: timeout), requestLog)
        picker.tap()
        let beginning = catalog["classes.schedule.repeatWeekly"].components(separatedBy: "%1$@").first ?? ""
        let weekly = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", beginning)).firstMatch
        XCTAssertTrue(weekly.waitUntilExists(timeout: timeout), requestLog)
        weekly.tap()
    }

    /// The weekday of a local date `YYYY-MM-DD` as the app's language writes it.
    private func weekdayName(of localDate: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: StubSessionRoutes.zone)
        parser.dateFormat = "yyyy-MM-dd HH:mm"
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: TestCatalog.configuredLanguage)
        formatter.timeZone = TimeZone(identifier: StubSessionRoutes.zone)
        formatter.setLocalizedDateFormatFromTemplate("EEEE")
        return formatter.string(from: parser.date(from: "\(localDate) 12:00") ?? Date())
    }

    func test_F022_AC6_ownerAddsAWeeklyMobilityAndTD03ShowsTwelveAddedAndTheSeriesLine() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app)
        XCTAssertFalse(app.staticTexts["newClass.repeatNote"].exists, "the note shows with the weekly choice only")
        type("Mobility", into: "newClass.nameNl", app)
        chooseWeekly(app)
        let note = app.staticTexts["newClass.repeatNote"]
        XCTAssertTrue(note.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(note.label, catalog["classes.schedule.repeatNote"], "12 weken in de agenda")
        app.buttons["newClass.save"].tap()

        let title = app.staticTexts["classDate.title"]
        XCTAssertTrue(title.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(title.label, "Mobility")
        let added = app.staticTexts["classDate.added"]
        XCTAssertTrue(added.waitUntilExists(timeout: timeout))
        let twelve = String(format: catalog["classes.schedule.savedSeries"], 12)
        XCTAssertEqual(added.label, twelve, "12 groepslessen toegevoegd")
        let sent = try XCTUnwrap(server.createdGroupClasses.first)
        XCTAssertEqual(sent["firstDate.repeat"], "weekly")
        XCTAssertEqual(server.createdGroupClasses.count, 1, "one request makes the class and its series")
        let localDate = try XCTUnwrap(sent["firstDate.localDate"])
        let localStart = try XCTUnwrap(sent["firstDate.localStart"])
        let series = app.staticTexts["classDate.series"]
        XCTAssertTrue(series.waitUntilExists(timeout: timeout), requestLog)
        XCTAssertEqual(
            series.label,
            String(format: catalog["classes.date.seriesLine"], "Mobility", localStart, weekdayName(of: localDate)),
            "Onderdeel van: Mobility, elke {weekday} {time}"
        )
    }

    func test_F022_AC7_aWeeklyStartTheClocksSkipShowsTheDSTMessageWithTheDateAndNothingIsCreated() throws {
        let (screen, server) = try launch(owner: true)
        let app = screen.app
        openNewClass(app)
        type("Mobility", into: "newClass.nameNl", app)
        chooseWeekly(app)
        server.refuseNextSessionStart()
        app.buttons["newClass.save"].tap()

        let error = app.staticTexts["newClass.timeError"]
        XCTAssertTrue(error.waitUntilExists(timeout: timeout), requestLog)
        let parts = catalog["classes.schedule.errors.timeDoesNotExist"].components(separatedBy: "%1$@")
        XCTAssertTrue(error.label.hasPrefix(parts.first ?? ""), error.label)
        XCTAssertTrue(error.label.hasSuffix(parts.last ?? ""), error.label)
        XCTAssertTrue(error.label.contains("28"), "the date the API named, 28 March: \(error.label)")
        XCTAssertFalse(app.staticTexts["classDate.title"].exists, "nothing was created")
        XCTAssertEqual(server.createdGroupClasses.count, 1)
        XCTAssertTrue(app.staticTexts["newClass.title"].exists, "the form stays as it was")
    }
}
