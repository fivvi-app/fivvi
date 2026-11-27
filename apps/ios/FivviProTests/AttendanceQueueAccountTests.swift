import FivviAPI
import XCTest

@testable import FivviPro

/// #1618: whose taps they are. Every sign-in has an account (read from `GET /api/v1/me`, kept on the phone next to the
/// queue); the taps an earlier sign-in left go on only for that same account, and none goes out under another one.
final class AttendanceQueueAccountTests: AttendanceQueuePhoneTestCase {
    // AC3: a launch of the same sign-in that started offline still knows its account.
    func test_F025_1618_aTapOfALaterLaunchOfTheSameSignInStaysTheAccountsAfterARejectedToken() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        // The same sign-in, a new launch that starts offline: `GET /api/v1/me` has not answered in it.
        let second = queue(phone)
        tap(second, "Bram Jansen")
        tokenRejected(phone)

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let third = queue(phone)
        third.learn(account: "account-a")
        await third.flush()

        XCTAssertEqual(
            phone.api.attendance.requests.map(\.clientID),
            ["Anna de Vries", "Bram Jansen"].map(AttendanceFixtures.id), "both sent, in order"
        )
        XCTAssertTrue(third.rejections(sessionID: session).isEmpty, "none of them is refused for want of an account")
    }

    // AC3: a tap without an account takes the account another tap of its sign-in has.
    func test_F025_1618_aTapWithoutAnAccountTakesTheAccountOfAnotherTapOfItsSignIn() async throws {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tap(first, "Bram Jansen")
        // The file as an earlier launch wrote it: Bram's tap has no account and no account is kept for the sign-in.
        let data = try XCTUnwrap(phone.files.read(file))
        var objects = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        objects[1]["account"] = nil
        phone.files.write(try JSONSerialization.data(withJSONObject: objects), as: file)
        phone.files.write(Data("{}".utf8), as: "attendance-accounts.json")
        tokenRejected(phone)

        await signIn(phone, token: "token-a2", account: "account-a")
        phone.online.value = true
        let second = queue(phone)
        second.learn(account: "account-a")
        await second.flush()

        XCTAssertEqual(
            phone.api.attendance.requests.map(\.clientID),
            ["Anna de Vries", "Bram Jansen"].map(AttendanceFixtures.id)
        )
        XCTAssertTrue(second.rejections(sessionID: session).isEmpty)
    }

    func test_F025_1618_theQueueAsksWhoSignedInBeforeItSendsWhatAnEarlierSignInLeft() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        // The same account signs in again; the app did not get to read its account (offline start, then online).
        await signIn(phone, token: "token-a2", account: "account-a")
        let second = queue(phone)
        phone.online.value = true
        await second.flush()

        XCTAssertEqual(phone.api.attendance.requests.map(\.clientID), [AttendanceFixtures.id("Anna de Vries")])
        XCTAssertTrue(second.entries.isEmpty)
    }

    func test_F025_1618_whenTheAccountCannotBeReadTheEarlierSignInsTapsWaitAndNothingGoesOut() async {
        let phone = phone()
        phone.online.value = false
        let first = queue(phone)
        first.learn(account: "account-a")
        tap(first, "Anna de Vries")
        tokenRejected(phone)

        await signIn(phone, token: "token-b", account: "account-b")
        await phone.api.answerMe(with: .offline)
        phone.online.value = true
        let second = queue(phone)
        tap(second, "Bram Jansen")
        await second.flush()

        XCTAssertTrue(phone.api.attendance.requests.isEmpty, "not even the new tap goes before the order is settled")
        XCTAssertTrue(second.isStalled)
        XCTAssertEqual(second.entries.count, 1)
        XCTAssertNotNil(phone.files.read(file))
        let stored = String(data: phone.files.read(file) ?? Data(), encoding: .utf8) ?? ""
        XCTAssertTrue(stored.contains(AttendanceFixtures.id("Anna de Vries")), "the earlier tap stays in the file")
    }
}
