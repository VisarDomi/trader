import Foundation
import Security
import KitCore
import KitNavigation

struct Credentials: Codable, Sendable { var serverURL: String; var token: String }
struct CachedResponse: Codable, Sendable { var value: JSON; var at: Double }
struct ScreenState: Codable, Sendable {
    var query = ""
    var sort = 0
    var anchorKey: String? = nil
    var anchorFraction = 0.0
    var atTop = true
}
struct AppState: Codable, Sendable { var selectedTab = 0 }
struct Diagnostic:Codable,Sendable {var screen:String;var record:String;var rows:Int;var refreshed:Double;var source:String;var phase:String}
enum AppDiagnostics {
    static let writer=BackgroundWriter(url:AppFiles.root.appendingPathComponent("diagnostic.json"),label:"trader-diagnostics")
    static func save(route:Route,content:Content,phase:String){
        let source=Bundle.main.object(forInfoDictionaryKey:"TraderSourceRevision") as? String ?? "development"
        writer.save(json:Diagnostic(screen:route.screen.rawValue,record:route.id,rows:content.sections.reduce(0){$0+$1.rows.count},refreshed:content.refreshed,source:source,phase:phase))
    }
}
struct Startup: Sendable { var state: AppState; var contents: [String: Content]; var paired: Bool }
enum TraderError: Error, Equatable { case pairing, unavailable }

enum AppFiles {
    static var root: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Trader",isDirectory:true) }
    static var bootstrap: URL { FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("TraderPairing.json") }
    static func navigation(_ index:Int) -> URL { root.appendingPathComponent("navigation-\(index).json") }
    static func key(_ route:Route,_ state:ScreenState) -> String { "\(route.screen.rawValue)|\(route.cacheKey)|\(route.id)|\(route.version)|\(state.query)|\(state.sort)" }
    static let roots = [Route(screen:.rankings),Route(screen:.agents),Route(screen:.accounts),Route(screen:.more)]
}

enum Keychain {
    private static let service = "com.visar.Trader.native-access"
    static func read() -> Credentials? {
        #if targetEnvironment(simulator)
        // Unsigned simulator products have no Keychain access group. This test-only store never ships on a phone.
        return try? DurableFile.readJSON(Credentials.self,from:AppFiles.root.appendingPathComponent("simulator-credential.json"))
        #else
        let q:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"primary",kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var item:CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary,&item)==errSecSuccess,let data=item as? Data else{return nil}
        return try? JSONDecoder().decode(Credentials.self,from:data)
        #endif
    }
    static func save(_ credentials:Credentials) throws {
        guard let url=URL(string:credentials.serverURL),url.scheme=="https",url.host != nil,credentials.token.count>=32 else {throw TraderError.pairing}
        #if targetEnvironment(simulator)
        let path=AppFiles.root.appendingPathComponent("simulator-credential.json")
        try DurableFile.writeJSON(credentials,to:path)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
        #else
        let q:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"primary"]
        let data=try JSONEncoder().encode(credentials)
        let status=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if status==errSecItemNotFound {
            var add=q;add[kSecValueData as String]=data;add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(add as CFDictionary,nil)==errSecSuccess else {throw TraderError.pairing}
        } else if status != errSecSuccess {throw TraderError.pairing}
        #endif
    }
}

