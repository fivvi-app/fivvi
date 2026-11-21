package app.fivvi.pro

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The screens above the home (F020): a stack that survives a rotation as one string, and system back pops one.
class RoutesTest {
    private val id = UUID.nameUUIDFromBytes("session".toByteArray())

    @Test
    fun test_F020_AC10_aSavedSessionReplacesTheFormSoBackIsTheHome() {
        var stack = Routes.push("", Routes.NEW_SESSION)

        stack = Routes.push(Routes.pop(stack), Routes.session(id))

        assertEquals(listOf("session/$id"), Routes.of(stack))
        assertEquals("", Routes.pop(stack))
    }

    @Test
    fun test_F020_AC9_aSessionOpenedFromTheProfileGoesBackToKlanten() {
        val stack = Routes.push(Routes.push("", Routes.CLIENTS), Routes.session(id))

        assertEquals(listOf(Routes.CLIENTS, "session/$id"), Routes.of(stack))
        assertEquals(listOf(Routes.CLIENTS), Routes.of(Routes.pop(stack)))
    }

    @Test
    fun test_F020_AC10_theIdsOfARouteAreReadBack() {
        assertEquals(id, Routes.sessionId(Routes.session(id)))
        assertEquals(id, Routes.clientId(Routes.client(id)))
        assertNull(Routes.sessionId(Routes.client(id)))
        assertNull(Routes.clientId(Routes.CLIENTS))
        assertNull(Routes.sessionId(Routes.NEW_SESSION))
    }

    @Test
    fun test_F020_AC10_anEmptyStackHasNoScreenAboveTheHome() {
        assertEquals(emptyList<String>(), Routes.of(""))
        assertEquals("", Routes.pop(""))
    }

    @Test
    fun test_F021_AC6_aSavedClassReplacesTheFormSoBackIsTheHome() {
        var stack = Routes.push("", Routes.NEW_CLASS)

        stack = Routes.push(Routes.pop(stack), Routes.classDate(id, added = 1))

        assertEquals(listOf("classDateNew/1/$id"), Routes.of(stack))
        assertEquals("", Routes.pop(stack))
    }

    @Test
    fun test_F021_AC3_aClassDateRouteGivesBackItsIdAndHowManyDatesWereJustAdded() {
        assertEquals(id to 1, Routes.classDateOf(Routes.classDate(id, added = 1)))
        assertEquals(id to 12, Routes.classDateOf(Routes.classDate(id, added = 12)))
        assertEquals(id to null, Routes.classDateOf(Routes.classDate(id, added = null)))
        assertNull(Routes.classDateOf(Routes.NEW_CLASS))
        assertNull(Routes.classDateOf(Routes.session(id)))
        assertNull(Routes.sessionId(Routes.classDate(id, added = null)))
    }
}
