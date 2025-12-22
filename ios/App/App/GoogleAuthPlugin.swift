import Foundation
import Capacitor
import GoogleSignIn

@objc(GoogleAuthPlugin)
public class GoogleAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleAuthPlugin"
    public let jsName = "GoogleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentUser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAccessToken", returnType: CAPPluginReturnPromise),
    ]

    private let driveScope = "https://www.googleapis.com/auth/drive.appdata"

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("No view controller available")
                return
            }

            // Configure additional scopes for Google Drive
            let additionalScopes = [self.driveScope]

            GIDSignIn.sharedInstance.signIn(
                withPresenting: viewController,
                hint: nil,
                additionalScopes: additionalScopes
            ) { result, error in
                if let error = error {
                    call.reject("Sign in failed: \(error.localizedDescription)")
                    return
                }

                guard let user = result?.user else {
                    call.reject("No user returned")
                    return
                }

                call.resolve(self.userToDict(user))
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve(["success": true])
    }

    @objc func getCurrentUser(_ call: CAPPluginCall) {
        if let user = GIDSignIn.sharedInstance.currentUser {
            // Refresh token if needed
            user.refreshTokensIfNeeded { user, error in
                if let error = error {
                    call.reject("Failed to refresh token: \(error.localizedDescription)")
                    return
                }

                if let user = user {
                    call.resolve(self.userToDict(user))
                } else {
                    call.resolve(["user": NSNull()])
                }
            }
        } else {
            // Try to restore previous sign-in
            GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
                if let user = user {
                    call.resolve(self.userToDict(user))
                } else {
                    call.resolve(["user": NSNull()])
                }
            }
        }
    }

    @objc func getAccessToken(_ call: CAPPluginCall) {
        guard let user = GIDSignIn.sharedInstance.currentUser else {
            call.reject("No user signed in")
            return
        }

        user.refreshTokensIfNeeded { user, error in
            if let error = error {
                call.reject("Failed to refresh token: \(error.localizedDescription)")
                return
            }

            if let accessToken = user?.accessToken.tokenString {
                call.resolve(["accessToken": accessToken])
            } else {
                call.reject("No access token available")
            }
        }
    }

    private func userToDict(_ user: GIDGoogleUser) -> [String: Any] {
        var dict: [String: Any] = [
            "id": user.userID ?? "",
            "accessToken": user.accessToken.tokenString
        ]

        if let profile = user.profile {
            dict["email"] = profile.email
            dict["displayName"] = profile.name ?? ""
            dict["photoURL"] = profile.imageURL(withDimension: 200)?.absoluteString ?? ""
        }

        return dict
    }
}
