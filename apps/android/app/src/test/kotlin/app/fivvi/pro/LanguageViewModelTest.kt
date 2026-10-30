package app.fivvi.pro

import app.fivvi.api.models.MeResponse
import app.fivvi.api.models.UpdateMeRequest
import app.fivvi.pro.home.FakeMeApi
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LanguageViewModelTest {
    private val api = FakeMeApi()
    private val store = InMemoryLanguageStore()
    private val settings = FakeLanguageSettings(device = listOf("en-GB"))
    private val preference = LanguagePreference(store, settings)
    private val viewModel by lazy { LanguageViewModel(api, preference) }

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun test_F010_AC3_inAppSwitchRerendersAndSaves() {
        viewModel.choose(AppLanguage.DUTCH)

        assertEquals(AppLanguage.DUTCH, viewModel.language.value)
        assertEquals(listOf(UpdateMeRequest(UpdateMeRequest.PreferredLocale.NL_NL)), api.updates)
        assertEquals(null, preference.unsavedChoice)
        assertFalse(viewModel.saveFailed.value)
    }

    @Test
    fun test_F010_AC3_theChoiceStaysWhenSavingFailsAndIsSavedAtTheNextForeground() {
        api.updateFailure = IOException("offline")
        viewModel.choose(AppLanguage.DUTCH)
        assertEquals(AppLanguage.DUTCH, viewModel.language.value)
        assertTrue(viewModel.saveFailed.value)

        api.updateFailure = null
        api.answerAccount(preferredLocale = MeResponse.PreferredLocale.EN)
        viewModel.refresh()

        assertEquals(AppLanguage.DUTCH, viewModel.language.value)
        assertEquals(2, api.updates.size)
        assertFalse(viewModel.saveFailed.value)
    }

    @Test
    fun test_F010_AC2_adoptsStoredPreferenceOnForeground() {
        store.stored = AppLanguage.DUTCH
        val shown = LanguagePreference(store, settings)
        val model = LanguageViewModel(api, shown)
        assertEquals(AppLanguage.DUTCH, model.language.value)

        api.answerAccount(preferredLocale = MeResponse.PreferredLocale.EN)
        model.refresh()

        assertEquals(AppLanguage.ENGLISH, model.language.value)
        assertEquals(emptyList<UpdateMeRequest>(), api.updates)
        assertEquals(null, store.choice)
    }

    @Test
    fun test_F010_AC2_adoptsTheStoredPreferenceWhateverTheDeviceLanguage() {
        viewModel.onStored(MeResponse.PreferredLocale.NL_NL)

        assertEquals(AppLanguage.DUTCH, viewModel.language.value)
    }

    @Test
    fun test_F010_AC5_aChoiceMadeBeforeSignInIsSavedInsteadOfTheStoredPreference() {
        preference.choose(AppLanguage.ENGLISH)

        viewModel.onStored(MeResponse.PreferredLocale.NL_NL)

        assertEquals(AppLanguage.ENGLISH, viewModel.language.value)
        assertEquals(listOf(UpdateMeRequest(UpdateMeRequest.PreferredLocale.EN)), api.updates)
    }

    @Test
    fun aLostConnectionOnForegroundChangesNothing() {
        store.stored = AppLanguage.DUTCH
        val model = LanguageViewModel(api, LanguagePreference(store, settings))
        api.answers += { throw IOException("offline") }

        model.refresh()

        assertEquals(AppLanguage.DUTCH, model.language.value)
    }
}
