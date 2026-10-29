package app.fivvi.pro.home

import org.junit.Assert.assertEquals
import org.junit.Test

class WebLinksTest {
    @Test
    fun test_F002_AC10_welcomeIsOnTheWebServerThatServesTheApi() {
        assertEquals("https://app.example.com/welcome", WebLinks.welcomeUrl("https://app.example.com/api/"))
        assertEquals("http://10.0.2.2:3000/welcome", WebLinks.welcomeUrl("http://10.0.2.2:3000/api/"))
        assertEquals("https://app.example.com/welcome", WebLinks.welcomeUrl("https://app.example.com/api"))
    }
}
