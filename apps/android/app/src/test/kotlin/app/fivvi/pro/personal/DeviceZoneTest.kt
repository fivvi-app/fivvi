package app.fivvi.pro.personal

import java.time.ZoneId
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Test

// F013 AC14: the zone Vandaag compares with Dutch time comes from the OS's time-zone broadcast.
class DeviceZoneTest {
    @Test
    fun test_F013_AC14_aBroadcastNamesTheZoneItSays() {
        assertEquals(ZoneId.of("America/New_York"), zoneOf("America/New_York"))
        assertEquals("a short ID the runtime knows", ZoneId.of("America/Chicago"), zoneOf("CST"))
    }

    @Test
    fun test_F013_AC14_anIdTheAppCantReadFallsBackToThePhonesZoneInsteadOfCrashing() {
        val phone = TimeZone.getDefault().toZoneId()

        assertEquals("an unknown region", phone, zoneOf("Mars/Olympus_Mons"))
        assertEquals("not an ID at all", phone, zoneOf("not a zone!"))
        assertEquals("no ID", phone, zoneOf(null))
    }
}
