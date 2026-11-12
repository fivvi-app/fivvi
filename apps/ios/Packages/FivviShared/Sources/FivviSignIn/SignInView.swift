import SwiftUI
import FivviAPI
import FivviDesignTokens
import FivviLanguage
import FivviSession
import FivviStrings
import FivviUI

/// The app's day dial above the title (E020 #629): an image of the app with its accessible name. Each app passes its
/// own (Fivvi Pro: the day dial with PRO), so the screen shows no letter mark.
public struct SignInLogo {
    public let image: Image
    /// The accessible name, a catalog text.
    public let label: String

    public init(image: Image, label: String) {
        self.image = image
        self.label = label
    }
}

/// TM-01: one screen with two steps, the email step and the code step. Colours and text styles come from the design
/// tokens, text from the catalog; text wraps and every control keeps a 44 pt touch target. The dial (84 pt, 64 pt on
/// the code step) sits centred above the title; the fields are in an inset group and the buttons are the kit's pills.
public struct SignInView: View {
    @State private var model: SignInViewModel
    private let language: AppLanguage
    private let logo: (Catalog) -> SignInLogo
    @FocusState private var focus: Field?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private enum Field {
        case email, code
    }

    public init(
        api: any APIProtocol, store: any SessionStore, language: AppLanguage, afterRejection: Bool,
        logo: @escaping (Catalog) -> SignInLogo, onSignedIn: @escaping () -> Void
    ) {
        _model = State(initialValue: SignInViewModel(
            api: api, store: store, catalog: language.catalog, showsSignedOutNotice: afterRejection,
            onSignedIn: onSignedIn
        ))
        self.language = language
        self.logo = logo
    }

    private enum Metrics {
        static let emailStepLogo: CGFloat = 84
        static let codeStepLogo: CGFloat = 64
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space5) {
                languageSwitch
                header
                if model.showsSignedOutNotice {
                    Text(model.catalog[.signInSignedOutNotice])
                        .font(.system(Tokens.TextStyle.body))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("signIn.notice")
                }
                step
                if let message = model.failureText {
                    StatusMessage(text: message, kind: .error, id: "signIn.error")
                    if model.canRetry {
                        PillButtonStack {
                            Button {
                                Task { await model.retry() }
                            } label: {
                                pillLabel(model.catalog[.commonRetry])
                            }
                            .buttonStyle(.pill(.tonal))
                            .accessibilityIdentifier("signIn.retry")
                        }
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

    /// The dial and the heading of the step: the title on the email step, *Check je e-mail* on the code step.
    private var header: some View {
        let onCodeStep = isCodeStep
        let mark = logo(model.catalog)
        let size = onCodeStep ? Metrics.codeStepLogo : Metrics.emailStepLogo
        return VStack(spacing: Tokens.Spacing.space4) {
            mark.image
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityLabel(mark.label)
                .accessibilityAddTraits(.isImage)
                .accessibilityIdentifier("signIn.logo")
            Text(model.catalog[onCodeStep ? .signInCheckEmailTitle : .signInTitle])
                .font(.system(Tokens.TextStyle.title1, weight: .bold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier(onCodeStep ? "signIn.checkEmailTitle" : "signIn.title")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tokens.Spacing.space4)
    }

    private var isCodeStep: Bool {
        switch model.state {
        case .enteringCode, .checkingCode, .resendingCode: true
        case .enteringEmail, .sendingCode: false
        }
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            InsetGroup {
                FormField(label: model.catalog[.signInEmailLabel]) {
                    TextField(model.catalog[.signInEmailLabel], text: $model.email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .focused($focus, equals: .email)
                        .textFieldStyle(.plain)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                        .disabled(model.state == .sendingCode)
                        .onSubmit { Task { await model.requestCode() } }
                        .accessibilityIdentifier("signIn.email")
                }
            }
            if model.state == .sendingCode {
                loading
            } else {
                PillButtonStack {
                    Button {
                        Task { await model.requestCode() }
                    } label: {
                        pillLabel(model.catalog[.signInSendCode])
                    }
                    .buttonStyle(.pill(.filled))
                    .accessibilityIdentifier("signIn.send")
                }
            }
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: Tokens.Spacing.space4) {
            Text(model.checkEmailText)
                .font(.system(Tokens.TextStyle.body))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("signIn.checkEmail")
            InsetGroup(footer: model.catalog[.signInCodeHelp]) {
                FormField(label: model.catalog[.signInCodeLabel]) {
                    TextField(
                        model.catalog[.signInCodeLabel],
                        text: Binding(get: { model.code }, set: { model.enterCode($0) })
                    )
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .code)
                    .textFieldStyle(.plain)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                    .disabled(model.state == .checkingCode || model.state == .resendingCode)
                    .accessibilityIdentifier("signIn.code")
                }
            }
            if let resent = model.resentText {
                StatusMessage(text: resent, kind: .success, id: "signIn.resent")
            }
            if model.state == .checkingCode || model.state == .resendingCode {
                loading
            } else {
                codeActions
            }
        }
    }

    /// Check the code, ask for a new email, or go back to change the address.
    private var codeActions: some View {
        PillButtonStack {
            Button {
                Task { await model.submitCode() }
            } label: {
                pillLabel(model.catalog[.signInSubmitCode])
            }
            .buttonStyle(.pill(.filled))
            .disabled(!model.isCodeComplete)
            .accessibilityIdentifier("signIn.submit")
            Button {
                Task { await model.resendCode() }
            } label: {
                pillLabel(model.catalog[.signInResend])
            }
            .buttonStyle(.pill(.tonal))
            .accessibilityIdentifier("signIn.resend")
            Button {
                model.changeEmail()
            } label: {
                pillLabel(model.catalog[.signInChangeEmail])
            }
            .buttonStyle(.pill(.tonal))
            .accessibilityIdentifier("signIn.changeEmail")
        }
    }

    private func pillLabel(_ text: String) -> some View {
        Text(text)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }

    private var loading: some View {
        ProgressView()
            .tint(Tokens.Colors.textSecondary)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(model.catalog[.commonLoading])
            .accessibilityIdentifier("signIn.loading")
    }
}