actor TraderStore {
    static let shared = TraderStore()
    private var credentials:Credentials?
    private var cache:[String:CachedResponse]=[:]
    private let writer=BackgroundWriter(url:AppFiles.root.appendingPathComponent("responses.json"),label:"trader-responses")
    private let session:URLSession
    private var offline = false
    init() {
        let config=URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest=20;config.timeoutIntervalForResource=30
        config.httpCookieStorage=nil;config.urlCache=nil
        session=URLSession(configuration:config)
    }
    func bootstrap() -> Startup {
        credentials=Keychain.read()
        if let seed=try? DurableFile.readJSON(Credentials.self,from:AppFiles.bootstrap) {
            do {try Keychain.save(seed);credentials=seed;try FileManager.default.removeItem(at:AppFiles.bootstrap)} catch {}
        }
        cache=(try? DurableFile.readJSON([String:CachedResponse].self,from:writer.url)) ?? [:]
        let state=(try? DurableFile.readJSON(AppState.self,from:AppFiles.root.appendingPathComponent("app-state.json"))) ?? AppState()
        var contents:[String:Content]=[:]
        for (i,root) in AppFiles.roots.enumerated() {
            var entries=[SavedStack.Entry(route:(try? JSONEncoder().encode(root)) ?? Data(),state:nil)]
            if let stack=try? DurableFile.readJSON(SavedStack.self,from:AppFiles.navigation(i)) {entries += stack.back;entries += stack.forward}
            for entry in entries {
                guard let route=try? JSONDecoder().decode(Route.self,from:entry.route) else{continue}
                let screenState=entry.state.flatMap{try? JSONDecoder().decode(ScreenState.self,from:$0)} ?? ScreenState()
                contents[AppFiles.key(route,screenState)]=cachedContent(route,state:screenState)
            }
        }
        return Startup(state:state,contents:contents,paired:credentials != nil)
    }
    func cachedContent(_ route:Route,state:ScreenState) -> Content {
        let saved=cache[route.cacheKey]
        var c=Presentation.make(route,data:saved?.value ?? .null,query:state.query,sort:state.sort)
        c.refreshed=saved?.at ?? 0
        return c
    }
    func content(_ route:Route,state:ScreenState,refresh:Bool) async throws -> Content {
        if refresh && !route.cacheKey.isEmpty {
            guard !offline else{throw TraderError.unavailable}
            guard let credentials else{throw TraderError.pairing}
            guard let url=URL(string:credentials.serverURL.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+"/api/native/v1/"+route.cacheKey) else{throw TraderError.unavailable}
            var request=URLRequest(url:url)
            request.setValue("Bearer \(credentials.token)",forHTTPHeaderField:"Authorization")
            request.setValue("application/json",forHTTPHeaderField:"Accept")
            let (data,response)=try await session.data(for:request)
            guard let http=response as? HTTPURLResponse else{throw TraderError.unavailable}
            if http.statusCode==401{throw TraderError.pairing}
            guard http.statusCode==200 else{throw TraderError.unavailable}
            let value=try JSONDecoder().decode(JSON.self,from:data)
            cache[route.cacheKey]=CachedResponse(value:value,at:Date().timeIntervalSince1970*1000)
            if cache.count>40 {let oldest=cache.min{$0.value.at<$1.value.at};if let oldest{cache.removeValue(forKey:oldest.key)}}
            writer.save(json:cache)
        }
        return cachedContent(route,state:state)
    }
    func pair(server:String,token:String) throws {
        let c=Credentials(serverURL:server.trimmingCharacters(in:.whitespacesAndNewlines),token:token.trimmingCharacters(in:.whitespacesAndNewlines))
        try Keychain.save(c);credentials=c
    }
    func mutate(_ action:String) async throws {
        guard let credentials else{throw TraderError.pairing}
        let parts=action.split(separator:":",maxSplits:2).map(String.init)
        guard parts.count>=2,["mirror","exclude"].contains(parts[0]) else{throw TraderError.unavailable}
        let url=URL(string:credentials.serverURL+"/api/native/v1/"+parts[0])!
        var r=URLRequest(url:url);r.httpMethod="POST";r.setValue("application/json",forHTTPHeaderField:"Content-Type")
        r.setValue("Bearer \(credentials.token)",forHTTPHeaderField:"Authorization")
        if parts[0]=="mirror" {r.httpBody=try JSONEncoder().encode(["enabled":parts[1]=="on"])}
        else {
            guard parts.count==3 else{throw TraderError.unavailable}
            r.httpBody=try JSONEncoder().encode(JSON.object(["runId":.string(parts[2]),"excluded":.bool(parts[1]=="true")]))
        }
        let (_,response)=try await session.data(for:r)
        guard (response as? HTTPURLResponse)?.statusCode==200 else{throw TraderError.unavailable}
    }
    func flush(){writer.flush()}
    func setOffline(_ value:Bool){offline=value}
}
