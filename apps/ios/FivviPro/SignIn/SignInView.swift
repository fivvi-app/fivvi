import SwiftUI
import FivviAPI
import FivviDesignTokens

/// TM-01: one screen with two steps, the email step and the code step. Colours and text styles come from the design
/// tokens, text from the catalog; text wraps and every control keeps a 44 pt touch target.
struct SignInView: View {
    @State private var model: SignInViewModel
    @FocusState private var focus: Field?

    private enum Field {
        case email, code
    }

    init(
        api: any APIProtocol, store: any SessionStore, catalog: Catalog, afterRejection: Bool,
        onSignedIn: @escaping () -> Void
    ) {
        _model = State(initialValue: SignInViewModel(
            api: api, store: store, catalog: catalog, showsSignedOutNotice: afterRejection, onSignedIn: onSignedIn
        ))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Spacing.space6) {
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
                    Text(message)
                        .font(.system(Tokens.TextStyle.body))
                        .foregroundStyle(Tokens.Colors.statusDangerFg)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(Tokens.Spacing.space3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            Tokens.Colors.bgSurface,
                            in: RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous)
                        )
                        .accessibilityIdentifier("signIn.error")
                }
            }
            .padding(Tokens.Spacing.gutter)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(Tokens.Colors.textPrimary)
        .background(Tokens.Colors.bgCanvas)
        .environment(\.locale, model.catalog.formattingLocale)
        .onChange(of: model.state) { _, state in
            if state == .enteringCode { focus = .code }
        }
        .onChange(of: model.code) {
            if model.isCodeComplete { Task { await model.submitCode() } }
        }
    }

    @ViewBuilder private var step: some View {
        switch model.state {
        case .enteringEmail, .sendingCode:
            emailStep
        case .enteringCode, .checkingCode:
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
                .focused($focus, equals: .code)
                .textFieldFrame()
                .disabled(model.state == .checkingCode)
                .accessibilityIdentifier("signIn.code")
            Text(model.catalog[.signInCodeHelp])
                .font(.system(Tokens.TextStyle.footnote))
                .foregroundStyle(Tokens.Colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if model.state == .checkingCode {
                loading
            } else {
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
            }
        }
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
