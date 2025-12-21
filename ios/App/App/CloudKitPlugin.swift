import Foundation
import Capacitor
import CloudKit
import AuthenticationServices

@objc(CloudKitPlugin)
public class CloudKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudKitPlugin"
    public let jsName = "CloudKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithGoogle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentUser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveMemory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateMemory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteMemory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchMemories", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteMedia", returnType: CAPPluginReturnPromise),
    ]

    private let container = CKContainer(identifier: "iCloud.com.short.memorykeeper")
    private lazy var privateDatabase = container.privateCloudDatabase
    private let recordType = "Memory"
    private let zoneID = CKRecordZone.ID(zoneName: "MemoriesZone", ownerName: CKCurrentUserDefaultName)
    private var zoneCreated = false

    // Store the current Sign in with Apple call for the delegate
    private var currentAppleSignInCall: CAPPluginCall?

    // Google OAuth configuration
    private var webAuthSession: ASWebAuthenticationSession?
    private let googleClientId = "365508176942-9ktfp75ojfisdip3kdj7tb2gj5u2q2vb.apps.googleusercontent.com"
    private let googleScopes = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"

    // MARK: - Initialize

    @objc func initialize(_ call: CAPPluginCall) {
        createZoneIfNeeded { [weak self] error in
            if let error = error {
                call.reject("Failed to initialize CloudKit: \(error.localizedDescription)")
                return
            }
            self?.zoneCreated = true
            call.resolve(["success": true])
        }
    }

    private func createZoneIfNeeded(completion: @escaping (Error?) -> Void) {
        let zone = CKRecordZone(zoneID: zoneID)
        let operation = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)

        operation.modifyRecordZonesResultBlock = { result in
            switch result {
            case .success:
                completion(nil)
            case .failure(let error):
                if let ckError = error as? CKError, ckError.code == .serverRejectedRequest {
                    completion(nil)
                } else {
                    completion(error)
                }
            }
        }

        privateDatabase.add(operation)
    }

    // MARK: - Sign in with Apple

    @objc func signInWithApple(_ call: CAPPluginCall) {
        currentAppleSignInCall = call

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.email, .fullName]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    // MARK: - Sign in with Google

    @objc func signInWithGoogle(_ call: CAPPluginCall) {
        // Get client ID from call or use configured one
        let clientId = call.getString("clientId") ?? googleClientId

        if clientId == "YOUR_GOOGLE_IOS_CLIENT_ID" || clientId.isEmpty {
            call.reject("Google Client ID not configured")
            return
        }

        // Build the OAuth URL - use reversed client ID as scheme
        let clientIdPrefix = clientId.components(separatedBy: ".").first ?? ""
        let redirectScheme = "com.googleusercontent.apps.\(clientIdPrefix)"
        let redirectUri = "\(redirectScheme):/oauthredirect"

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "token"),
            URLQueryItem(name: "scope", value: googleScopes),
            URLQueryItem(name: "include_granted_scopes", value: "true"),
        ]

        guard let authURL = components.url else {
            call.reject("Failed to build auth URL")
            return
        }

        // Use ASWebAuthenticationSession for secure OAuth
        webAuthSession = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: redirectScheme
        ) { [weak self] callbackURL, error in
            if let error = error {
                if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                    call.reject("Sign in cancelled")
                } else {
                    call.reject("Sign in failed: \(error.localizedDescription)")
                }
                return
            }

            guard let callbackURL = callbackURL,
                  let fragment = callbackURL.fragment else {
                call.reject("No callback URL received")
                return
            }

            // Parse the access token from the fragment
            let params = fragment.components(separatedBy: "&").reduce(into: [String: String]()) { result, param in
                let parts = param.components(separatedBy: "=")
                if parts.count == 2 {
                    result[parts[0]] = parts[1].removingPercentEncoding
                }
            }

            guard let accessToken = params["access_token"] else {
                call.reject("No access token in response")
                return
            }

            // Fetch user info with the access token
            self?.fetchGoogleUserInfo(accessToken: accessToken, call: call)
        }

        webAuthSession?.presentationContextProvider = self
        webAuthSession?.prefersEphemeralWebBrowserSession = false
        webAuthSession?.start()
    }

    private func fetchGoogleUserInfo(accessToken: String, call: CAPPluginCall) {
        guard let url = URL(string: "https://www.googleapis.com/oauth2/v3/userinfo") else {
            call.reject("Invalid userinfo URL")
            return
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Failed to fetch user info: \(error.localizedDescription)")
                    return
                }

                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    call.reject("Failed to parse user info")
                    return
                }

                let userId = json["sub"] as? String ?? ""
                let email = json["email"] as? String
                let name = json["name"] as? String
                let picture = json["picture"] as? String

                // Store credentials
                let userDefaults = UserDefaults.standard
                userDefaults.set(userId, forKey: "googleUserId")
                userDefaults.set(accessToken, forKey: "googleAccessToken")
                if let email = email {
                    userDefaults.set(email, forKey: "googleUserEmail")
                }
                if let name = name {
                    userDefaults.set(name, forKey: "googleUserName")
                }
                if let picture = picture {
                    userDefaults.set(picture, forKey: "googleUserPicture")
                }

                call.resolve([
                    "user": [
                        "id": userId,
                        "email": email as Any,
                        "displayName": name as Any,
                        "photoURL": picture as Any,
                        "provider": "google"
                    ],
                    "accessToken": accessToken
                ])
            }
        }.resume()
    }

    @objc func getCurrentUser(_ call: CAPPluginCall) {
        let userDefaults = UserDefaults.standard

        // First check for Google credentials
        if let googleUserId = userDefaults.string(forKey: "googleUserId") {
            let email = userDefaults.string(forKey: "googleUserEmail")
            let name = userDefaults.string(forKey: "googleUserName")
            let picture = userDefaults.string(forKey: "googleUserPicture")
            let accessToken = userDefaults.string(forKey: "googleAccessToken")
            call.resolve([
                "user": [
                    "id": googleUserId,
                    "email": email as Any,
                    "displayName": name as Any,
                    "photoURL": picture as Any,
                    "provider": "google"
                ],
                "accessToken": accessToken as Any
            ])
            return
        }

        // Check for Apple credentials
        guard let appleUserId = userDefaults.string(forKey: "appleUserId") else {
            call.resolve(["user": NSNull()])
            return
        }

        // Verify the Apple credential is still valid
        let provider = ASAuthorizationAppleIDProvider()
        provider.getCredentialState(forUserID: appleUserId) { state, error in
            DispatchQueue.main.async {
                switch state {
                case .authorized:
                    let email = userDefaults.string(forKey: "appleUserEmail")
                    let name = userDefaults.string(forKey: "appleUserName")
                    call.resolve([
                        "user": [
                            "id": appleUserId,
                            "email": email as Any,
                            "displayName": name as Any,
                            "provider": "apple"
                        ]
                    ])
                default:
                    // Credential revoked or not found
                    userDefaults.removeObject(forKey: "appleUserId")
                    userDefaults.removeObject(forKey: "appleUserEmail")
                    userDefaults.removeObject(forKey: "appleUserName")
                    call.resolve(["user": NSNull()])
                }
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        let userDefaults = UserDefaults.standard
        // Clear Apple credentials
        userDefaults.removeObject(forKey: "appleUserId")
        userDefaults.removeObject(forKey: "appleUserEmail")
        userDefaults.removeObject(forKey: "appleUserName")
        // Clear Google credentials
        userDefaults.removeObject(forKey: "googleUserId")
        userDefaults.removeObject(forKey: "googleUserEmail")
        userDefaults.removeObject(forKey: "googleUserName")
        userDefaults.removeObject(forKey: "googleUserPicture")
        userDefaults.removeObject(forKey: "googleAccessToken")
        call.resolve(["success": true])
    }

    // MARK: - Save Memory

    @objc func saveMemory(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("Missing required field: text")
            return
        }

        let tags = call.getArray("tags", String.self) ?? []
        let mediaJson = call.getString("media") ?? "[]"

        let recordID = CKRecord.ID(recordName: UUID().uuidString, zoneID: zoneID)
        let record = CKRecord(recordType: recordType, recordID: recordID)

        record["text"] = text as CKRecordValue
        record["tags"] = tags as CKRecordValue
        record["media"] = mediaJson as CKRecordValue
        record["createdAt"] = Date() as CKRecordValue
        record["updatedAt"] = Date() as CKRecordValue

        privateDatabase.save(record) { savedRecord, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Failed to save memory: \(error.localizedDescription)")
                    return
                }

                guard let savedRecord = savedRecord else {
                    call.reject("No record returned after save")
                    return
                }

                call.resolve(self.recordToDict(savedRecord))
            }
        }
    }

    // MARK: - Update Memory

    @objc func updateMemory(_ call: CAPPluginCall) {
        guard let recordId = call.getString("id") else {
            call.reject("Missing required field: id")
            return
        }

        let recordID = CKRecord.ID(recordName: recordId, zoneID: zoneID)

        privateDatabase.fetch(withRecordID: recordID) { [weak self] record, error in
            guard let self = self else { return }

            if let error = error {
                DispatchQueue.main.async {
                    call.reject("Failed to fetch memory: \(error.localizedDescription)")
                }
                return
            }

            guard let record = record else {
                DispatchQueue.main.async {
                    call.reject("Memory not found")
                }
                return
            }

            if let text = call.getString("text") {
                record["text"] = text as CKRecordValue
            }
            if let tags = call.getArray("tags", String.self) {
                record["tags"] = tags as CKRecordValue
            }
            if let mediaJson = call.getString("media") {
                record["media"] = mediaJson as CKRecordValue
            }
            record["updatedAt"] = Date() as CKRecordValue

            self.privateDatabase.save(record) { savedRecord, error in
                DispatchQueue.main.async {
                    if let error = error {
                        call.reject("Failed to update memory: \(error.localizedDescription)")
                        return
                    }

                    guard let savedRecord = savedRecord else {
                        call.reject("No record returned after update")
                        return
                    }

                    call.resolve(self.recordToDict(savedRecord))
                }
            }
        }
    }

    // MARK: - Delete Memory

    @objc func deleteMemory(_ call: CAPPluginCall) {
        guard let recordId = call.getString("id") else {
            call.reject("Missing required field: id")
            return
        }

        let recordID = CKRecord.ID(recordName: recordId, zoneID: zoneID)

        privateDatabase.delete(withRecordID: recordID) { deletedRecordID, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Failed to delete memory: \(error.localizedDescription)")
                    return
                }

                call.resolve(["success": true, "id": recordId])
            }
        }
    }

    // MARK: - Fetch Memories

    @objc func fetchMemories(_ call: CAPPluginCall) {
        let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
        query.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

        let operation = CKQueryOperation(query: query)
        operation.zoneID = zoneID

        var memories: [[String: Any]] = []

        operation.recordMatchedBlock = { recordID, result in
            switch result {
            case .success(let record):
                memories.append(self.recordToDict(record))
            case .failure(let error):
                print("Error fetching record: \(error.localizedDescription)")
            }
        }

        operation.queryResultBlock = { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve(["memories": memories])
                case .failure(let error):
                    call.reject("Failed to fetch memories: \(error.localizedDescription)")
                }
            }
        }

        privateDatabase.add(operation)
    }

    // MARK: - Upload Media

    @objc func uploadMedia(_ call: CAPPluginCall) {
        guard let base64Data = call.getString("data"),
              let fileName = call.getString("fileName"),
              let mimeType = call.getString("mimeType") else {
            call.reject("Missing required fields: data, fileName, mimeType")
            return
        }

        guard let data = Data(base64Encoded: base64Data) else {
            call.reject("Invalid base64 data")
            return
        }

        let tempDir = FileManager.default.temporaryDirectory
        let fileId = UUID().uuidString
        let fileExtension = (fileName as NSString).pathExtension
        let tempURL = tempDir.appendingPathComponent("\(fileId).\(fileExtension)")

        do {
            try data.write(to: tempURL)
        } catch {
            call.reject("Failed to write temp file: \(error.localizedDescription)")
            return
        }

        var mediaType = "image"
        if mimeType.starts(with: "audio/") {
            mediaType = "audio"
        } else if mimeType.starts(with: "video/") {
            mediaType = "video"
        }

        guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.short.memorykeeper") else {
            call.reject("iCloud not available")
            return
        }

        let documentsURL = containerURL.appendingPathComponent("Documents")
        let mediaDir = documentsURL.appendingPathComponent("media")

        do {
            try FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
        } catch {
            call.reject("Failed to create media directory: \(error.localizedDescription)")
            return
        }

        let destURL = mediaDir.appendingPathComponent("\(fileId).\(fileExtension)")

        do {
            try FileManager.default.copyItem(at: tempURL, to: destURL)
            try FileManager.default.removeItem(at: tempURL)
        } catch {
            call.reject("Failed to copy file to iCloud: \(error.localizedDescription)")
            return
        }

        call.resolve([
            "id": fileId,
            "type": mediaType,
            "url": destURL.absoluteString,
            "fileName": fileName,
            "storagePath": "media/\(fileId).\(fileExtension)"
        ])
    }

    // MARK: - Delete Media

    @objc func deleteMedia(_ call: CAPPluginCall) {
        guard let storagePath = call.getString("storagePath") else {
            call.reject("Missing required field: storagePath")
            return
        }

        guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.short.memorykeeper") else {
            call.reject("iCloud not available")
            return
        }

        let documentsURL = containerURL.appendingPathComponent("Documents")
        let fileURL = documentsURL.appendingPathComponent(storagePath)

        do {
            try FileManager.default.removeItem(at: fileURL)
            call.resolve(["success": true])
        } catch {
            call.resolve(["success": true])
        }
    }

    // MARK: - Helpers

    private func recordToDict(_ record: CKRecord) -> [String: Any] {
        var dict: [String: Any] = [
            "id": record.recordID.recordName,
            "cloudRecordId": record.recordID.recordName
        ]

        if let text = record["text"] as? String {
            dict["text"] = text
        }
        if let tags = record["tags"] as? [String] {
            dict["tags"] = tags
        }
        if let mediaJson = record["media"] as? String {
            dict["media"] = mediaJson
        }
        if let createdAt = record["createdAt"] as? Date {
            dict["createdAt"] = ISO8601DateFormatter().string(from: createdAt)
        }
        if let updatedAt = record["updatedAt"] as? Date {
            dict["updatedAt"] = ISO8601DateFormatter().string(from: updatedAt)
        }
        if let modificationDate = record.modificationDate {
            dict["cloudModificationDate"] = ISO8601DateFormatter().string(from: modificationDate)
        }

        return dict
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension CloudKitPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = currentAppleSignInCall else { return }
        currentAppleSignInCall = nil

        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            let userId = credential.user
            let email = credential.email
            let fullName = credential.fullName

            var displayName: String? = nil
            if let givenName = fullName?.givenName {
                displayName = givenName
                if let familyName = fullName?.familyName {
                    displayName = "\(givenName) \(familyName)"
                }
            }

            // Store credentials
            let userDefaults = UserDefaults.standard
            userDefaults.set(userId, forKey: "appleUserId")
            if let email = email {
                userDefaults.set(email, forKey: "appleUserEmail")
            }
            if let name = displayName {
                userDefaults.set(name, forKey: "appleUserName")
            }

            call.resolve([
                "user": [
                    "id": userId,
                    "email": email as Any,
                    "displayName": displayName as Any,
                    "provider": "apple"
                ]
            ])
        } else {
            call.reject("Invalid credential type")
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = currentAppleSignInCall else { return }
        currentAppleSignInCall = nil
        call.reject("Sign in with Apple failed: \(error.localizedDescription)")
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension CloudKitPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.webView?.window ?? UIWindow()
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension CloudKitPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.bridge?.webView?.window ?? UIWindow()
    }
}
