import SwiftUI
import FivviAPI
import FivviDesignTokens

/// TM-01: one screen with two steps, the email step and the code step. Colours and text styles come from the design
/// tokens, text from the catalog; text wraps and every control keeps a 44 pt touch target.
struct SignInView: View {
    @State private var model: SignInViewModel
    private let language: AppLanguage
    @FocusState private var focus: Field?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private enum Field {
        case email, code
    }

    init(
        api: any APIProtocol, store: any SessionStore, language: AppLanguage, afterRejection: Bool,
        onSignedIn: @escaping () -> Void
    ) {
        _model = State(initialValue: SignInViewModel(
            api: api, store: store, catalog: language.catalog, showsSignedOutNotice: afterRejection,
            onSignedIn: onSignedIn
        ))
        self.language = language
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space6) {
                languageSwitch
                Text(model.catalog[.signInTitle])
                    .font(.system(Tokens.TextStyle.display, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("signIn.title")
                if model.showsSignedOutNotice {
                    Text(model.catalog[.signInSignedOutNotice])
                        .font(.system(Tokens.TextStyle.body))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("signIn.notice")
                }
                step
                if let message = model.failureText {
                    messageCard(
                        message, foreground: Tokens.Colors.statusDangerFg, background: Tokens.Colors.bgSurface,
                        id: "signIn.error"
                    )
                    if model.canRetry {
                        Button {
                            Task { await model.retry() }
                        } label: {
                            Text(model.catalog[.commonRetry])
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("signIn.retry")
                    }
                }
            }
            .padding(Tokens.Spacing.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // The number pad has no key that hides it: dragging the form does (and shows the buttons under it).
        .scrollDismissesKeyboard(.immediately)
        .foregroundStyle(Tokens.Colors.textPrimary)
        .background(Tokens.Colors.bgCanvas)
        .environment(\.locale, model.catalog.formattingLocale)
        .onChange(of: language.catalog) { _, catalog in model.use(catalog) }
        .onChange(of: model.state) { _, state in
            switch state {
            case .enteringCode: focus = .code
            case .enteringEmail: focus = .email
            case .sendingCode, .checkingCode, .resendingCode: break
            }
        }
        .onChange(of: model.code) {
            if model.isCodeComplete { Task { await model.submitCode() } }
        }
    }

    /// *Nederlands | English* (F010): the choice re-renders the screen at once and is kept on the phone; the sign-in email
    /// follows it, and signing in saves it on the account.
    private var languageSwitch: some View {
        // At accessibility text sizes the two names don't fit next to each other: they stack.
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Tokens.Spacing.space2))
            : AnyLayout(HStackLayout(spacing: Tokens.Spacing.space2))
        return layout {
            ForEach(Components.Schemas.Locale.allCases, id: \.self) { locale in
                LanguageOptionButton(
                    title: model.catalog[locale.languageNameKey], isSelected: language.catalog.locale == locale,
                    id: "signIn.language.\(locale.rawValue)"
                ) { language.choose(locale) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(model.catalog[.signInLanguageLabel])
        .accessibilityIdentifier("signIn.language")
    }

    @ViewBuilder private var step: some View {
        switch model.state {
        case .enteringEmail, .sendingCode:
            emailStep
        case .enteringCode, .checkingCode, .resendingCode:
            codeStep
        }
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            fieldLabel(.signInEmailLabel)
            TextField(model.catalog[.signInEmailLabel], text: $model.email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .accessibilityLabel(model.catalog[.signInEmailLabel])
                .focused($focus, equals: .email)
                .textFieldFrame()
                .disabled(model.state == .sendingCode)
                .onSubmit { Task { await model.requestCode() } }
                .accessibilityIdentifier("signIn.email")
            if model.state == .sendingCode {
                loading
            } else {
                Button {
                    Task { await model.requestCode() }
                } label: {
                    Text(model.catalog[.signInSendCode])
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.primaryAction)
                .accessibilityIdentifier("signIn.send")
            }
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            Text(model.catalog[.signInCheckEmailTitle])
                .font(.system(Tokens.TextStyle.title2, weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(model.checkEmailText)
                .font(.system(Tokens.TextStyle.body))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("signIn.checkEmail")
            fieldLabel(.signInCodeLabel)
            TextField(model.catalog[.signInCodeLabel], text: Binding(get: { model.code }, set: { model.enterCode($0) }))
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .autocorrectionDisabled()
                .accessibilityLabel(model.catalog[.signInCodeLabel])
                .focused($focus, equals: .code)
                .textFieldFrame()
                .disabled(model.state == .checkingCode || model.state == .resendingCode)
                .accessibilityIdentifier("signIn.code")
            Text(model.catalog[.signInCodeHelp])
                .font(.system(Tokens.TextStyle.footnote))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let resent = model.resentText {
                messageCard(
                    resent, foreground: Tokens.Colors.statusSuccessFg, background: Tokens.Colors.statusSuccessBg,
                    id: "signIn.resent"
                )
            }
            if model.state == .checkingCode || model.state == .resendingCode {
                loading
            } else {
                codeActions
            }
        }
    }

    /// Check the code, ask for a new email, or go back to change the address.
    @ViewBuilder private var codeActions: some View {
        Button {
            Task { await model.submitCode() }
        } label: {
            Text(model.catalog[.signInSubmitCode])
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.primaryAction)
        .disabled(!model.isCodeComplete)
        .accessibilityIdentifier("signIn.submit")
        Button {
            Task { await model.resendCode() }
        } label: {
            Text(model.catalog[.signInResend])
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.secondaryAction)
        .accessibilityIdentifier("signIn.resend")
        Button {
            model.changeEmail()
        } label: {
            Text(model.catalog[.signInChangeEmail])
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.secondaryAction)
        .accessibilityIdentifier("signIn.changeEmail")
    }

    /// A message under the form: a rounded surface that wraps its text.
    private func messageCard(_ text: String, foreground: Color, background: Color, id: String) -> some View {
        Text(text)
            .font(.system(Tokens.TextStyle.body))
            .foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(Tokens.Spacing.space3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous))
            .accessibilityIdentifier(id)
    }

    private func fieldLabel(_ key: StringKey) -> some View {
        Text(model.catalog[key])
            .font(.system(Tokens.TextStyle.label, weight: .semibold))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityHidden(true)
    }

    private var loading: some View {
        ProgressView()
            .tint(Tokens.Colors.textSecondary)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(model.catalog[.commonLoading])
            .accessibilityIdentifier("signIn.loading")
    }
}
